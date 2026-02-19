export const dynamic = 'force-dynamic';
const MASTER = 'http://159.65.205.244:3000';

export async function GET() {
  const r = await fetch(`${MASTER}/skills`, { cache: 'no-store' });
  return Response.json(await r.json());
}

export async function POST(req) {
  const body = await req.json();
  const endpoint = body.url ? `${MASTER}/skills/install` : `${MASTER}/skills`;
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return Response.json(await r.json());
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const r = await fetch(`${MASTER}/skills/${slug}`, { method: 'DELETE' });
  return Response.json(await r.json());
}
