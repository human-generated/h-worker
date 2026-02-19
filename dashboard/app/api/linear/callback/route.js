import { NextResponse } from 'next/server';

const REDIRECT_URI = 'https://hw-dashboard.vercel.app/api/linear/callback';
const MASTER = 'http://159.65.205.244:3000';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error || !code || !state) {
    const msg = encodeURIComponent(error || 'missing code or state');
    return NextResponse.redirect(new URL('/?linear_error=' + msg, req.url));
  }

  const tokenRes = await fetch('https://api.linear.app/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.LINEAR_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code_verifier: state,
    }).toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    const msg = encodeURIComponent(JSON.stringify(tokenData));
    return NextResponse.redirect(new URL('/?linear_error=' + msg, req.url));
  }

  // Save token to master — works across all browsers forever
  await fetch(`${MASTER}/config/linear-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: tokenData.access_token }),
  }).catch(() => {});

  return NextResponse.redirect(new URL('/', req.url));
}
