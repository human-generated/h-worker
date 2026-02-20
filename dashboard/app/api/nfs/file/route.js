export const dynamic = 'force-dynamic';
const MASTER = 'http://159.65.205.244:3000';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get('path') || '';
  try {
    const upstream = await fetch(`${MASTER}/nfs/file?path=${encodeURIComponent(p)}`, { cache: 'no-store' });
    if (!upstream.ok) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Content-Disposition', upstream.headers.get('Content-Disposition') || 'inline');
    return new Response(upstream.body, { status: 200, headers });
  } catch(e) {
    return new Response(e.message, { status: 500 });
  }
}
