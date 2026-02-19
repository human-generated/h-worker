import { NextResponse } from 'next/server';
import crypto from 'crypto';

const REDIRECT_URI = 'https://hw-dashboard.vercel.app/api/linear/callback';

export async function GET() {
  if (!process.env.LINEAR_CLIENT_ID) {
    return new Response('LINEAR_CLIENT_ID not configured', { status: 500 });
  }

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  // Encode verifier in state so it survives the redirect without needing cookies
  const state = verifier;

  const url = new URL('https://linear.app/oauth/authorize');
  url.searchParams.set('client_id', process.env.LINEAR_CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'read');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return NextResponse.redirect(url.toString());
}
