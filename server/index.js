import express from 'express';
import cors from 'cors';
import { createClerkClient, verifyToken } from '@clerk/backend';

// Use real Anthropic SDK when API key is present, otherwise fall back to
// the local Claude Code agent SDK (works with Claude Pro subscription)
let callClaude;
if (process.env.ANTHROPIC_API_KEY) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  callClaude = async (text, systemPrompt) => {
    const msg = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: text }],
    });
    return msg.content[0]?.text ?? '';
  };
} else {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  callClaude = async (text, systemPrompt) => {
    let result = '';
    for await (const msg of query({
      prompt: text,
      options: {
        systemPrompt,
        allowedTools: [],
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
      },
    })) {
      if (msg.type === 'result' && msg.subtype === 'success') result = msg.result ?? '';
    }
    return result;
  };
}

const app = express();
const PORT = process.env.PORT || 3001;

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const SYSTEM_PROMPT = `You are a smart daily planning assistant. Given chaotic, unstructured notes, do TWO things:

1. Extract all action items as a structured todo list
2. Provide brief AI recommendations for TODAY and THIS WEEK

Return ONLY valid JSON — no markdown, no code fences, no explanation. Use exactly this structure:
{
  "analysis": {
    "today": "2-3 sentence recommendation of the most important things to do today, based on urgency and deadlines.",
    "thisWeek": "2-3 sentence recommendation of what to plan or begin this week, considering upcoming tasks and goals."
  },
  "todos": [
    {
      "task": "Concise, actionable task description",
      "day": "today | monday | tuesday | wednesday | thursday | friday | saturday | sunday | someday",
      "importance": "high | medium | low",
      "category": "Short label: Work, Health, Errands, Finance, Calls, Personal, etc.",
      "subtasks": ["step 1", "step 2"]
    }
  ]
}

Rules:
- Infer day from context. Default to someday if unclear
- importance: urgent/asap/critical → high; soon/this week → medium; maybe/eventually → low
- subtasks: only add when text implies concrete sub-steps; otherwise use []
- Group related items under the same category
- Keep task text concise and actionable`;

// ── Auth middleware ──────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  // Server-side auth is skipped — frontend Clerk sign-in + private tunnel URL
  // provide sufficient protection for personal use.
  // Re-enable when using a Clerk production instance with a custom domain.
  return next();
}

// ── Job store (in-memory) ────────────────────────────────────────────────────

const jobs = new Map();
const uid  = () => Math.random().toString(36).slice(2, 11);

function processText(jobId, text) {
  const VALID_DAYS = new Set(['today','monday','tuesday','wednesday','thursday','friday','saturday','sunday','someday']);
  const VALID_IMP  = new Set(['high','medium','low']);

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 150000)
  );

  Promise.race([callClaude(text, SYSTEM_PROMPT), timeout])
    .then(resultText => {
      if (!resultText) throw new Error('empty');
      const stripped = resultText.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();
      const start = stripped.indexOf('{');
      const end   = stripped.lastIndexOf('}');
      const parsed = JSON.parse(start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped);

      const rawTodos = Array.isArray(parsed) ? parsed : (parsed?.todos ?? []);
      const todos = rawTodos
        .filter(t => t && typeof t.task === 'string' && t.task.trim())
        .map(t => ({
          task:       String(t.task).trim(),
          day:        VALID_DAYS.has(String(t.day).toLowerCase()) ? String(t.day).toLowerCase() : 'someday',
          importance: VALID_IMP.has(String(t.importance).toLowerCase()) ? String(t.importance).toLowerCase() : 'medium',
          category:   t.category ? String(t.category).trim() : 'General',
          subtasks:   Array.isArray(t.subtasks)
                        ? t.subtasks.filter(s => typeof s === 'string' && s.trim()).map(s => String(s).trim())
                        : [],
        }));

      jobs.set(jobId, { status: 'done', analysis: parsed?.analysis ?? null, todos });
    })
    .catch(err => {
      const msg = err.message === 'timeout'
        ? 'Claude took too long. Try splitting your text into smaller chunks.'
        : err.message === 'empty'
        ? 'The AI returned an empty response. Please try again.'
        : 'Something went wrong. Please try again.';
      jobs.set(jobId, { status: 'error', error: msg });
    });

  // Auto-cleanup after 10 minutes
  setTimeout(() => jobs.delete(jobId), 600000);
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Start a parse job — returns immediately with a jobId
app.post('/api/parse', requireAuth, (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length === 0)
    return res.status(400).json({ error: 'text is required and must be a non-empty string.' });
  if (text.length > 20000)
    return res.status(400).json({ error: 'Text is too long. Please limit to 20,000 characters.' });

  const jobId = uid();
  jobs.set(jobId, { status: 'processing' });
  processText(jobId, text.trim());
  res.json({ jobId });
});

// Poll for job result
app.get('/api/parse/:jobId', requireAuth, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found or expired.' });
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`ChaosToTodos server running on port ${PORT}`);
});
