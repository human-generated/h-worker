export const dynamic = 'force-dynamic';

const MASTER = 'http://159.65.205.244:3000';

const GQL = `query Dashboard {
  viewer {
    id name email
    assignedIssues(
      filter: { state: { type: { nin: ["completed", "cancelled"] } } }
      first: 100
      orderBy: updatedAt
    ) {
      nodes {
        id identifier title priority url updatedAt
        state { name color type }
        team { name key }
        project { name }
      }
    }
  }
  teams { nodes { id name key color } }
}`;

async function getToken() {
  try {
    const r = await fetch(`${MASTER}/config/linear-token`, { cache: 'no-store' });
    const d = await r.json();
    return d.token || null;
  } catch { return null; }
}

async function gql(token, query, variables) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  return res.json();
}

export async function GET() {
  if (!process.env.LINEAR_CLIENT_ID) {
    return Response.json({ not_configured: true });
  }

  const token = await getToken();
  if (!token) return Response.json({ not_authenticated: true }, { status: 401 });

  const data = await gql(token, GQL);

  if (data.errors?.[0]?.extensions?.code === 'UNAUTHENTICATED') {
    return Response.json({ not_authenticated: true }, { status: 401 });
  }

  return Response.json(data);
}

export async function POST(request) {
  const token = await getToken();
  if (!token) return Response.json({ not_authenticated: true }, { status: 401 });

  const { query, variables } = await request.json();
  return Response.json(await gql(token, query, variables));
}
