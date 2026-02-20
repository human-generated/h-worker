const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
app.use(express.json());

const STATE_FILE = '/mnt/shared/hw_state.json';

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { workers: {}, tasks: [] };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { workers: {}, tasks: [] }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function pushTransition(task, to, extra = {}) {
  if (!task.transitions) task.transitions = [];
  task.transitions.push({ from: task.status, to, at: new Date().toISOString(), ...extra });
}

// Workers report their status
app.post('/worker/heartbeat', (req, res) => {
  const { id, status, task, ip, vnc_port, skills } = req.body;
  const s = loadState();
  s.workers[id] = { id, status, task, ip, vnc_port, skills: skills || [], updated_at: new Date().toISOString() };
  saveState(s);
  res.json({ ok: true });
});

// Get next pending task for a worker
app.get('/worker/task/:id', (req, res) => {
  const s = loadState();
  const pending = s.tasks.find(t => t.status === 'pending');
  if (pending) {
    pushTransition(pending, 'assigned', { worker: req.params.id });
    pending.status = 'assigned';
    pending.worker = req.params.id;
    pending.assigned_at = new Date().toISOString();
    saveState(s);
    return res.json({ task: pending });
  }
  res.json({ task: null });
});

// Mark task complete
app.post('/task/:id/complete', (req, res) => {
  const s = loadState();
  const task = s.tasks.find(t => t.id === req.params.id);
  if (task) {
    pushTransition(task, 'done');
    task.status = 'done';
    task.completed_at = new Date().toISOString();
    saveState(s);
  }
  res.json({ ok: true });
});

// Get single task details
app.get('/task/:id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const s = loadState();
  const task = s.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'not found' });
  res.json({ task });
});

// Manual state transition (cancel, fail, retry)
app.post('/task/:id/state', (req, res) => {
  const s = loadState();
  const task = s.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const { to, note } = req.body;
  const valid = ['pending', 'cancelled', 'failed', 'done'];
  if (!valid.includes(to)) return res.status(400).json({ error: 'invalid state: ' + to });
  pushTransition(task, to, { note: note || null, manual: true });
  task.status = to;
  task[to + '_at'] = new Date().toISOString();
  saveState(s);
  res.json({ ok: true, task });
});

// Dashboard API
app.get('/status', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(loadState());
});

// Add task
app.post('/task', (req, res) => {
  const s = loadState();
  const now = new Date().toISOString();
  const task = {
    id: Date.now().toString(),
    ...req.body,
    status: 'pending',
    created_at: now,
    transitions: [{ from: null, to: 'pending', at: now }],
  };
  s.tasks.push(task);
  saveState(s);
  res.json({ task });
});

// Linear token storage
const LINEAR_TOKEN_FILE = "/opt/hw-master/linear_token.json";
app.get("/config/linear-token", (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(LINEAR_TOKEN_FILE, "utf8"))); }
  catch { res.json({ token: null }); }
});
app.post("/config/linear-token", (req, res) => {
  fs.writeFileSync(LINEAR_TOKEN_FILE, JSON.stringify({ token: req.body.token }));
  res.json({ ok: true });
});

app.listen(3000, () => console.log('Master API on :3000'));

// Redeploy Vercel dashboard
const { exec } = require('child_process');
app.post('/deploy/dashboard', (req, res) => {
  res.json({ ok: true, message: 'Deploying...' });
  exec(
    `VERCEL_TOKEN=${process.env.VERCEL_TOKEN} /usr/local/bin/vercel deploy --prod --token ${process.env.VERCEL_TOKEN} --scope ${process.env.VERCEL_SCOPE} --yes`,
    { cwd: '/opt/hw-dashboard' },
    (err, stdout, stderr) => {
      const log = stdout + stderr;
      console.log('Deploy result:', log.slice(-500));
      const s = loadState();
      s.last_deploy = { at: new Date().toISOString(), output: log.slice(-1000), success: !err };
      saveState(s);
    }
  );
});

// NFS file browser
const NFS_ROOT = '/mnt/shared';
app.get('/nfs', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rel = (req.query.path || '').replace(/\.\./g, '');
  const abs = path.join(NFS_ROOT, rel);
  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(abs).map(name => {
        const full = path.join(abs, name);
        const s = fs.statSync(full);
        return { name, type: s.isDirectory() ? 'dir' : 'file', size: s.size, modified: s.mtime };
      });
      res.json({ type: 'dir', path: rel || '/', entries });
    } else {
      const content = fs.readFileSync(abs, 'utf8');
      res.json({ type: 'file', path: rel, content });
    }
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// Skills API
const SKILLS_DIR = '/mnt/shared/skills';

app.get('/skills', (req, res) => {
  try {
    if (!fs.existsSync(SKILLS_DIR)) fs.mkdirSync(SKILLS_DIR, { recursive: true });
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json'));
    const skills = files.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')); } catch { return null; }
    }).filter(Boolean);
    res.json({ skills });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/skills', (req, res) => {
  try {
    const { name, creator, desc, code, origin } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const skill = { name, creator: creator || 'claude', desc: desc || '', code: code || '', origin: origin || 'manual', created_at: new Date().toISOString() };
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SKILLS_DIR, slug + '.json'), JSON.stringify(skill, null, 2));
    res.json({ ok: true, slug });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/skills/install', async (req, res) => {
  try {
    const { url, name, creator } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const https = require('https'), http = require('http');
    const proto = url.startsWith('https') ? https : http;
    const code = await new Promise((resolve, reject) => {
      let data = '';
      proto.get(url, r => { r.on('data', c => data += c); r.on('end', () => resolve(data)); }).on('error', reject);
    });
    const skillName = name || url.split('/').pop().replace(/\.[^.]+$/, '');
    const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const skill = { name: skillName, creator: creator || 'download', desc: 'Downloaded from ' + url, code, origin: url, created_at: new Date().toISOString() };
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SKILLS_DIR, slug + '.json'), JSON.stringify(skill, null, 2));
    const binDir = '/mnt/shared/bin';
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, slug), code, { mode: 0o755 });
    res.json({ ok: true, slug, size: code.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/skills/:slug', (req, res) => {
  try {
    const f = path.join(SKILLS_DIR, req.params.slug + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    const bin = path.join('/mnt/shared/bin', req.params.slug);
    if (fs.existsSync(bin)) fs.unlinkSync(bin);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
