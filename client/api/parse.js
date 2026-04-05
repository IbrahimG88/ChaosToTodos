export default async function handler(req, res) {
  const tunnelUrl = process.env.TUNNEL_URL?.replace(/\/$/, '');
  if (!tunnelUrl) {
    return res.status(503).json({ error: 'Server not configured. Start the tunnel and set TUNNEL_URL in Vercel.' });
  }

  const headers = {
    'ngrok-skip-browser-warning': 'true',
    'User-Agent': 'ChaosToTodos-Proxy/1.0',
  };

  // GET /api/parse?jobId=xxx  →  poll for result
  if (req.method === 'GET') {
    const { jobId } = req.query;
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

    try {
      const upstream = await fetch(`${tunnelUrl}/api/parse/${jobId}`, { headers });
      const text = await upstream.text();
      try {
        res.status(upstream.status).json(JSON.parse(text));
      } catch {
        res.status(502).json({ error: 'Upstream returned non-JSON', preview: text.slice(0, 300) });
      }
    } catch (err) {
      res.status(502).json({ error: 'Could not reach local server.', detail: err.message });
    }
    return;
  }

  // POST /api/parse  →  start a new job
  if (req.method === 'POST') {
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    headers['Content-Type'] = 'application/json';

    try {
      const upstream = await fetch(`${tunnelUrl}/api/parse`, {
        method: 'POST',
        headers,
        body: bodyStr,
      });
      const text = await upstream.text();
      try {
        res.status(upstream.status).json(JSON.parse(text));
      } catch {
        res.status(502).json({ error: 'Upstream returned non-JSON', preview: text.slice(0, 300) });
      }
    } catch (err) {
      res.status(502).json({ error: 'Could not reach local server.', detail: err.message });
    }
    return;
  }

  res.status(405).end();
}
