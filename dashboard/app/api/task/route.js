export const dynamic = 'force-dynamic';

export async function POST(req) {
  const body = await req.json();
  const res = await fetch('http://159.65.205.244:3000/task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return Response.json(await res.json());
}
