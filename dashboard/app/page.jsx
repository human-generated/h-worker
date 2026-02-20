'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// ── Design tokens (Habit Sequence × H-Worker merge) ──────────────────────────
const T = {
  bg:      '#F4F4F4',
  card:    '#FFFFFF',
  text:    '#0D0D0D',
  muted:   '#888888',
  faint:   'rgba(0,0,0,0.12)',
  border:  '1px solid rgba(0,0,0,0.06)',
  shadow:  '0 4px 20px rgba(0,0,0,0.05)',
  radius:  '2px',
  mono:    "'JetBrains Mono', monospace",
  ui:      "'Space Grotesk', sans-serif",
  // accent palette
  mint:    '#6CEFA0',
  blue:    '#6CDDEF',
  purple:  '#B06CEF',
  orange:  '#EF9B6C',
  red:     '#EF4444',
};

const S = {
  page: {
    fontFamily: T.ui, background: T.bg, color: T.text, minHeight: '100vh', padding: '1.5rem',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '1.5rem', borderBottom: T.border, paddingBottom: '1rem',
  },
  tabs: { display: 'flex', gap: '0.4rem', marginBottom: '1.5rem' },
  tab: (active) => ({
    background: active ? T.text : T.card,
    color: active ? '#fff' : T.muted,
    border: `1px solid ${active ? T.text : 'rgba(0,0,0,0.09)'}`,
    borderRadius: T.radius, padding: '0.38rem 1rem', cursor: 'pointer',
    fontSize: '0.7rem', fontFamily: T.mono, textTransform: 'uppercase', letterSpacing: '0.08em',
  }),
  section: { marginBottom: '2rem' },
  sectionTitle: {
    color: T.muted, fontSize: '0.62rem', fontFamily: T.mono,
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.75rem',
  },
  card: {
    background: T.card, borderRadius: T.radius, padding: '1rem',
    boxShadow: T.shadow, border: T.border,
  },
  badge: (color) => ({
    background: color, color: '#0D0D0D', borderRadius: T.radius,
    padding: '2px 7px', fontSize: '0.62rem', fontFamily: T.mono,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em',
  }),
  input: {
    background: 'transparent', border: 'none', borderBottom: '1px solid #E0E0E0',
    borderRadius: 0, padding: '0.5rem 0', color: T.text,
    fontFamily: T.mono, flex: 1, outline: 'none', fontSize: '0.85rem',
  },
  btn: {
    background: T.text, color: '#fff', border: 'none', borderRadius: T.radius,
    padding: '0.5rem 1.25rem', cursor: 'pointer',
    fontFamily: T.mono, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  btnGhost: {
    background: T.card, color: T.muted, border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: T.radius, padding: '0.38rem 0.75rem', cursor: 'pointer',
    fontFamily: T.mono, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  code: {
    background: T.bg, borderRadius: T.radius, padding: '1rem', fontSize: '0.8rem',
    overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto',
    fontFamily: T.mono, color: T.text, border: T.border,
  },
};

function statusLabel(w) {
  if (!w || w.status === 'inactive' || !w.status) return 'offline';
  if (w.status === 'failed') return 'failed';
  if (w.status === 'active') return (w.task && w.task !== 'idle') ? 'working' : 'idle';
  return w.status;
}
function statusColor(w) {
  const s = statusLabel(w);
  if (s === 'idle')    return T.mint;
  if (s === 'working') return T.orange;
  if (s === 'failed')  return T.red;
  if (s === 'offline') return '#E0E0E0';
  return T.blue;
}

// ── Logo SVG (HUMANS wordmark) ────────────────────────────────────────────────
function Logo() {
  return (
    <svg width="126" height="19" viewBox="0 0 189 28" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(-894,-15845)" fill={T.text}>
        <g transform="translate(894,15845)">
          <polygon points="11.4 6 14 9 3.6 21 1 18"/>
          <path fillRule="nonzero" d="M11.2845224,23.9921389 L11.2845224,28 L3.71547756,28 L3.71547756,23.9921389 L11.2845224,23.9921389 Z M3.71547756,23.9921389 C1.67911005,23.9921389 0,22.0931749 0,19.7401109 L3.55271368e-15,4.03466956 L3.71547756,4.03466956 L3.71547756,23.9921389 Z M15,23.9921389 L11.2845224,23.9921389 L11.2845224,4.03466956 C13.3208899,4.03466956 15,5.94633562 15,8.31513923 L15,23.9921389 Z M11.2845224,0 L11.2845224,4.03466956 L3.71547756,4.03466956 L3.71547756,0 L11.2845224,0 Z"/>
          <g transform="translate(20,0)" fillRule="nonzero">
            <polygon points="17.0634584 12.0228245 4.26586459 12.0228245 4.26586459 0.0399429387 0 0.0399429387 0 28 4.26586459 28 4.26586459 16.0171184 17.0634584 16.0171184 17.0634584 28 21.329323 28 21.329323 0.0399429387 17.0634584 0.0399429387"/>
            <path d="M42.7782496,0.0399429387 L42.7782496,24.0057061 L30.3793347,24.0057061 L30.3793347,0.0399429387 L26.1134702,0.0399429387 L26.1134702,24.0057061 C26.1134702,26.2025678 27.9075254,28 30.1401274,28 L43.0573248,28 C45.250059,28 47.0441142,26.2025678 47.0441142,24.0057061 L47.0441142,0.0399429387 L42.7782496,0.0399429387 Z"/>
            <path d="M75.50979,0.0399429387 C73.1177164,0.0399429387 71.2439255,1.95720399 71.2439255,4.31383738 L71.2439255,24.0057061 L66.2205709,24.0057061 L66.2205709,4.31383738 C66.2205709,1.95720399 64.306912,0.0399429387 61.9547063,0.0399429387 L56.2934654,0.0399429387 C53.9412597,0.0399429387 52.0276008,1.95720399 52.0276008,4.31383738 L52.0276008,28 L56.2934654,28 L56.2934654,4.0342368 L61.9547063,4.0342368 L61.9547063,23.7261056 C61.9547063,26.0827389 63.8284973,28 66.2205709,28 L71.2439255,28 C73.5961312,28 75.50979,26.0827389 75.50979,23.7261056 L75.50979,4.0342368 L81.5697098,4.0342368 L81.5697098,0.0399429387 L75.50979,0.0399429387 Z M81.5697098,28 L85.8355744,28 L85.8355744,4.0342368 L81.5697098,4.0342368 L81.5697098,28 Z"/>
            <path d="M108.281198,14.0199715 L95.4836046,14.0199715 L95.4836046,4.0342368 L108.281198,4.0342368 L108.281198,0.0399429387 L95.4836046,0.0399429387 C93.1313989,0.0399429387 91.21774,1.95720399 91.21774,4.31383738 L91.21774,28 L95.4836046,28 L95.4836046,18.0142653 L108.281198,18.0142653 L108.281198,28 L112.547063,28 L112.547063,4.0342368 L108.281198,4.0342368 L108.281198,14.0199715 Z"/>
            <path d="M138.620665,24.0057061 L132.241802,24.0057061 L132.241802,28 L138.620665,28 L138.620665,27.9600571 C140.972871,27.9600571 142.88653,26.042796 142.88653,23.6861626 L142.88653,0 L138.620665,0 L138.620665,24.0057061 Z M132.241802,4.27389444 C132.241802,1.87731812 130.328143,0.0399429387 127.975938,0.0399429387 L121.597075,0.0399429387 C119.244869,0.0399429387 117.33121,1.87731812 117.33121,4.27389444 L117.33121,28 L121.597075,28 L121.597075,3.99429387 L127.975938,3.99429387 L127.975938,23.9657632 L132.241802,23.9657632 L132.241802,4.27389444 Z"/>
            <path d="M168.202642,0.0399429387 L151.936542,0.0399429387 C149.584336,0.0399429387 147.670677,1.95720399 147.670677,4.31383738 L147.670677,12.0228245 L151.936542,12.0228245 L151.936542,4.07417974 L168.202642,4.07417974 L168.202642,0.0399429387 Z M151.936542,12.0228245 L151.936542,16.0570613 L164.734135,16.0570613 L164.734135,24.0456491 L148.468035,24.0456491 L148.468035,28 L164.734135,28 C167.086341,28 169,26.0827389 169,23.7261056 L169,16.0570613 C169,13.8202568 167.205945,12.0228245 164.973343,12.0228245 L151.936542,12.0228245 Z"/>
          </g>
        </g>
      </g>
    </svg>
  );
}

// ── Draggable Desktop Window (stays dark — it's a screen) ────────────────────
function DesktopWindow({ worker, onClose }) {
  const [pos, setPos] = useState({ x: Math.random() * 200 + 80, y: Math.random() * 100 + 80 });
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [imgTs, setImgTs] = useState(Date.now());
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') { setImgTs(Date.now()); setImgError(false); }
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

  const onDragStart = (e) => { setDragging(true); setDragOffset({ x: e.clientX - pos.x, y: e.clientY - pos.y }); e.preventDefault(); };

  return (
    <div style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000, width: 660,
      background: '#0f172a', border: '1px solid #1e293b', borderRadius: '4px',
      boxShadow: '0 24px 80px rgba(0,0,0,0.4)', userSelect: 'none',
    }}>
      <div onMouseDown={onDragStart} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.5rem 0.75rem', borderBottom: '1px solid #1e293b',
        cursor: dragging ? 'grabbing' : 'grab',
        background: '#1e293b', borderRadius: '4px 4px 0 0',
      }}>
        <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontFamily: T.mono }}>
          ⊞ {worker.id} · {worker.ip}
        </span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <a href={`http://${worker.ip}:6080`} target="_blank" rel="noreferrer"
            onMouseDown={e => e.stopPropagation()}
            style={{ color: '#475569', fontSize: '0.72rem', textDecoration: 'none', fontFamily: T.mono }}>
            ↗ fullscreen
          </a>
          <button onMouseDown={e => e.stopPropagation()} onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1, padding: '0 2px' }}>
            ×
          </button>
        </div>
      </div>
      <div style={{ background: '#000', borderRadius: '0 0 4px 4px', position: 'relative', height: 412, overflow: 'hidden' }}>
        {imgError ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#334155', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontSize: '2rem' }}>⊘</div>
            <div style={{ fontSize: '0.75rem', fontFamily: T.mono }}>unavailable</div>
          </div>
        ) : (
          <img key={imgTs} src={`/api/screenshot?ip=${worker.ip}&t=${imgTs}`} alt="desktop"
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        )}
        <div style={{ position: 'absolute', bottom: 6, right: 10, color: '#1e293b', fontSize: '0.62rem', fontFamily: T.mono }}>
          live · 4s
        </div>
      </div>
    </div>
  );
}

// ── Workers Tab ───────────────────────────────────────────────────────────────
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
  function closeDesktop(id) { setOpenDesktops(prev => prev.filter(w => w.id !== id)); }
  function handleCardEnter(workerId) { setHover(workerId); setHoverTs(prev => ({ ...prev, [workerId]: Date.now() })); }

  async function addTask() {
    if (!newTask.trim()) return;
    await fetch('/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: newTask }) });
    setNewTask(''); fetchTasks();
  }

  return (
    <div>
      {openDesktops.map(w => <DesktopWindow key={w.id} worker={w} onClose={() => closeDesktop(w.id)} />)}

      <div style={S.section}>
        <div style={S.sectionTitle}>Workers ({workers.length}/4) · {ts}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1rem' }}>
          {workers.map(w => {
            const color = statusColor(w);
            const isHovered = hover === w.id;
            const screenshotTs = hoverTs[w.id] || 0;
            return (
              <div key={w.id}
                style={{ ...S.card, borderLeft: `3px solid ${color}`, position: 'relative' }}
                onMouseEnter={() => handleCardEnter(w.id)}
                onMouseLeave={() => setHover(null)}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ color: T.text, fontFamily: T.mono, fontSize: '0.82rem' }}>{w.id}</strong>
                  <span style={S.badge(color)}>{statusLabel(w)}</span>
                </div>
                <div style={{ color: T.muted, fontSize: '0.75rem', marginTop: '0.5rem', fontFamily: T.mono, lineHeight: 1.7 }}>
                  <div>{w.ip}</div>
                  <div style={{ color: (w.task && w.task !== 'idle') ? T.orange : 'rgba(0,0,0,0.25)' }}>
                    {w.task || 'idle'}
                  </div>
                  <div style={{ color: 'rgba(0,0,0,0.2)', fontSize: '0.68rem' }}>{w.updated_at?.slice(11,19)} utc</div>
                </div>

                {/* Screenshot preview */}
                <div style={{
                  marginTop: '0.75rem', overflow: 'hidden', borderRadius: T.radius,
                  height: isHovered ? 160 : 0, transition: 'height 0.15s ease',
                  background: T.bg, border: isHovered ? T.border : 'none',
                }}>
                  {screenshotTs > 0 && (
                    <img src={`/api/screenshot?ip=${w.ip}&t=${screenshotTs}`} alt="preview"
                      style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}
                      onError={e => { e.target.style.opacity = '0.1'; }} />
                  )}
                </div>

                {/* Skills */}
                {w.skills?.length > 0 && (
                  <div style={{ marginTop: '0.75rem', borderTop: T.border, paddingTop: '0.6rem' }}>
                    <div style={{ color: 'rgba(0,0,0,0.2)', fontSize: '0.58rem', fontFamily: T.mono, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.4rem' }}>skills</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {w.skills.map(sk => (
                        <span key={sk.name} title={sk.desc} style={{
                          fontSize: '0.64rem', padding: '2px 6px', borderRadius: T.radius,
                          fontFamily: T.mono,
                          background: sk.creator === 'claude' ? '#EDE9FE' : '#E0F2FE',
                          color: sk.creator === 'claude' ? '#5B21B6' : '#0369A1',
                          border: `1px solid ${sk.creator === 'claude' ? '#7C3AED22' : '#0284C722'}`,
                        }}>
                          {sk.creator === 'claude' ? '◆' : '⬡'} {sk.name}
                        </span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.6rem', fontFamily: T.mono, color: 'rgba(0,0,0,0.25)' }}>
                      <span><span style={{ color: '#7C3AED' }}>◆</span> claude ({w.skills.filter(s => s.creator === 'claude').length})</span>
                      <span><span style={{ color: '#0284C7' }}>⬡</span> openclaw ({w.skills.filter(s => s.creator === 'openclaw').length})</span>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button onClick={() => openDesktop(w)} style={{
                    ...S.btnGhost, fontSize: '0.7rem', padding: '3px 10px',
                  }}>Desktop ⊞</button>
                  <a href={`http://${w.ip}:6080`} target="_blank" rel="noreferrer"
                    style={{ color: T.muted, fontSize: '0.75rem', textDecoration: 'none' }}>↗</a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Assign Task</div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', ...S.card }}>
          <input style={S.input} value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTask()} placeholder="task description..." />
          <button style={{ ...S.btn, flexShrink: 0 }} onClick={addTask}>Assign</button>
        </div>
      </div>

      <div style={S.section}>
        <div style={S.sectionTitle}>Task Log ({tasks.length})</div>
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: T.mono }}>
            <thead>
              <tr style={{ color: T.muted, textAlign: 'left', borderBottom: T.border }}>
                {['ID','Description','Status','Worker','Time'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.75rem', fontWeight: 500, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.slice(0,50).map(t => (
                <tr key={t.id} style={{ borderBottom: T.border }}>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'rgba(0,0,0,0.25)' }}>{t.id.slice(-6)}</td>
                  <td style={{ padding: '0.45rem 0.75rem' }}>{t.description}</td>
                  <td style={{ padding: '0.45rem 0.75rem' }}>
                    <span style={{ color: t.status==='done' ? T.mint : t.status==='assigned' ? T.orange : T.muted }}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.45rem 0.75rem', color: T.muted }}>{t.worker||'—'}</td>
                  <td style={{ padding: '0.45rem 0.75rem', color: 'rgba(0,0,0,0.3)' }}>{t.created_at?.slice(11,19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!tasks.length && <div style={{ color: 'rgba(0,0,0,0.2)', padding: '1rem 0.75rem', fontFamily: T.mono, fontSize: '0.78rem' }}>No tasks yet.</div>}
        </div>
      </div>
    </div>
  );
}

// ── NFS Tab ───────────────────────────────────────────────────────────────────
function NFSTab() {
  const [path, setPath] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load(p) {
    setLoading(true);
    const r = await fetch(`/api/nfs?path=${encodeURIComponent(p)}`);
    const d = await r.json();
    setData(d); setPath(p); setLoading(false);
  }

  useEffect(() => { load(''); }, []);
  const parts = path.split('/').filter(Boolean);

  return (
    <div>
      <div style={{ marginBottom: '1rem', fontSize: '0.78rem', fontFamily: T.mono, color: T.muted }}>
        <span style={{ cursor: 'pointer', color: T.text }} onClick={() => load('')}>/mnt/shared</span>
        {parts.map((p, i) => (
          <span key={i}>
            <span style={{ margin: '0 0.25rem', color: 'rgba(0,0,0,0.2)' }}>/</span>
            <span style={{ cursor: 'pointer', color: T.text }} onClick={() => load(parts.slice(0,i+1).join('/'))}>{p}</span>
          </span>
        ))}
      </div>

      {loading && <div style={{ color: T.muted, fontFamily: T.mono, fontSize: '0.78rem' }}>loading...</div>}
      {data?.error && <div style={{ color: T.red, fontFamily: T.mono, fontSize: '0.78rem' }}>Error: {data.error}</div>}

      {data?.type === 'dir' && (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          {path && (
            <div style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', color: T.muted, borderBottom: T.border, fontFamily: T.mono, fontSize: '0.78rem' }}
              onClick={() => load(parts.slice(0,-1).join('/'))}>📁 ..</div>
          )}
          {!data.entries?.length && <div style={{ color: 'rgba(0,0,0,0.25)', padding: '0.75rem', fontFamily: T.mono, fontSize: '0.78rem' }}>Empty directory</div>}
          {data.entries?.map(e => (
            <div key={e.name} style={{ padding: '0.45rem 0.75rem', cursor: 'pointer', borderBottom: T.border, display: 'flex', gap: '0.5rem', alignItems: 'center', transition: 'background 0.1s' }}
              onClick={() => load(path ? `${path}/${e.name}` : e.name)}
              onMouseEnter={ev => ev.currentTarget.style.background = T.bg}
              onMouseLeave={ev => ev.currentTarget.style.background = ''}>
              <span style={{ fontSize: '0.85rem' }}>{e.type === 'dir' ? '📁' : '📄'}</span>
              <span style={{ fontFamily: T.mono, fontSize: '0.78rem', color: e.type === 'dir' ? T.text : T.text }}>{e.name}</span>
              {e.type === 'file' && <span style={{ color: T.muted, fontSize: '0.68rem', marginLeft: 'auto', fontFamily: T.mono }}>{(e.size/1024).toFixed(1)}kb</span>}
              <span style={{ color: 'rgba(0,0,0,0.2)', fontSize: '0.68rem', marginLeft: 'auto', fontFamily: T.mono }}>{new Date(e.modified).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}

      {data?.type === 'file' && (
        <div>
          <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: T.mono, fontSize: '0.78rem', color: T.muted }}>{parts[parts.length-1]}</span>
            <button style={S.btnGhost} onClick={() => load(parts.slice(0,-1).join('/'))}>← back</button>
          </div>
          <div style={S.code}>{data.content}</div>
        </div>
      )}
    </div>
  );
}

// ── Skill Graph ───────────────────────────────────────────────────────────────
const CREATOR_COLOR = {
  claude:   { fill: '#EDE9FE', stroke: '#7C3AED', text: '#5B21B6' },
  openclaw: { fill: '#E0F2FE', stroke: '#0284C7', text: '#075985' },
  download: { fill: '#DCFCE7', stroke: '#16A34A', text: '#14532D' },
  other:    { fill: '#F1F5F9', stroke: '#94A3B8', text: '#475569' },
};
const WORKER_COLOR = { fill: '#FEF3C7', stroke: '#D97706', text: '#78350F' };

function useForceGraph(nodes, edges, width, height) {
  const posRef = useRef({});
  const velRef = useRef({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!nodes.length) return;
    nodes.forEach(n => {
      if (!posRef.current[n.id]) {
        posRef.current[n.id] = { x: width/2 + (Math.random()-0.5)*200, y: height/2 + (Math.random()-0.5)*200 };
        velRef.current[n.id] = { x: 0, y: 0 };
      }
    });
    let frame; let running = true;
    const simulate = () => {
      if (!running) return;
      const pos = posRef.current, vel = velRef.current;
      const ids = nodes.map(n => n.id);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i+1; j < ids.length; j++) {
          const a = ids[i], b = ids[j];
          const dx = pos[b].x-pos[a].x, dy = pos[b].y-pos[a].y;
          const dist = Math.max(Math.sqrt(dx*dx+dy*dy), 1);
          const force = 4000/(dist*dist);
          vel[a].x -= (dx/dist)*force; vel[a].y -= (dy/dist)*force;
          vel[b].x += (dx/dist)*force; vel[b].y += (dy/dist)*force;
        }
      }
      edges.forEach(([a,b]) => {
        if (!pos[a]||!pos[b]) return;
        const dx = pos[b].x-pos[a].x, dy = pos[b].y-pos[a].y;
        const dist = Math.max(Math.sqrt(dx*dx+dy*dy), 1);
        const force = (dist-120)*0.04;
        vel[a].x += (dx/dist)*force; vel[a].y += (dy/dist)*force;
        vel[b].x -= (dx/dist)*force; vel[b].y -= (dy/dist)*force;
      });
      ids.forEach(id => {
        vel[id].x += (width/2-pos[id].x)*0.008; vel[id].y += (height/2-pos[id].y)*0.008;
        vel[id].x *= 0.85; vel[id].y *= 0.85;
        pos[id].x = Math.max(60, Math.min(width-60, pos[id].x+vel[id].x));
        pos[id].y = Math.max(30, Math.min(height-30, pos[id].y+vel[id].y));
      });
      setTick(t => t+1);
      frame = requestAnimationFrame(simulate);
    };
    frame = requestAnimationFrame(simulate);
    return () => { running = false; cancelAnimationFrame(frame); };
  }, [nodes.length, edges.length, width, height]);

  return posRef.current;
}

function SkillGraph({ workers, skills, onRefresh }) {
  const W = 960, H = 560;
  const [hovered, setHovered] = useState(null);

  const nodes = [
    ...workers.map(w => ({ id: 'w:'+w.id, type: 'worker', label: w.id, data: w })),
    ...skills.map(s  => ({ id: 's:'+s.name, type: 'skill',  label: s.name, data: s })),
  ];
  const workerEdges = [];
  workers.forEach(w => {
    (w.skills||[]).forEach(sk => {
      if (skills.find(s => s.name === sk.name)) workerEdges.push(['w:'+w.id, 's:'+sk.name]);
    });
  });
  const skillEdges = [];
  skills.forEach(s => {
    (s.parents||[]).forEach(p => {
      if (skills.find(x => x.name === p)) skillEdges.push(['s:'+p, 's:'+s.name]);
    });
  });
  const allEdges = [...workerEdges, ...skillEdges];
  const pos = useForceGraph(nodes, allEdges, W, H);

  function shortenLine(ax, ay, bx, by, r) {
    const dx = bx-ax, dy = by-ay, len = Math.sqrt(dx*dx+dy*dy)||1;
    return { x2: bx-(dx/len)*r, y2: by-(dy/len)*r };
  }

  return (
    <div style={{ background: '#FAFAFA', border: T.border, borderRadius: T.radius, overflow: 'hidden', marginBottom: '1.5rem', position: 'relative' }}>
      {onRefresh && (
        <button onClick={onRefresh} style={{
          position: 'absolute', top: 10, right: 12, zIndex: 2,
          background: 'none', border: '1px solid rgba(0,0,0,0.1)', borderRadius: T.radius,
          color: T.muted, fontSize: '0.7rem', fontFamily: T.mono, cursor: 'pointer', padding: '2px 8px',
        }}>↺</button>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        <defs>
          {Object.entries(CREATOR_COLOR).map(([k,v]) => (
            <radialGradient key={k} id={`grad-${k}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={v.fill} stopOpacity="1" />
              <stop offset="100%" stopColor={v.stroke} stopOpacity="0.15" />
            </radialGradient>
          ))}
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#CBD5E1" />
          </marker>
          <marker id="arrow-hov" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={T.orange} />
          </marker>
        </defs>

        {/* Worker→skill dashed edges */}
        {workerEdges.map(([a,b],i) => {
          if (!pos[a]||!pos[b]) return null;
          const isHov = hovered===a||hovered===b;
          return <line key={'we'+i} x1={pos[a].x} y1={pos[a].y} x2={pos[b].x} y2={pos[b].y}
            stroke={isHov ? T.orange : '#E2E8F0'} strokeWidth={isHov ? 1.2 : 0.8}
            strokeOpacity={isHov ? 0.8 : 0.6} strokeDasharray="3 3" />;
        })}

        {/* Skill→skill dependency edges with arrows */}
        {skillEdges.map(([a,b],i) => {
          if (!pos[a]||!pos[b]) return null;
          const isHov = hovered===a||hovered===b;
          const {x2,y2} = shortenLine(pos[a].x, pos[a].y, pos[b].x, pos[b].y, 25);
          return <line key={'se'+i} x1={pos[a].x} y1={pos[a].y} x2={x2} y2={y2}
            stroke={isHov ? T.orange : '#CBD5E1'} strokeWidth={isHov ? 1.8 : 1.1}
            strokeOpacity={isHov ? 1 : 0.7}
            markerEnd={isHov ? 'url(#arrow-hov)' : 'url(#arrow)'} />;
        })}

        {/* Skill nodes */}
        {nodes.filter(n => n.type==='skill').map(n => {
          if (!pos[n.id]) return null;
          const c = CREATOR_COLOR[n.data.creator] || CREATOR_COLOR.other;
          const isHov = hovered===n.id;
          const r = isHov ? 30 : 24;
          return (
            <g key={n.id} transform={`translate(${pos[n.id].x},${pos[n.id].y})`}
              onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)}>
              <circle r={r} fill={`url(#grad-${n.data.creator||'other'})`}
                stroke={c.stroke} strokeWidth={isHov ? 2 : 1.2} />
              <text textAnchor="middle" dy="0.35em" fill={c.text} fontSize={isHov ? 9 : 8}
                style={{ pointerEvents:'none', userSelect:'none', fontFamily: T.mono }}>
                {n.label.length>12 ? n.label.slice(0,11)+'…' : n.label}
              </text>
              {isHov && <>
                <text y={r+13} textAnchor="middle" fill="#888" fontSize={8}
                  style={{ pointerEvents:'none', fontFamily: T.ui }}>
                  {n.data.desc?.slice(0,45)}
                </text>
                {(n.data.parents||[]).length > 0 && (
                  <text y={r+24} textAnchor="middle" fill="#AAAAAA" fontSize={7.5}
                    style={{ pointerEvents:'none', fontFamily: T.mono }}>
                    needs: {n.data.parents.join(', ')}
                  </text>
                )}
              </>}
            </g>
          );
        })}

        {/* Worker nodes */}
        {nodes.filter(n => n.type==='worker').map(n => {
          if (!pos[n.id]) return null;
          const isHov = hovered===n.id;
          const sz = isHov ? 38 : 30;
          return (
            <g key={n.id} transform={`translate(${pos[n.id].x},${pos[n.id].y})`}
              onMouseEnter={() => setHovered(n.id)} onMouseLeave={() => setHovered(null)}>
              <rect x={-sz/2} y={-sz/2} width={sz} height={sz} rx={2}
                fill={WORKER_COLOR.fill} stroke={WORKER_COLOR.stroke} strokeWidth={isHov ? 2 : 1.5} />
              <text textAnchor="middle" dy="0.35em" fill={WORKER_COLOR.text} fontSize={8} fontWeight="bold"
                style={{ pointerEvents:'none', userSelect:'none', fontFamily: T.mono }}>
                {n.label.replace('hw-worker-','w')}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ position:'absolute', bottom:10, left:14, display:'flex', gap:'1.25rem', fontSize:'0.62rem', fontFamily: T.mono, color: T.muted }}>
        <span style={{ borderBottom: '1px dashed #CBD5E1', paddingBottom: 1 }}>worker uses</span>
        <span style={{ color: '#94A3B8' }}>→ depends on</span>
      </div>
      <div style={{ position:'absolute', bottom:10, right:16, display:'flex', gap:'1rem', fontSize:'0.62rem', fontFamily: T.mono }}>
        {Object.entries(CREATOR_COLOR).map(([k,v]) => <span key={k} style={{ color: v.text }}>● {k}</span>)}
        <span style={{ color: WORKER_COLOR.text }}>■ worker</span>
      </div>
    </div>
  );
}

// ── Skills Tab ────────────────────────────────────────────────────────────────
function SkillsTab({ workers }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [installUrl, setInstallUrl] = useState('');
  const [newSkill, setNewSkill] = useState({ name: '', creator: 'claude', desc: '' });
  const [mode, setMode] = useState(null);
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    try { const r = await fetch('/api/skills'); const d = await r.json(); setSkills(d.skills || []); } catch {}
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

  async function deleteSkill(slug) { await fetch(`/api/skills?slug=${slug}`, { method: 'DELETE' }); load(); }

  useEffect(() => { load(); }, []);

  const byCreator = { claude: [], openclaw: [], download: [], other: [] };
  skills.forEach(s => { (byCreator[s.creator] || byCreator.other).push(s); });

  const creatorStyle = (c) => ({
    claude:   { bg: '#EDE9FE', color: '#5B21B6', border: '#7C3AED1A', icon: '◆' },
    openclaw: { bg: '#E0F2FE', color: '#075985', border: '#0284C71A', icon: '⬡' },
    download: { bg: '#DCFCE7', color: '#14532D', border: '#16A34A1A', icon: '↓' },
    other:    { bg: '#F1F5F9', color: '#475569', border: '#94A3B81A', icon: '·' },
  }[c] || { bg: '#F1F5F9', color: '#475569', border: '#94A3B81A', icon: '·' });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ color: T.muted, fontSize: '0.72rem', fontFamily: T.mono }}>{skills.length} shared skills · available to all workers</div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button onClick={() => setMode(mode==='url' ? null : 'url')} style={S.btnGhost}>↓ install url</button>
          <button onClick={() => setMode(mode==='manual' ? null : 'manual')} style={S.btn}>+ publish</button>
          <button onClick={load} style={{ ...S.btnGhost, padding: '0.38rem 0.6rem' }}>↺</button>
        </div>
      </div>

      {mode === 'url' && (
        <div style={{ ...S.card, marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <input style={S.input} value={installUrl} onChange={e => setInstallUrl(e.target.value)}
            onKeyDown={e => e.key==='Enter' && installFromUrl()}
            placeholder="https://raw.githubusercontent.com/.../skill.sh" />
          <button style={{ ...S.btn, flexShrink: 0 }} onClick={installFromUrl} disabled={working}>{working ? '...' : 'install'}</button>
        </div>
      )}

      {mode === 'manual' && (
        <div style={{ ...S.card, marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input style={{ ...S.input, flex: 2 }} value={newSkill.name} onChange={e => setNewSkill(s => ({...s, name: e.target.value}))} placeholder="skill name" />
          <select style={{ ...S.input, flex: '0 0 auto', width: 'auto', cursor: 'pointer' }} value={newSkill.creator} onChange={e => setNewSkill(s => ({...s, creator: e.target.value}))}>
            <option value="claude">claude</option>
            <option value="openclaw">openclaw</option>
          </select>
          <input style={{ ...S.input, flex: 3 }} value={newSkill.desc} onChange={e => setNewSkill(s => ({...s, desc: e.target.value}))} placeholder="description" />
          <button style={{ ...S.btn, flexShrink: 0 }} onClick={publishSkill} disabled={working}>{working ? '...' : 'publish'}</button>
        </div>
      )}

      {loading && <div style={{ color: T.muted, fontFamily: T.mono, fontSize: '0.78rem' }}>loading...</div>}

      {!loading && <SkillGraph workers={workers} skills={skills} onRefresh={load} />}

      {!loading && Object.entries(byCreator).filter(([,arr]) => arr.length > 0).map(([creator, arr]) => {
        const st = creatorStyle(creator);
        return (
          <div key={creator} style={S.section}>
            <div style={S.sectionTitle}>{st.icon} {creator} ({arr.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
              {arr.map(sk => {
                const slug = sk.name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
                return (
                  <div key={sk.name} style={{ background: st.bg, border: `1px solid ${st.border}`, borderRadius: T.radius, padding: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <span style={{ color: st.color, fontSize: '0.82rem', fontFamily: T.mono, fontWeight: 500 }}>{st.icon} {sk.name}</span>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                        {sk.origin?.startsWith('http') && (
                          <a href={sk.origin} target="_blank" rel="noreferrer" style={{ color: st.color, fontSize: '0.7rem', opacity: 0.5, textDecoration: 'none' }}>↗</a>
                        )}
                        <button onClick={() => deleteSkill(slug)} style={{ background: 'none', border: 'none', color: st.color, opacity: 0.35, cursor: 'pointer', fontSize: '0.9rem', padding: 0, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                    {sk.desc && <div style={{ color: '#555', fontSize: '0.75rem', marginTop: '0.35rem', lineHeight: 1.5, fontFamily: T.ui }}>{sk.desc}</div>}
                    {sk.origin?.startsWith('skill:') && (
                      <div style={{ color: st.color, fontFamily: T.mono, fontSize: '0.68rem', marginTop: '0.4rem', opacity: 0.7, background: 'rgba(0,0,0,0.04)', padding: '2px 6px', borderRadius: T.radius, display: 'inline-block' }}>/{sk.origin.replace('skill:','')}</div>
                    )}
                    {sk.created_at && (
                      <div style={{ color: T.muted, fontSize: '0.65rem', marginTop: '0.4rem', fontFamily: T.mono }}>{new Date(sk.created_at).toLocaleDateString()}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {!loading && !skills.length && (
        <div style={{ ...S.card, color: T.muted, textAlign: 'center', padding: '2rem', fontFamily: T.mono, fontSize: '0.78rem' }}>
          No shared skills yet. Publish one or install from a URL.
        </div>
      )}
    </div>
  );
}

// ── Linear Tab ────────────────────────────────────────────────────────────────
const PRIORITY_LABEL = ['—','!!','!','·','↓'];
const PRIORITY_COLOR = ['rgba(0,0,0,0.15)', T.red, T.orange, '#D97706', 'rgba(0,0,0,0.2)'];

function LinearTab() {
  const [state, setState] = useState({ loading: true });

  async function load() {
    setState({ loading: true });
    try {
      const r = await fetch('/api/linear/data');
      const d = await r.json();
      if (d.not_configured) setState({ not_configured: true });
      else if (d.not_authenticated) {
        const urlError = new URLSearchParams(window.location.search).get('linear_error');
        setState({ not_authenticated: true, urlError });
      }
      else if (d.data) setState({ data: d.data });
      else setState({ error: JSON.stringify(d.errors || d) });
    } catch (e) { setState({ error: e.message }); }
  }

  useEffect(() => { load(); }, []);

  if (state.loading) return <div style={{ color: T.muted, fontFamily: T.mono, fontSize: '0.78rem' }}>loading...</div>;

  if (state.not_configured) return (
    <div style={{ ...S.card, color: T.muted, textAlign: 'center', padding: '2rem' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚙</div>
      <div style={{ marginBottom: '0.5rem', fontFamily: T.mono, fontSize: '0.78rem' }}>LINEAR_CLIENT_ID not set on Vercel.</div>
      <div style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.2)', fontFamily: T.mono }}>Add it as an environment variable and redeploy.</div>
    </div>
  );

  if (state.not_authenticated) return (
    <div style={{ ...S.card, textAlign: 'center', padding: '3rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>◈</div>
      <div style={{ color: T.muted, marginBottom: '1.5rem', fontSize: '0.9rem' }}>Connect your Linear workspace to see issues</div>
      <a href="/api/linear/auth" style={{
        background: '#5e6ad2', color: '#fff', borderRadius: T.radius,
        padding: '0.6rem 1.5rem', textDecoration: 'none', fontSize: '0.85rem',
        fontFamily: T.mono, textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>Connect Linear</a>
      {state.urlError && (
        <div style={{ marginTop: '1rem', color: T.red, fontSize: '0.72rem', fontFamily: T.mono, wordBreak: 'break-all' }}>
          Error: {decodeURIComponent(state.urlError)}
        </div>
      )}
    </div>
  );

  if (state.error) return (
    <div style={{ color: T.red, padding: '1rem', fontFamily: T.mono, fontSize: '0.78rem' }}>
      Error: {state.error}
      <button onClick={load} style={{ ...S.btnGhost, marginLeft: '1rem' }}>retry</button>
    </div>
  );

  const { viewer, teams } = state.data;
  const issues = viewer?.assignedIssues?.nodes || [];
  const byTeam = {};
  issues.forEach(i => { const k = i.team?.key||'?'; (byTeam[k]=byTeam[k]||[]).push(i); });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <span style={{ color: T.muted, fontSize: '0.82rem' }}>◈ {viewer?.name}</span>
          <span style={{ color: 'rgba(0,0,0,0.25)', fontSize: '0.75rem', fontFamily: T.mono }}>{issues.length} open</span>
          {teams?.nodes?.map(t => (
            <span key={t.id} style={{ background: t.color ? t.color+'18' : T.bg, color: t.color||T.muted, borderRadius: T.radius, padding: '2px 8px', fontSize: '0.7rem', fontFamily: T.mono, border: `1px solid ${t.color||'rgba(0,0,0,0.08)'}30` }}>
              {t.key}
            </span>
          ))}
        </div>
        <a href="/api/linear/disconnect" style={{ color: 'rgba(0,0,0,0.2)', fontSize: '0.7rem', textDecoration: 'none', fontFamily: T.mono }}>disconnect</a>
      </div>

      {Object.entries(byTeam).map(([teamKey, teamIssues]) => (
        <div key={teamKey} style={S.section}>
          <div style={S.sectionTitle}>{teamKey} · {teamIssues.length}</div>
          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            {teamIssues.map((issue, idx) => (
              <a key={issue.id} href={issue.url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.55rem 0.75rem', textDecoration: 'none', color: 'inherit', borderBottom: idx < teamIssues.length-1 ? T.border : 'none', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = T.bg}
                onMouseLeave={e => e.currentTarget.style.background = ''}>
                <span style={{ color: PRIORITY_COLOR[issue.priority]||'rgba(0,0,0,0.15)', fontSize: '0.72rem', fontFamily: T.mono, fontWeight: '600', width: 14, textAlign: 'center', flexShrink: 0 }}>
                  {PRIORITY_LABEL[issue.priority]||'—'}
                </span>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: issue.state?.color||'#E0E0E0', flexShrink: 0 }} />
                <span style={{ color: T.muted, fontSize: '0.7rem', flexShrink: 0, width: 72, fontFamily: T.mono }}>{issue.identifier}</span>
                <span style={{ color: T.text, fontSize: '0.82rem', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.title}</span>
                <span style={{ color: issue.state?.color||T.muted, fontSize: '0.7rem', flexShrink: 0, fontFamily: T.mono }}>{issue.state?.name}</span>
                <span style={{ color: 'rgba(0,0,0,0.25)', fontSize: '0.68rem', flexShrink: 0, fontFamily: T.mono }}>{new Date(issue.updatedAt).toLocaleDateString()}</span>
              </a>
            ))}
          </div>
        </div>
      ))}

      {!issues.length && (
        <div style={{ ...S.card, color: T.muted, textAlign: 'center', padding: '2rem', fontFamily: T.mono, fontSize: '0.78rem' }}>No open issues assigned to you.</div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState('workers');
  const [workers, setWorkers] = useState([]);
  const tabs = [['workers','Workers'],['skills','Skills'],['nfs','NFS Share'],['linear','Linear']];

  useEffect(() => {
    async function poll() {
      try { const r = await fetch('/api/status'); const d = await r.json(); setWorkers(Object.values(d.workers||{})); } catch {}
    }
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <Logo />
        <a href="https://github.com/human-generated/h-worker" target="_blank"
          style={{ color: T.muted, fontSize: '0.7rem', textDecoration: 'none', fontFamily: T.mono }}>
          github →
        </a>
      </div>
      <div style={S.tabs}>
        {tabs.map(([id,label]) => (
          <button key={id} style={S.tab(tab===id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab==='workers' && <WorkersTab workers={workers} />}
      {tab==='skills'  && <SkillsTab workers={workers} />}
      {tab==='nfs'     && <NFSTab />}
      {tab==='linear'  && <LinearTab />}
    </div>
  );
}
