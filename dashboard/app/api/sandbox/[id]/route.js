const MASTER = 'http://159.65.205.244:3000';

export async function GET(req, { params }) {
  const { id } = await params;
  const r = await fetch(`${MASTER}/sandboxes/${id}`);
  const d = await r.json();
  return Response.json(d);
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const r = await fetch(`${MASTER}/sandboxes/${id}`, { method: 'DELETE' });
  const d = await r.json();
  return Response.json(d);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
