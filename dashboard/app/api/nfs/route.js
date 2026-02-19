export const dynamic = 'force-dynamic';
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get('path') || '';
  try {
    const res = await fetch(`http://159.65.205.244:3000/nfs?path=${encodeURIComponent(p)}`, { cache: 'no-store' });
    return Response.json(await res.json());
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
