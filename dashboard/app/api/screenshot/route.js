export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const ip = searchParams.get('ip');
  if (!ip || !/^[\d.]+$/.test(ip)) {
    return new Response('bad ip', { status: 400 });
  }
  try {
    const res = await fetch(`http://${ip}:6080/screenshot.jpg`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return new Response('not found', { status: 404 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response('unavailable', { status: 503 });
  }
}
