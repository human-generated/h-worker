const MASTER = 'http://159.65.205.244:3000';

export async function GET() {
  const r = await fetch(`${MASTER}/sandboxes`);
  const d = await r.json();
  return Response.json(d);
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const r = await fetch(`${MASTER}/sandboxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  return Response.json(d);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
