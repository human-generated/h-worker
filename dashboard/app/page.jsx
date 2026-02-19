'use client';
import { useState, useEffect, useRef } from 'react';

const S = {
  page: { fontFamily: 'monospace', background: '#0f172a', color: '#e2e8f0', minHeight: '100vh', padding: '1.5rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' },
  title: { color: '#38bdf8', margin: 0, fontSize: '1.25rem', letterSpacing: '0.05em' },
  tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' },
  tab: (active) => ({ background: active ? '#0284c7' : '#1e293b', color: active ? '#fff' : '#94a3b8', border: 'none', borderRadius: '6px', padding: '0.4rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }),
  section: { marginBottom: '2rem' },
  sectionTitle: { color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.75rem' },
  card: { background: '#1e293b', borderRadius: '8px', padding: '1rem' },
  badge: (color) => ({ background: color, color: '#000', borderRadius: '4px', padding: '2px 7px', fontSize: '0.7rem', fontWeight: 'bold' }),
  input: { background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', padding: '0.5rem 1rem', color: '#e2e8f0', fontFamily: 'monospace', flex: 1 },
  btn: { background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.25rem', cursor: 'pointer' },
  code: { background: '#0f172a', borderRadius: '6px', padding: '1rem', fontSize: '0.8rem', overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto' },
};

function statusColor(s) {
  if (s === 'active') return '#22c55e';
  if (s === 'activating') return '#38bdf8';
  if (s === 'failed') return '#ef4444';
  return '#f59e0b';
}

// --- Workers Tab ---
function WorkersTab() {
  const [data, setData] = useState({ workers: {}, tasks: [] });
  const [newTask, setNewTask] = useState('');
  const [hover, setHover] = useState(null);
  const [ts, setTs] = useState('');
  const imgCache = useRef({});

  async function fetch_() {
    try { const r = await fetch('/api/status'); setData(await r.json()); setTs(new Date().toLocaleTimeString()); } catch {}
  }
  useEffect(() => { fetch_(); const t = setInterval(fetch_, 5000); return () => clearInterval(t); }, []);

  async function addTask() {
    if (!newTask.trim()) return;
    await fetch('/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: newTask }) });
    setNewTask(''); fetch_();
  }

  const workers = Object.values(data.workers || {});
  const tasks = (data.tasks || []).slice().reverse();

  return (
    <div>
      <div style={S.section}>
        <div style={S.sectionTitle}>Workers ({workers.length}/4) · {ts}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '1rem' }}>
          {workers.map(w => {
            const color = statusColor(w.status);
            const screenshotUrl = `http://${w.ip}:6080/screenshot.jpg?t=${Date.now()}`;
            return (
              <div key={w.id} style={{ ...S.card, border: `1px solid ${color}44`, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#f1f5f9' }}>{w.id}</strong>
                  <span style={S.badge(color)}>{w.status}</span>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.5rem' }}>
                  <div>IP: {w.ip}</div>
                  <div>Task: <span style={{ color: w.task && w.task !== 'idle' ? '#fbbf24' : '#475569' }}>{w.task || 'idle'}</span></div>
                  <div style={{ color: '#334155' }}>Heartbeat: {w.updated_at?.slice(11,19)} UTC</div>
                </div>
                <div style={{ marginTop: '0.75rem', position: 'relative', display: 'inline-block' }}
                  onMouseEnter={() => setHover(w.id)}
                  onMouseLeave={() => setHover(null)}>
                  <a href={`http://${w.ip}:6080`} target="_blank"
                    style={{ color: '#38bdf8', fontSize: '0.8rem', textDecoration: 'none', background: '#0f172a', padding: '4px 10px', borderRadius: '4px', border: '1px solid #38bdf833' }}>
                    Desktop →
                  </a>
                  {hover === w.id && (
                    <div style={{ position: 'absolute', bottom: '130%', left: 0, zIndex: 100, background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '4px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
                      <img src={screenshotUrl} alt="desktop preview"
                        style={{ width: '280px', height: '175px', objectFit: 'cover', borderRadius: '4px', display: 'block' }}
                        onError={e => { e.target.style.display='none'; }} />
                      <div style={{ color: '#475569', fontSize: '0.65rem', padding: '2px 4px' }}>live preview · updates every 15s</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Assign Task</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input style={S.input} value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="Task description..." />
          <button style={S.btn} onClick={addTask}>Assign</button>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Task Log ({tasks.length})</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ color: '#475569', textAlign: 'left' }}>
              {['ID','Description','Status','Worker','Time'].map(h => <th key={h} style={{ padding: '0.4rem', borderBottom: '1px solid #1e293b' }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {tasks.slice(0,50).map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #1e293b22' }}>
                <td style={{ padding: '0.4rem', color: '#334155' }}>{t.id.slice(-6)}</td>
                <td style={{ padding: '0.4rem' }}>{t.description}</td>
                <td style={{ padding: '0.4rem' }}>
                  <span style={{ color: t.status==='done'?'#22c55e':t.status==='assigned'?'#fbbf24':'#64748b' }}>{t.status}</span>
                </td>
                <td style={{ padding: '0.4rem', color: '#64748b' }}>{t.worker||'—'}</td>
                <td style={{ padding: '0.4rem', color: '#334155' }}>{t.created_at?.slice(11,19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tasks.length && <div style={{ color: '#334155', marginTop: '0.5rem' }}>No tasks yet.</div>}
      </div>
    </div>
  );
}

// --- GitHub Tab ---
function GitHubTab() {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState(null);
  const [file, setFile] = useState(null);
  const [history, setHistory] = useState(['']);
  const [loading, setLoading] = useState(false);

  async function load(p) {
    setLoading(true); setFile(null);
    const r = await fetch(`/api/github?path=${encodeURIComponent(p)}`);
    const data = await r.json();
    if (Array.isArray(data)) {
      setEntries(data); setPath(p);
      setHistory(h => [...h.filter(x => x !== p), p]);
    } else if (data.type === 'file') {
      setFile({ name: data.name, content: atob(data.content) });
    }
    setLoading(false);
  }

  useEffect(() => { load(''); }, []);

  const parts = path.split('/').filter(Boolean);

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
        <span style={{ cursor: 'pointer', color: '#38bdf8' }} onClick={() => load('')}>h-worker</span>
        {parts.map((p, i) => (
          <span key={i}>
            <span style={{ margin: '0 0.3rem' }}>/</span>
            <span style={{ cursor: 'pointer', color: '#38bdf8' }} onClick={() => load(parts.slice(0,i+1).join('/'))}>{p}</span>
          </span>
        ))}
      </div>

      {loading && <div style={{ color: '#475569' }}>Loading...</div>}

      {file && (
        <div>
          <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>{file.name}</span>
            <button style={{ ...S.btn, padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => setFile(null)}>← Back</button>
          </div>
          <div style={S.code}>{file.content}</div>
        </div>
      )}

      {!file && entries && (
        <div style={{ ...S.card }}>
          {path && (
            <div style={{ padding: '0.4rem 0.5rem', cursor: 'pointer', color: '#64748b', borderBottom: '1px solid #0f172a' }}
              onClick={() => load(parts.slice(0,-1).join('/'))}>
              📁 ..
            </div>
          )}
          {entries.map(e => (
            <div key={e.name} style={{ padding: '0.4rem 0.5rem', cursor: 'pointer', borderBottom: '1px solid #0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => load(e.path)}
              onMouseEnter={ev => ev.currentTarget.style.background='#0f172a'}
              onMouseLeave={ev => ev.currentTarget.style.background=''}>
              <span>{e.type === 'dir' ? '📁' : '📄'}</span>
              <span style={{ color: e.type === 'dir' ? '#38bdf8' : '#e2e8f0' }}>{e.name}</span>
              {e.size > 0 && <span style={{ color: '#334155', fontSize: '0.75rem', marginLeft: 'auto' }}>{(e.size/1024).toFixed(1)}kb</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- NFS Tab ---
function NFSTab() {
  const [path, setPath] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load(p) {
    setLoading(true);
    const r = await fetch(`/api/nfs?path=${encodeURIComponent(p)}`);
    const d = await r.json();
    setData(d); setPath(p);
    setLoading(false);
  }

  useEffect(() => { load(''); }, []);

  const parts = path.split('/').filter(Boolean);

  return (
    <div>
      <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
        <span style={{ cursor: 'pointer', color: '#38bdf8' }} onClick={() => load('')}>/mnt/shared</span>
        {parts.map((p, i) => (
          <span key={i}>
            <span style={{ margin: '0 0.3rem' }}>/</span>
            <span style={{ cursor: 'pointer', color: '#38bdf8' }} onClick={() => load(parts.slice(0,i+1).join('/'))}>{p}</span>
          </span>
        ))}
      </div>

      {loading && <div style={{ color: '#475569' }}>Loading...</div>}

      {data?.error && <div style={{ color: '#ef4444' }}>Error: {data.error}</div>}

      {data?.type === 'dir' && (
        <div style={S.card}>
          {path && (
            <div style={{ padding: '0.4rem 0.5rem', cursor: 'pointer', color: '#64748b', borderBottom: '1px solid #0f172a' }}
              onClick={() => load(parts.slice(0,-1).join('/'))}>📁 ..</div>
          )}
          {!data.entries?.length && <div style={{ color: '#334155', padding: '0.5rem' }}>Empty directory</div>}
          {data.entries?.map(e => (
            <div key={e.name} style={{ padding: '0.4rem 0.5rem', cursor: 'pointer', borderBottom: '1px solid #0f172a', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
              onClick={() => load(path ? `${path}/${e.name}` : e.name)}
              onMouseEnter={ev => ev.currentTarget.style.background='#0f172a'}
              onMouseLeave={ev => ev.currentTarget.style.background=''}>
              <span>{e.type === 'dir' ? '📁' : '📄'}</span>
              <span style={{ color: e.type === 'dir' ? '#38bdf8' : '#e2e8f0' }}>{e.name}</span>
              {e.type === 'file' && <span style={{ color: '#334155', fontSize: '0.75rem', marginLeft: 'auto' }}>{(e.size/1024).toFixed(1)}kb</span>}
              <span style={{ color: '#334155', fontSize: '0.7rem', marginLeft: 'auto' }}>{new Date(e.modified).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {data?.type === 'file' && (
        <div>
          <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>{parts[parts.length-1]}</span>
            <button style={{ ...S.btn, padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => load(parts.slice(0,-1).join('/'))}>← Back</button>
          </div>
          <div style={S.code}>{data.content}</div>
        </div>
      )}
    </div>
  );
}

// --- Main ---
export default function Dashboard() {
  const [tab, setTab] = useState('workers');
  const tabs = [['workers','Workers'], ['github','GitHub'], ['nfs','NFS Share']];

  return (
    <div style={S.page}>
      <div style={S.header}>
        <h1 style={S.title}>⬡ H Worker Dashboard</h1>
        <a href="https://github.com/human-generated/h-worker" target="_blank"
          style={{ color: '#475569', fontSize: '0.8rem', textDecoration: 'none' }}>github →</a>
      </div>
      <div style={S.tabs}>
        {tabs.map(([id, label]) => (
          <button key={id} style={S.tab(tab===id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === 'workers' && <WorkersTab />}
      {tab === 'github' && <GitHubTab />}
      {tab === 'nfs' && <NFSTab />}
    </div>
  );
}
