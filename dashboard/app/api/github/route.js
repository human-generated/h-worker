export const dynamic = 'force-dynamic';
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get('path') || '';
  const res = await fetch(
    `https://api.github.com/repos/human-generated/h-worker/contents/${p}`,
    { headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, 'User-Agent': 'hw-dashboard' }, cache: 'no-store' }
  );
  return Response.json(await res.json());
}
