'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

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

function statusLabel(w) {
  if (!w || w.status === 'inactive' || !w.status) return 'offline';
  if (w.status === 'failed') return 'failed';
  if (w.status === 'active') return (w.task && w.task !== 'idle') ? 'working' : 'idle';
  return w.status;
}
function statusColor(w) {
  const s = statusLabel(w);
  if (s === 'idle') return '#22c55e';
  if (s === 'working') return '#f59e0b';
  if (s === 'failed') return '#ef4444';
  if (s === 'offline') return '#475569';
  return '#38bdf8';
}

// --- Draggable Desktop Window ---
function DesktopWindow({ worker, onClose }) {
  const [pos, setPos] = useState({ x: Math.random() * 200 + 80, y: Math.random() * 100 + 80 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [imgTs, setImgTs] = useState(Date.now());
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setImgTs(Date.now());
        setImgError(false);
      }
    }, 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => setPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging, dragOffset]);

  const onDragStart = (e) => {
    setDragging(true);
    setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y });
    e.preventDefault();
  };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000, width: 660,
      background: '#0f172a', border: '1px solid #334155', borderRadius: '10px',
      boxShadow: '0 20px 80px rgba(0,0,0,0.85)', userSelect: 'none',
    }}>
      {/* Title bar */}
      <div onMouseDown={onDragStart} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e293b',
        cursor: dragging ? 'grabbing' : 'grab',
        background: '#1e293b', borderRadius: '10px 10px 0 0',
      }}>
        <span style={{ color: '#38bdf8', fontSize: '0.82rem' }}>⊞ {worker.id} · {worker.ip}</span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <a href={`http://${worker.ip}:6080`} target="_blank" rel="noreferrer"
            onMouseDown={e => e.stopPropagation()}
            style={{ color: '#94a3b8', fontSize: '0.75rem', textDecoration: 'none' }}>
            ↗ fullscreen
          </a>
          <button onMouseDown={e => e.stopPropagation()} onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0 2px' }}>
            ×
          </button>
        </div>
      </div>
      {/* Screenshot */}
      <div style={{ background: '#000', borderRadius: '0 0 10px 10px', position: 'relative', height: 412, overflow: 'hidden' }}>
        {imgError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#334155', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontSize: '2rem' }}>⊘</div>
            <div style={{ fontSize: '0.8rem' }}>Screenshot unavailable</div>
          </div>
        ) : (
          <img
            key={imgTs}
            src={`/api/screenshot?ip=${worker.ip}&t=${imgTs}`}
            alt="desktop"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}
        <div style={{ position: 'absolute', bottom: 6, right: 10, color: '#1e293b', fontSize: '0.65rem' }}>
          live · 4s refresh
        </div>
      </div>
    </div>
  );
}

// --- Workers Tab ---
function WorkersTab({ workers }) {
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [hover, setHover] = useState(null);
  const [hoverTs, setHoverTs] = useState({});
  const [openDesktops, setOpenDesktops] = useState([]);
  const [ts, setTs] = useState('');

  async function fetchTasks() {
    try {
      const r = await fetch('/api/status');
      const d = await r.json();
      setTasks((d.tasks || []).slice().reverse());
      setTs(new Date().toLocaleTimeString());
    } catch {}
  }
  useEffect(() => { fetchTasks(); const t = setInterval(fetchTasks, 5000); return () => clearInterval(t); }, []);

  function openDesktop(worker) {
    setOpenDesktops(prev => prev.find(w => w.id === worker.id) ? prev : [...prev, worker]);
  }
  function closeDesktop(id) {
    setOpenDesktops(prev => prev.filter(w => w.id !== id));
  }
  function handleCardEnter(workerId) {
    setHover(workerId);
    setHoverTs(prev => ({ ...prev, [workerId]: Date.now() }));
  }

  async function addTask() {
    if (!newTask.trim()) return;
    await fetch('/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: newTask }) });
    setNewTask(''); fetchTasks();
  }

  return (
    <div>
      {/* Draggable desktop windows */}
      {openDesktops.map(w => (
        <DesktopWindow key={w.id} worker={w} onClose={() => closeDesktop(w.id)} />
      ))}

      <div style={S.section}>
        <div style={S.sectionTitle}>Workers ({workers.length}/4) · {ts}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1rem' }}>
          {workers.map(w => {
            const color = statusColor(w);
            const isHovered = hover === w.id;
            const screenshotTs = hoverTs[w.id] || 0;
            return (
              <div key={w.id}
                style={{ ...S.card, border: `1px solid ${color}44`, position: 'relative' }}
                onMouseEnter={() => handleCardEnter(w.id)}
                onMouseLeave={() => setHover(null)}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: '#f1f5f9' }}>{w.id}</strong>
                  <span style={S.badge(color)}>{statusLabel(w)}</span>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.78rem', marginTop: '0.5rem' }}>
                  <div>IP: {w.ip}</div>
                  <div>Task: <span style={{ color: w.task && w.task !== 'idle' ? '#fbbf24' : '#475569' }}>{w.task || 'idle'}</span></div>
                  <div style={{ color: '#334155' }}>Heartbeat: {w.updated_at?.slice(11,19)} UTC</div>
                </div>

                {/* Screenshot preview — shown on card hover, inside the card so no escape issue */}
                <div style={{
                  marginTop: '0.75rem', overflow: 'hidden', borderRadius: '4px',
                  height: isHovered ? 160 : 0, transition: 'height 0.15s ease',
                  background: '#0f172a',
                }}>
                  {screenshotTs > 0 && (
                    <img
                      src={`/api/screenshot?ip=${w.ip}&t=${screenshotTs}`}
                      alt="desktop preview"
                      style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.style.opacity = '0.2'; }}
                    />
                  )}
                </div>

                {/* Skills */}
                {w.skills?.length > 0 && (
                  <div style={{ marginTop: '0.75rem', borderTop: '1px solid #0f172a', paddingTop: '0.6rem' }}>
                    <div style={{ color: '#334155', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>Skills</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {w.skills.map(sk => (
                        <span key={sk.name} title={sk.desc} style={{
                          fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px',
                          background: sk.creator === 'claude' ? '#312e81' : '#0c4a6e',
                          color: sk.creator === 'claude' ? '#a5b4fc' : '#7dd3fc',
                          border: `1px solid ${sk.creator === 'claude' ? '#4338ca44' : '#0284c744'}`,
                          cursor: 'default',
                        }}>
                          {sk.creator === 'claude' ? '◆' : '⬡'} {sk.name}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.62rem', color: '#334155' }}>
                      <span><span style={{ color: '#4338ca' }}>◆</span> claude ({w.skills.filter(s => s.creator === 'claude').length})</span>
                      <span><span style={{ color: '#0284c7' }}>⬡</span> openclaw ({w.skills.filter(s => s.creator === 'openclaw').length})</span>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => openDesktop(w)}
                    style={{ color: '#38bdf8', fontSize: '0.8rem', background: '#0f172a', padding: '4px 10px', borderRadius: '4px', border: '1px solid #38bdf833', cursor: 'pointer' }}>
                    Desktop ⊞
                  </button>
                  <a href={`http://${w.ip}:6080`} target="_blank" rel="noreferrer"
                    style={{ color: '#475569', fontSize: '0.75rem', textDecoration: 'none' }}>
                    ↗
                  </a>
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

// --- Skill Graph ---
const CREATOR_COLOR = {
  claude:   { fill: '#312e81', stroke: '#818cf8', text: '#a5b4fc' },
  openclaw: { fill: '#0c4a6e', stroke: '#38bdf8', text: '#7dd3fc' },
  download: { fill: '#14532d', stroke: '#4ade80', text: '#86efac' },
  other:    { fill: '#1e293b', stroke: '#475569', text: '#94a3b8' },
};
const WORKER_COLOR = { fill: '#1e293b', stroke: '#f59e0b', text: '#fbbf24' };

function useForceGraph(nodes, edges, width, height) {
  const posRef = useRef({});
  const velRef = useRef({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!nodes.length) return;
    // Init positions if new nodes
    nodes.forEach(n => {
      if (!posRef.current[n.id]) {
        posRef.current[n.id] = {
          x: width / 2 + (Math.random() - 0.5) * 200,
          y: height / 2 + (Math.random() - 0.5) * 200,
        };
        velRef.current[n.id] = { x: 0, y: 0 };
      }
    });

    let frame;
    let running = true;
    const simulate = () => {
      if (!running) return;
      const pos = posRef.current;
      const vel = velRef.current;
      const ids = nodes.map(n => n.id);

      // Repulsion
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i], b = ids[j];
          const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 4000 / (dist * dist);
          vel[a].x -= (dx / dist) * force;
          vel[a].y -= (dy / dist) * force;
          vel[b].x += (dx / dist) * force;
          vel[b].y += (dy / dist) * force;
        }
      }
      // Attraction along edges
      edges.forEach(([a, b]) => {
        if (!pos[a] || !pos[b]) return;
        const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 120) * 0.04;
        vel[a].x += (dx / dist) * force;
        vel[a].y += (dy / dist) * force;
        vel[b].x -= (dx / dist) * force;
        vel[b].y -= (dy / dist) * force;
      });
      // Gravity + damping + bounds
      ids.forEach(id => {
        vel[id].x += (width / 2 - pos[id].x) * 0.008;
        vel[id].y += (height / 2 - pos[id].y) * 0.008;
        vel[id].x *= 0.85; vel[id].y *= 0.85;
        pos[id].x = Math.max(60, Math.min(width - 60, pos[id].x + vel[id].x));
        pos[id].y = Math.max(30, Math.min(height - 30, pos[id].y + vel[id].y));
      });
      setTick(t => t + 1);
      frame = requestAnimationFrame(simulate);
    };
    frame = requestAnimationFrame(simulate);
    return () => { running = false; cancelAnimationFrame(frame); };
  }, [nodes.length, edges.length, width, height]);

  return posRef.current;
}

function SkillGraph({ workers, skills }) {
  const W = 900, H = 480;
  const [hovered, setHovered] = useState(null);

  const nodes = [
    ...workers.map(w => ({ id: 'w:' + w.id, type: 'worker', label: w.id, data: w })),
    ...skills.map(s => ({ id: 's:' + s.name, type: 'skill', label: s.name, data: s })),
  ];

  const edges = [];
  workers.forEach(w => {
    (w.skills || []).forEach(sk => {
      if (skills.find(s => s.name === sk.name)) {
        edges.push(['w:' + w.id, 's:' + sk.name]);
      }
    });
  });

  const pos = useForceGraph(nodes, edges, W, H);

  return (
    <div style={{ background: '#0a0f1a', borderRadius: '10px', overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          {Object.entries(CREATOR_COLOR).map(([k, v]) => (
            <radialGradient key={k} id={`grad-${k}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={v.fill} stopOpacity="0.9" />
              <stop offset="100%" stopColor={v.stroke} stopOpacity="0.3" />
            </radialGradient>
          ))}
        </defs>

        {/* Edges */}
        {edges.map(([a, b], i) => {
          if (!pos[a] || !pos[b]) return null;
          const isHov = hovered === a || hovered === b;
          return (
            <line key={i}
              x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y}
              stroke={isHov ? '#f59e0b' : '#1e3a5f'}
              strokeWidth={isHov ? 1.5 : 0.8}
              strokeOpacity={isHov ? 0.9 : 0.4}
            />
          );
        })}

        {/* Skill nodes */}
        {nodes.filter(n => n.type === 'skill').map(n => {
          if (!pos[n.id]) return null;
          const c = CREATOR_COLOR[n.data.creator] || CREATOR_COLOR.other;
          const isHov = hovered === n.id;
          const r = isHov ? 28 : 22;
          return (
            <g key={n.id} transform={`translate(${pos[n.id].x},${pos[n.id].y})`}
              onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}>
              <circle r={r} fill={`url(#grad-${n.data.creator || 'other'})`} stroke={c.stroke} strokeWidth={isHov ? 2 : 1} />
              <text textAnchor="middle" dy="0.35em" fill={c.text} fontSize={isHov ? 9 : 8}
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label}
              </text>
              {isHov && (
                <text y={r + 12} textAnchor="middle" fill="#94a3b8" fontSize={8}
                  style={{ pointerEvents: 'none' }}>
                  {n.data.desc?.slice(0, 40)}
                </text>
              )}
            </g>
          );
        })}

        {/* Worker nodes */}
        {nodes.filter(n => n.type === 'worker').map(n => {
          if (!pos[n.id]) return null;
          const isHov = hovered === n.id;
          const sz = isHov ? 36 : 28;
          return (
            <g key={n.id} transform={`translate(${pos[n.id].x},${pos[n.id].y})`}
              onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'default' }}>
              <rect x={-sz/2} y={-sz/2} width={sz} height={sz} rx={4}
                fill={WORKER_COLOR.fill} stroke={WORKER_COLOR.stroke} strokeWidth={isHov ? 2 : 1.5} />
              <text textAnchor="middle" dy="0.35em" fill={WORKER_COLOR.text} fontSize={8} fontWeight="bold"
                style={{ pointerEvents: 'none', userSelect: 'none' }}>
                {n.label.replace('hw-worker-', 'w')}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 12, right: 16, display: 'flex', gap: '1rem', fontSize: '0.68rem' }}>
        {Object.entries(CREATOR_COLOR).map(([k, v]) => (
          <span key={k} style={{ color: v.text }}>● {k}</span>
        ))}
        <span style={{ color: WORKER_COLOR.text }}>■ worker</span>
      </div>
    </div>
  );
}

// --- Skills Tab ---
function SkillsTab({ workers }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installUrl, setInstallUrl] = useState('');
  const [newSkill, setNewSkill] = useState({ name: '', creator: 'claude', desc: '' });
  const [mode, setMode] = useState(null); // 'url' | 'manual'
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/skills');
      const d = await r.json();
      setSkills(d.skills || []);
    } catch {}
    setLoading(false);
  }

  async function installFromUrl() {
    if (!installUrl.trim()) return;
    setWorking(true);
    await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: installUrl }) });
    setInstallUrl(''); setMode(null); setWorking(false); load();
  }

  async function publishSkill() {
    if (!newSkill.name.trim()) return;
    setWorking(true);
    await fetch('/api/skills', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newSkill) });
    setNewSkill({ name: '', creator: 'claude', desc: '' }); setMode(null); setWorking(false); load();
  }

  async function deleteSkill(slug) {
    await fetch(`/api/skills?slug=${slug}`, { method: 'DELETE' });
    load();
  }

  useEffect(() => { load(); }, []);

  const byCreator = { claude: [], openclaw: [], download: [], other: [] };
  skills.forEach(s => { (byCreator[s.creator] || byCreator.other).push(s); });

  const creatorStyle = (c) => ({
    claude:    { bg: '#312e81', color: '#a5b4fc', border: '#4338ca44', icon: '◆' },
    openclaw:  { bg: '#0c4a6e', color: '#7dd3fc', border: '#0284c744', icon: '⬡' },
    download:  { bg: '#14532d', color: '#86efac', border: '#16a34a44', icon: '↓' },
    other:     { bg: '#1e293b', color: '#94a3b8', border: '#33415544', icon: '·' },
  }[c] || { bg: '#1e293b', color: '#94a3b8', border: '#33415544', icon: '·' });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{skills.length} shared skills on NFS · available to all workers</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => setMode(mode === 'url' ? null : 'url')} style={{ ...S.btn, background: '#0f172a', border: '1px solid #334155', color: '#94a3b8', fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>↓ Install from URL</button>
          <button onClick={() => setMode(mode === 'manual' ? null : 'manual')} style={{ ...S.btn, fontSize: '0.8rem', padding: '0.3rem 0.75rem' }}>+ Publish Skill</button>
          <button onClick={load} style={{ ...S.btn, background: '#0f172a', border: '1px solid #334155', color: '#64748b', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>↺</button>
        </div>
      </div>

      {mode === 'url' && (
        <div style={{ ...S.card, marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input style={{ ...S.input, fontSize: '0.82rem' }} value={installUrl} onChange={e => setInstallUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && installFromUrl()}
            placeholder="https://raw.githubusercontent.com/.../skill.sh" />
          <button style={S.btn} onClick={installFromUrl} disabled={working}>{working ? '...' : 'Install'}</button>
        </div>
      )}

      {mode === 'manual' && (
        <div style={{ ...S.card, marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input style={{ ...S.input, fontSize: '0.82rem', flex: '2' }} value={newSkill.name} onChange={e => setNewSkill(s => ({ ...s, name: e.target.value }))} placeholder="Skill name" />
          <select style={{ ...S.input, flex: '0 0 auto', width: 'auto' }} value={newSkill.creator} onChange={e => setNewSkill(s => ({ ...s, creator: e.target.value }))}>
            <option value="claude">claude</option>
            <option value="openclaw">openclaw</option>
          </select>
          <input style={{ ...S.input, fontSize: '0.82rem', flex: '3' }} value={newSkill.desc} onChange={e => setNewSkill(s => ({ ...s, desc: e.target.value }))} placeholder="Description" />
          <button style={S.btn} onClick={publishSkill} disabled={working}>{working ? '...' : 'Publish'}</button>
        </div>
      )}

      {loading && <div style={{ color: '#475569' }}>Loading...</div>}

      {!loading && <SkillGraph workers={workers} skills={skills} />}

      {!loading && Object.entries(byCreator).filter(([, arr]) => arr.length > 0).map(([creator, arr]) => {
        const st = creatorStyle(creator);
        return (
          <div key={creator} style={S.section}>
            <div style={S.sectionTitle}>{st.icon} {creator} ({arr.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {arr.map(sk => {
                const slug = sk.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                return (
                  <div key={sk.name} style={{
                    background: st.bg, border: `1px solid ${st.border}`, borderRadius: '8px', padding: '0.75rem',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ color: st.color, fontSize: '0.85rem', fontWeight: 'bold' }}>{st.icon} {sk.name}</span>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                        {sk.origin?.startsWith('http') && (
                          <a href={sk.origin} target="_blank" rel="noreferrer" style={{ color: st.color, fontSize: '0.7rem', opacity: 0.6, textDecoration: 'none' }}>↗</a>
                        )}
                        <button onClick={() => deleteSkill(slug)} style={{ background: 'none', border: 'none', color: st.color, opacity: 0.4, cursor: 'pointer', fontSize: '0.85rem', padding: '0', lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                    {sk.desc && <div style={{ color: '#cbd5e1', fontSize: '0.75rem', marginTop: '0.35rem', lineHeight: 1.5 }}>{sk.desc}</div>}
                    {sk.origin?.startsWith('skill:') && (
                      <div style={{ color: st.color, fontFamily: 'monospace', fontSize: '0.7rem', marginTop: '0.4rem', opacity: 0.7, background: '#0f172a', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>/{sk.origin.replace('skill:', '')}</div>
                    )}
                    {sk.created_at && (
                      <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: '0.4rem' }}>{new Date(sk.created_at).toLocaleDateString()}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!loading && !skills.length && (
        <div style={{ ...S.card, color: '#94a3b8', textAlign: 'center', padding: '2rem' }}>No shared skills yet. Publish one or install from a URL.</div>
      )}
    </div>
  );
}

// --- Linear Tab ---
const PRIORITY_LABEL = ['—', '!!', '!', '·', '↓'];
const PRIORITY_COLOR = ['#334155', '#ef4444', '#f97316', '#f59e0b', '#64748b'];

function LinearTab() {
  const [state, setState] = useState({ loading: true });

  async function load() {
    setState({ loading: true });
    try {
      const r = await fetch('/api/linear/data');
      const d = await r.json();
      if (d.not_configured) setState({ not_configured: true });
      else if (d.not_authenticated) {
        // Check if there's an error param in the URL (from failed callback)
        const urlError = new URLSearchParams(window.location.search).get('linear_error');
        setState({ not_authenticated: true, urlError });
      }
      else if (d.data) setState({ data: d.data });
      else setState({ error: JSON.stringify(d.errors || d) });
    } catch (e) {
      setState({ error: e.message });
    }
  }

  useEffect(() => { load(); }, []);

  if (state.loading) return <div style={{ color: '#475569' }}>Loading...</div>;

  if (state.not_configured) return (
    <div style={{ ...S.card, color: '#64748b', textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚙</div>
      <div style={{ marginBottom: '0.5rem' }}>LINEAR_CLIENT_ID not set on Vercel.</div>
      <div style={{ fontSize: '0.8rem', color: '#334155' }}>Add it as an environment variable and redeploy.</div>
    </div>
  );

  if (state.not_authenticated) return (
    <div style={{ ...S.card, textAlign: 'center', padding: '3rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>◈</div>
      <div style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.95rem' }}>Connect your Linear workspace to see issues</div>
      <a href="/api/linear/auth"
        style={{ background: '#5e6ad2', color: '#fff', borderRadius: '8px', padding: '0.6rem 1.5rem', textDecoration: 'none', fontSize: '0.9rem' }}>
        Connect Linear
      </a>
      {state.urlError && (
        <div style={{ marginTop: '1rem', color: '#ef4444', fontSize: '0.75rem', wordBreak: 'break-all' }}>
          Error: {decodeURIComponent(state.urlError)}
        </div>
      )}
    </div>
  );

  if (state.error) return (
    <div style={{ color: '#ef4444', padding: '1rem' }}>
      Error: {state.error}
      <button onClick={load} style={{ ...S.btn, marginLeft: '1rem', padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>Retry</button>
    </div>
  );

  const { viewer, teams } = state.data;
  const issues = viewer?.assignedIssues?.nodes || [];

  // Group by team
  const byTeam = {};
  issues.forEach(i => {
    const k = i.team?.key || '?';
    (byTeam[k] = byTeam[k] || []).push(i);
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>◈ {viewer?.name}</span>
          <span style={{ color: '#334155', fontSize: '0.8rem' }}>{issues.length} open issues</span>
          {teams?.nodes?.map(t => (
            <span key={t.id} style={{ background: t.color ? t.color + '22' : '#1e293b', color: t.color || '#64748b', borderRadius: '4px', padding: '2px 8px', fontSize: '0.75rem', border: `1px solid ${t.color || '#334155'}44` }}>
              {t.key}
            </span>
          ))}
        </div>
        <a href="/api/linear/disconnect" style={{ color: '#334155', fontSize: '0.75rem', textDecoration: 'none' }}>disconnect</a>
      </div>

      {Object.entries(byTeam).map(([teamKey, teamIssues]) => (
        <div key={teamKey} style={S.section}>
          <div style={S.sectionTitle}>{teamKey} · {teamIssues.length}</div>
          <div style={S.card}>
            {teamIssues.map((issue, idx) => (
              <a key={issue.id} href={issue.url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', textDecoration: 'none', color: 'inherit', borderBottom: idx < teamIssues.length - 1 ? '1px solid #0f172a' : 'none' }}
                onMouseEnter={e => e.currentTarget.style.background = '#0f172a'}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                {/* Priority */}
                <span style={{ color: PRIORITY_COLOR[issue.priority] || '#334155', fontSize: '0.75rem', fontWeight: 'bold', width: 14, textAlign: 'center', flexShrink: 0 }}>
                  {PRIORITY_LABEL[issue.priority] || '—'}
                </span>
                {/* State dot */}
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: issue.state?.color || '#334155', flexShrink: 0 }} />
                {/* Identifier */}
                <span style={{ color: '#334155', fontSize: '0.75rem', flexShrink: 0, width: 72 }}>{issue.identifier}</span>
                {/* Title */}
                <span style={{ color: '#e2e8f0', fontSize: '0.82rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.title}</span>
                {/* State name */}
                <span style={{ color: issue.state?.color || '#475569', fontSize: '0.72rem', flexShrink: 0 }}>{issue.state?.name}</span>
                {/* Time */}
                <span style={{ color: '#334155', fontSize: '0.7rem', flexShrink: 0 }}>
                  {new Date(issue.updatedAt).toLocaleDateString()}
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}

      {!issues.length && (
        <div style={{ ...S.card, color: '#334155', textAlign: 'center', padding: '2rem' }}>No open issues assigned to you.</div>
      )}
    </div>
  );
}

// --- Main ---
export default function Dashboard() {
  const [tab, setTab] = useState('workers');
  const [workers, setWorkers] = useState([]);
  const tabs = [['workers','Workers'], ['skills','Skills'], ['nfs','NFS Share'], ['linear','Linear']];

  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch('/api/status');
        const d = await r.json();
        setWorkers(Object.values(d.workers || {}));
      } catch {}
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

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
      {tab === 'workers' && <WorkersTab workers={workers} />}
      {tab === 'skills' && <SkillsTab workers={workers} />}
      {tab === 'nfs' && <NFSTab />}
      {tab === 'linear' && <LinearTab />}
    </div>
  );
}
