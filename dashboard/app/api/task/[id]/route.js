export const dynamic = 'force-dynamic';
const MASTER = 'http://159.65.205.244:3000';

export async function GET(req, { params }) {
  const r = await fetch(`${MASTER}/task/${params.id}`, { cache: 'no-store' });
  return Response.json(await r.json());
}

export async function POST(req, { params }) {
  const body = await req.json();
  const r = await fetch(`${MASTER}/task/${params.id}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return Response.json(await r.json());
}
