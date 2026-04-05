export default async function handler(req, res) {
  const tunnelUrl = process.env.TUNNEL_URL?.replace(/\/$/, '') || null;

  let reachable = false;
  let reachError = null;
  if (tunnelUrl) {
    try {
      const r = await fetch(`${tunnelUrl}/health`, {
        headers: { 'ngrok-skip-browser-warning': 'true' },
        signal: AbortSignal.timeout(8000),
      });
      reachable = r.ok;
      if (!reachable) reachError = `HTTP ${r.status}`;
    } catch (e) {
      reachError = e.message;
    }
  }

  res.json({
    tunnelUrl: tunnelUrl ? tunnelUrl.replace(/\/\/(.{4}).*(@|$)/, '//$1***') : 'NOT SET',
    reachable,
    reachError,
  });
}
