import { NextResponse } from 'next/server';

const MASTER = 'http://159.65.205.244:3000';

export async function GET(req) {
  await fetch(`${MASTER}/config/linear-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: null }),
  }).catch(() => {});
  return NextResponse.redirect(new URL('/', req.url));
}
