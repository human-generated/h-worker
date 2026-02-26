export const dynamic = 'force-dynamic';
const MASTER = 'http://159.65.205.244:3000';

async function getSandboxUrl(id) {
  try {
    const r = await fetch(`${MASTER}/sandboxes/${id}`, { cache: 'no-store' });
    const sb = await r.json();
    return sb.url || null;
  } catch { return null; }
}

async function proxyRequest(req, id, pathParts, method, bodyBuffer) {
  const sandboxUrl = await getSandboxUrl(id);
  if (!sandboxUrl) return new Response('Sandbox not found', { status: 404 });

  const pathStr = (pathParts || []).join('/');
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const targetUrl = `${sandboxUrl}/${pathStr}${qs ? '?' + qs : ''}`;

  const fetchOpts = {
    method,
    headers: { accept: req.headers.get('accept') || '*/*' },
  };
  if (bodyBuffer) {
    fetchOpts.body = bodyBuffer;
    fetchOpts.headers['content-type'] = req.headers.get('content-type') || 'application/json';
  }

  let resp;
  try { resp = await fetch(targetUrl, fetchOpts); }
  catch (e) { return new Response(`Proxy error: ${e.message}`, { status: 502 }); }

  const ct = resp.headers.get('content-type') || 'text/plain';

  if (ct.includes('text/html')) {
    let html = await resp.text();
    const proxyBase = `/api/sandbox/${id}/proxy/`; // trailing slash needed for <base href> relative resolution
    // Inject base tag so relative URLs work
    html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${proxyBase}">`);
    // Rewrite absolute fetch('/api/ calls to go through proxy
    html = html.replace(/(['"`])(\/api\/)/g, `$1${proxyBase}api/`);
    // Rewrite setInterval/fetch to relative /
    html = html.replace(/fetch\s*\(\s*(['"`])\/((?!api\/sandbox\/))/g, `fetch($1${proxyBase}`);
    return new Response(html, {
      status: resp.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Frame-Options': 'ALLOWALL',
        'Content-Security-Policy': 'frame-ancestors *',
      },
    });
  }

  const body = await resp.arrayBuffer();
  return new Response(body, {
    status: resp.status,
    headers: { 'Content-Type': ct },
  });
}

export async function GET(req, { params }) {
  const { id, path: pathParts } = await params;
  return proxyRequest(req, id, pathParts, 'GET', null);
}
export async function POST(req, { params }) {
  const { id, path: pathParts } = await params;
  const body = await req.arrayBuffer();
  return proxyRequest(req, id, pathParts, 'POST', body);
}
export async function PATCH(req, { params }) {
  const { id, path: pathParts } = await params;
  const body = await req.arrayBuffer();
  return proxyRequest(req, id, pathParts, 'PATCH', body);
}
export async function DELETE(req, { params }) {
  const { id, path: pathParts } = await params;
  return proxyRequest(req, id, pathParts, 'DELETE', null);
}
export async function PUT(req, { params }) {
  const { id, path: pathParts } = await params;
  const body = await req.arrayBuffer();
  return proxyRequest(req, id, pathParts, 'PUT', body);
}
export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
