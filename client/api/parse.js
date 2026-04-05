export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const tunnelUrl = process.env.TUNNEL_URL?.replace(/\/$/, '');
  if (!tunnelUrl) {
    return res.status(503).json({ error: 'Server not configured. Start the tunnel and set TUNNEL_URL in Vercel.' });
  }

  try {
    const upstream = await fetch(`${tunnelUrl}/api/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach local server. Make sure tunnel is running.' });
  }
}
