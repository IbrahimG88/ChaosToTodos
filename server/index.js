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

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/parse', requireAuth, async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'text is required and must be a non-empty string.' });
  }
  if (text.length > 20000) {
    return res.status(400).json({ error: 'Text is too long. Please limit to 20,000 characters.' });
  }

  let resultText = '';
  try {
    resultText = await callClaude(text.trim(), SYSTEM_PROMPT);
  } catch (err) {
    console.error('Claude error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  if (!resultText) {
    return res.status(500).json({ error: 'The AI returned an empty response. Please try again.' });
  }

  let parsed;
  try {
    const stripped = resultText
      .replace(/^```(?:json)?\s*/im, '')
      .replace(/\s*```\s*$/im, '')
      .trim();
    const start = stripped.indexOf('{');
    const end   = stripped.lastIndexOf('}');
    const jsonStr = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('JSON parse failed:', resultText);
    return res.status(500).json({ error: 'The AI returned an unexpected format. Please try again.' });
  }

  const analysis = parsed?.analysis ?? null;
  const rawTodos = Array.isArray(parsed) ? parsed : (parsed?.todos ?? []);

  const VALID_DAYS = new Set(['today','monday','tuesday','wednesday','thursday','friday','saturday','sunday','someday']);
  const VALID_IMP  = new Set(['high','medium','low']);

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

  res.json({ analysis, todos });
});

app.listen(PORT, () => {
  console.log(`ChaosToTodos server running on port ${PORT}`);
});
