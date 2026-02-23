export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  try {
    const res = await fetch(`http://159.65.205.244:3000/task/${params.id}/logs`, { cache: 'no-store' });
    return Response.json(await res.json());
  } catch(e) {
    return Response.json({ error: e.message, logs: '' }, { status: 500 });
  }
}
