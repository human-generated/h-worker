export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename') || 'upload';
  try {
    const body = await req.arrayBuffer();
    const res = await fetch(
      `http://159.65.205.244:3000/upload?filename=${encodeURIComponent(filename)}`,
      { method: 'POST', body, cache: 'no-store' }
    );
    return Response.json(await res.json());
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
