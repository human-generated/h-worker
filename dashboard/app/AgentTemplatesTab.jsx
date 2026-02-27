'use client';
import { useState, useEffect } from 'react';

const T = {
  bg: '#F4F4F4', card: '#FFFFFF', text: '#0D0D0D', muted: '#888888',
  border: '1px solid rgba(0,0,0,0.06)', shadow: '0 4px 20px rgba(0,0,0,0.05)',
  radius: '2px', mono: "'JetBrains Mono', monospace", ui: "'Space Grotesk', sans-serif",
  mint: '#6CEFA0', blue: '#6CDDEF', purple: '#B06CEF', orange: '#EF9B6C', red: '#EF4444',
};

const S = {
  card: { background: T.card, borderRadius: T.radius, padding: '1rem', boxShadow: T.shadow, border: T.border },
  btn: { background: T.text, color: '#fff', border: 'none', borderRadius: T.radius, padding: '0.5rem 1.25rem', cursor: 'pointer', fontFamily: T.mono, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
  btnGhost: { background: T.card, color: T.muted, border: '1px solid rgba(0,0,0,0.1)', borderRadius: T.radius, padding: '0.38rem 0.75rem', cursor: 'pointer', fontFamily: T.mono, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
  logBox: { background: '#0D0D0D', color: '#6CEFA0', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.72rem', lineHeight: 1.6, padding: '0.75rem', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', borderRadius: '2px', marginTop: '0.5rem', border: '1px solid rgba(108,239,160,0.1)' },
};

const GENERATE_ORDERS_SCRIPT = '#!/bin/bash\n' +
'BASE_URL="$1"\n' +
'if [ -z "$BASE_URL" ]; then echo "Error: BASE_URL required as first argument"; exit 1; fi\n' +
'NAMES=("Alice Chen" "Bob Martinez" "Carol White" "Dave Kim" "Eve Johnson")\n' +
'echo "Generating 5 orders to $BASE_URL..."\n' +
'for i in $(seq 1 5); do\n' +
'  NAME="${NAMES[$((RANDOM % 5))]}"\n' +
'  TOTAL=$((RANDOM % 200 + 20))\n' +
'  curl -s -X POST "$BASE_URL/api/orders" \\\n' +
'    -H "Content-Type: application/json" \\\n' +
'    -d "{\\"customer\\":\\"$NAME\\",\\"total\\":$TOTAL,\\"status\\":\\"pending\\",\\"items\\":[{\\"product_id\\":$((RANDOM % 12 + 1)),\\"qty\\":1}]}" > /dev/null\n' +
'  echo "Created order for $NAME ($TOTAL)"\n' +
'  sleep 0.3\n' +
'done\n' +
'echo "Done: 5 orders generated"';

const SEED_ANALYTICS_SCRIPT = `#!/bin/bash
BASE_URL="$1"
if [ -z "$BASE_URL" ]; then echo "Error: BASE_URL required as first argument"; exit 1; fi
echo "Seeding analytics events to $BASE_URL..."
for metric in pageviews signups revenue; do
  for i in $(seq 1 10); do
    VALUE=$((RANDOM % 1000 + 10))
    curl -s -X POST "$BASE_URL/api/events" \\
      -H "Content-Type: application/json" \\
      -d "{\\"metric\\":\\"$metric\\",\\"value\\":$VALUE}" > /dev/null
  done
  echo "Seeded 10 $metric events"
done
echo "Done: 30 events across 3 metrics"`;

const HN_SCRIPT = `#!/bin/bash
echo "=== Hacker News Top 5 ==="
IDS=$(curl -s "https://hacker-news.firebaseio.com/v0/topstories.json" | python3 -c "import json,sys; ids=json.load(sys.stdin)[:5]; print(' '.join(map(str,ids)))")
for ID in $IDS; do
  DATA=$(curl -s "https://hacker-news.firebaseio.com/v0/item/$ID.json")
  TITLE=$(echo "$DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('title','?'))")
  SCORE=$(echo "$DATA" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('score',0))")
  echo "[$SCORE pts] $TITLE"
done`;

const CRYPTO_SCRIPT = `#!/bin/bash
echo "=== Crypto Price Snapshot ==="
DATA=$(curl -s "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true")
echo "$DATA" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for coin, info in d.items():
    price = info.get('usd', 0)
    change = info.get('usd_24h_change', 0)
    arrow = 'up' if change > 0 else 'down'
    print(f'{coin.upper()}: \${price:,.2f}  {arrow} {abs(change):.1f}%')
"`;

const TELEGRAM_SCRIPT = `#!/bin/bash
MSG="HW Report $(date '+%Y-%m-%d %H:%M')"
MSG="$MSG | Sandboxes active: $(curl -s http://159.65.205.244:3000/sandboxes | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d))')"
MSG="$MSG | System: operational"
curl -s -X POST "https://api.telegram.org/bot8386044481:AAGGJAQ4Ns5lolNszuXAXZ-Fdp19v9QcKU4/sendMessage" \\
  -H "Content-Type: application/json" \\
  -d "{\\"chat_id\\":\\"-1002678964150\\",\\"text\\":\\"$MSG\\"}" \\
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('Sent!' if d.get('ok') else 'Failed: '+str(d))"`;

const HEALTH_CHECK_SCRIPT = `#!/bin/bash
BASE_URL="$1"
if [ -z "$BASE_URL" ]; then echo "Error: BASE_URL required as first argument"; exit 1; fi
echo "=== Health Check: $BASE_URL ==="
for ENDPOINT in "/" "/api/products" "/api/orders" "/api/tickets" "/api/contacts" "/api/messages"; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$BASE_URL$ENDPOINT" 2>/dev/null || echo "ERR")
  if [ "$STATUS" = "200" ]; then ICON="OK"; else ICON="FAIL"; fi
  echo "$ICON  $ENDPOINT -> HTTP $STATUS"
done`;

const AGENT_TYPES = [
  {
    id: 'data-gen',
    icon: '⚙️',
    title: 'Data Generator / Processor',
    description: 'Generates realistic data and POSTs it to app APIs. Use to stress-test, demo, or populate fresh apps.',
    howItWorks: 'Selects a deployed sandbox, runs bash scripts that make HTTP requests to the app APIs, seeds realistic data or generates load.',
    accentColor: T.mint,
    needsSandbox: true,
    scenarios: [
      {
        name: 'Generate Orders',
        description: 'Creates 5 realistic orders in an E-Commerce sandbox.',
        script: GENERATE_ORDERS_SCRIPT,
        needsUrl: true,
      },
      {
        name: 'Seed Analytics Events',
        description: 'Seeds 30 events across pageviews, signups, and revenue metrics.',
        script: SEED_ANALYTICS_SCRIPT,
        needsUrl: true,
      },
    ],
  },
  {
    id: 'intel-gather',
    icon: '🔍',
    title: 'Intelligence Gatherer',
    description: 'Monitors external data sources and surfaces insights. Polls public APIs, aggregates signals.',
    howItWorks: 'Runs standalone scripts that fetch from public APIs (Hacker News, CoinGecko) and formats the results. No sandbox needed.',
    accentColor: T.blue,
    needsSandbox: false,
    scenarios: [
      {
        name: 'HN Top Stories',
        description: 'Fetches the top 5 Hacker News stories with scores.',
        script: HN_SCRIPT,
        needsUrl: false,
      },
      {
        name: 'Crypto Prices',
        description: 'Gets live BTC, ETH, SOL prices and 24h change from CoinGecko.',
        script: CRYPTO_SCRIPT,
        needsUrl: false,
      },
    ],
  },
  {
    id: 'real-world',
    icon: '🌐',
    title: 'Real World Interactor',
    description: 'Interacts with the real world: sends Telegram messages, runs health checks, triggers webhooks.',
    howItWorks: 'Runs scripts that call external APIs with real effects — sends actual Telegram messages and checks endpoint health.',
    accentColor: T.purple,
    needsSandbox: false,
    scenarios: [
      {
        name: 'Send Telegram Report',
        description: 'Sends an actual status report to the HW Telegram channel.',
        script: TELEGRAM_SCRIPT,
        needsUrl: false,
      },
      {
        name: 'HTTP Health Check',
        description: 'Checks all common endpoints of a deployed app.',
        script: HEALTH_CHECK_SCRIPT,
        needsUrl: true,
      },
    ],
  },
];

function ScenarioRunner({ scenario, sandboxes }) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [lastRun, setLastRun] = useState(null);

  async function run() {
    setRunning(true);
    setOutput(['Running ' + scenario.name + '...']);
    try {
      const args = scenario.needsUrl && baseUrl ? [baseUrl] : [];
      const r = await fetch('/api/agent/run-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scenario.script, args }),
      });
      const d = await r.json();
      const lines = (d.output || '').split('\n').filter(Boolean);
      setOutput(lines.length ? lines : ['(no output)']);
      setLastRun(Date.now());
    } catch (e) {
      setOutput(['Error: ' + e.message]);
    }
    setRunning(false);
  }

  const deployedSandboxes = sandboxes ? Object.values(sandboxes).filter(s => s.status === 'deployed') : [];

  return (
    <div style={{ background: T.bg, borderRadius: T.radius, padding: '0.75rem', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: '0.78rem', fontWeight: 600, color: T.text }}>{scenario.name}</div>
          <div style={{ fontFamily: T.mono, fontSize: '0.65rem', color: T.muted }}>{scenario.description}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, marginLeft: '1rem' }}>
          {lastRun && (
            <span style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.muted }}>
              {Math.floor((Date.now() - lastRun) / 1000)}s ago
            </span>
          )}
          <button onClick={run} disabled={running}
            style={{ ...S.btn, fontSize: '0.65rem', padding: '0.3rem 0.75rem', opacity: running ? 0.6 : 1 }}>
            {running ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>

      {scenario.needsUrl && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
          {deployedSandboxes.length > 0 && (
            <select
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              style={{ background: T.card, border: T.border, borderRadius: T.radius, padding: '0.3rem 0.5rem', fontFamily: T.mono, fontSize: '0.68rem', color: T.text, cursor: 'pointer', outline: 'none', flex: 1 }}>
              <option value="">-- Select sandbox URL --</option>
              {deployedSandboxes.map(s => (
                <option key={s.id} value={s.url}>{s.title} ({s.url})</option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="http://164.90.197.224:8100"
            style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #E0E0E0', padding: '0.3rem 0', fontFamily: T.mono, fontSize: '0.68rem', color: T.text, outline: 'none', flex: 2 }}
          />
        </div>
      )}

      {output.length > 0 && (
        <div style={S.logBox}>
          {output.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, sandboxes }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: T.card,
      borderRadius: T.radius,
      padding: '1.25rem',
      boxShadow: T.shadow,
      border: T.border,
      borderLeft: '3px solid ' + agent.accentColor,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{ fontSize: '1.8rem' }}>{agent.icon}</span>
          <div>
            <div style={{ fontFamily: T.ui, fontSize: '1rem', fontWeight: 700, color: T.text }}>{agent.title}</div>
            <div style={{ fontFamily: T.mono, fontSize: '0.68rem', color: T.muted, marginTop: '0.2rem', lineHeight: 1.5 }}>
              {agent.description}
            </div>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)}
          style={{ ...S.btnGhost, flexShrink: 0, marginLeft: '0.75rem', fontSize: '0.65rem' }}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
            How it works
          </div>
          <div style={{ fontFamily: T.mono, fontSize: '0.72rem', color: T.text, marginBottom: '1rem', lineHeight: 1.6, background: T.bg, padding: '0.6rem', borderRadius: T.radius }}>
            {agent.howItWorks}
          </div>

          <div style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>
            Scenarios
          </div>
          {agent.scenarios.map(scenario => (
            <ScenarioRunner key={scenario.name} scenario={scenario} sandboxes={sandboxes} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentTemplatesTab() {
  const [sandboxes, setSandboxes] = useState({});

  useEffect(() => {
    async function fetchSandboxes() {
      try {
        const r = await fetch('/api/sandbox');
        const d = await r.json();
        setSandboxes(d || {});
      } catch {}
    }
    fetchSandboxes();
    const t = setInterval(fetchSandboxes, 10000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>
          Agent Templates
        </div>
        <div style={{ fontFamily: T.ui, fontSize: '0.88rem', color: T.text }}>
          Pre-built agent types with runnable scenarios. Click Expand on any agent to run scenarios directly.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {AGENT_TYPES.map(agent => (
          <AgentCard key={agent.id} agent={agent} sandboxes={sandboxes} />
        ))}
      </div>
    </div>
  );
}
