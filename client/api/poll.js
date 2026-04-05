export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const tunnelUrl = process.env.TUNNEL_URL?.replace(/\/$/, '');
  if (!tunnelUrl) {
    return res.status(503).json({ error: 'Server not configured. Start the tunnel and set TUNNEL_URL in Vercel.' });
  }

  const { jobId } = req.query;
  if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

  try {
    const upstream = await fetch(`${tunnelUrl}/api/parse/${jobId}`, {
      headers: {
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'ChaosToTodos-Proxy/1.0',
      },
    });

    const text = await upstream.text();
    try {
      const data = JSON.parse(text);
      res.status(upstream.status).json(data);
    } catch {
      res.status(502).json({
        error: 'Upstream returned non-JSON',
        status: upstream.status,
        preview: text.slice(0, 300),
      });
    }
  } catch (err) {
    res.status(502).json({ error: 'Could not reach local server.', detail: err.message });
  }
}
