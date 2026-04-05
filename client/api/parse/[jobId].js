export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const tunnelUrl = process.env.TUNNEL_URL?.replace(/\/$/, '');
  if (!tunnelUrl) {
    return res.status(503).json({ error: 'Server not configured. Start the tunnel and set TUNNEL_URL in Vercel.' });
  }

  const { jobId } = req.query;
  try {
    const upstream = await fetch(`${tunnelUrl}/api/parse/${jobId}`);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach local server. Make sure tunnel is running.' });
  }
}
