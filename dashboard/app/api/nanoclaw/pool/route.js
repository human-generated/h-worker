// Proxies /nanoclaw/pool from master API
const MASTER = 'http://159.65.205.244:3000';

export async function GET() {
  try {
    const r = await fetch(`${MASTER}/nanoclaw/pool`, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 },
    });
    const data = await r.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ error: e.message, workers: [], total_agents: 0, active_agents: 0 }, { status: 500 });
  }
}
