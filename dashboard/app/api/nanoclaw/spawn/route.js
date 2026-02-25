export const dynamic = 'force-dynamic';
const MASTER = 'http://159.65.205.244:3000';

export async function POST(req) {
  try {
    const body = await req.json();
    const r = await fetch(`${MASTER}/nanoclaw/spawn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return Response.json(await r.json());
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
