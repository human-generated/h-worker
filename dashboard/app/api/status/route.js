export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch('http://159.65.205.244:3000/status', { cache: 'no-store' });
    const data = await res.json();
    return Response.json(data);
  } catch (e) {
    return Response.json({ workers: {}, tasks: [], error: e.message }, { status: 500 });
  }
}
