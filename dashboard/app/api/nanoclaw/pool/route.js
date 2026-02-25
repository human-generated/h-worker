export const dynamic = 'force-dynamic';
const MASTER = 'http://159.65.205.244:3000';

export async function GET() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${MASTER}/nanoclaw/pool`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await r.json();
    return Response.json(data);
  } catch (e) {
    // Return error flag but NOT empty workers — client preserves last known state
    return Response.json({ error: e.message }, { status: 500 });
  }
}
