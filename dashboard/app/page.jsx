'use client';
import { useState, useEffect } from 'react';

function statusColor(s) {
  if (s === 'active') return '#22c55e';
  if (s === 'activating') return '#38bdf8';
  if (s === 'failed') return '#ef4444';
  return '#f59e0b';
}

export default function Dashboard() {
  const [data, setData] = useState({ workers: {}, tasks: [] });
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState('');

  async function fetchStatus() {
    try {
      const r = await fetch('/api/status');
      setData(await r.json());
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {}
  }

  async function addTask() {
    if (!newTask.trim()) return;
    setLoading(true);
    await fetch('/api/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: newTask })
    });
    setNewTask('');
    await fetchStatus();
    setLoading(false);
  }

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 5000);
    return () => clearInterval(t);
  }, []);

  const workers = Object.values(data.workers || {});
  const tasks = (data.tasks || []).slice().reverse();

  return (
    <div style={{ fontFamily: 'monospace', background: '#0f172a', color: '#e2e8f0', minHeight: '100vh', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ color: '#38bdf8', margin: 0 }}>H Worker Dashboard</h1>
        <span style={{ color: '#475569', fontSize: '0.8rem' }}>auto-refresh · {lastRefresh}</span>
      </div>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#94a3b8', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Workers ({workers.length}/4)
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
          {workers.length === 0 && <p style={{ color: '#64748b' }}>Waiting for workers...</p>}
          {workers.map(w => (
            <div key={w.id} style={{ background: '#1e293b', borderRadius: '8px', padding: '1rem', border: `1px solid ${statusColor(w.status)}55` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#f1f5f9' }}>{w.id}</strong>
                <span style={{ background: statusColor(w.status), color: '#000', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 'bold' }}>{w.status}</span>
              </div>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                <div>IP: {w.ip}</div>
                <div>Task: <span style={{ color: w.task && w.task !== 'idle' ? '#fbbf24' : '#475569' }}>{w.task || 'idle'}</span></div>
              </div>
              <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                {w.vnc_port
                  ? <a href={`http://${w.ip}:${w.vnc_port}`} target="_blank"
                      style={{ color: '#38bdf8', fontSize: '0.8rem', textDecoration: 'none', background: '#0f172a', padding: '3px 8px', borderRadius: '4px', border: '1px solid #38bdf833' }}>
                      Desktop →
                    </a>
                  : null}
              </div>
              <div style={{ color: '#334155', fontSize: '0.7rem', marginTop: '0.5rem' }}>Updated: {w.updated_at?.slice(11,19)} UTC</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#94a3b8', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Assign Task</h2>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <input value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()}
            placeholder="Task description..."
            style={{ flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: '6px', padding: '0.5rem 1rem', color: '#e2e8f0', fontFamily: 'monospace' }}
          />
          <button onClick={addTask} disabled={loading}
            style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.5rem', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? '...' : 'Assign'}
          </button>
        </div>
      </section>

      <section>
        <h2 style={{ color: '#94a3b8', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Task Log ({tasks.length})</h2>
        <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: '#64748b', textAlign: 'left' }}>
              {['ID','Description','Status','Worker','Created'].map(h => (
                <th key={h} style={{ padding: '0.5rem', borderBottom: '1px solid #1e293b' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.slice(0, 50).map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #1e293b22' }}>
                <td style={{ padding: '0.5rem', color: '#475569', fontFamily: 'monospace' }}>{t.id.slice(-6)}</td>
                <td style={{ padding: '0.5rem' }}>{t.description}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span style={{ color: t.status==='done' ? '#22c55e' : t.status==='assigned' ? '#fbbf24' : '#94a3b8' }}>{t.status}</span>
                </td>
                <td style={{ padding: '0.5rem', color: '#94a3b8' }}>{t.worker || '—'}</td>
                <td style={{ padding: '0.5rem', color: '#475569' }}>{t.created_at?.slice(11,19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <p style={{ color: '#64748b', marginTop: '1rem' }}>No tasks yet.</p>}
      </section>
    </div>
  );
}
