const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// CORS for direct browser uploads
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Filename');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Raw body for file uploads (must come before express.json())
app.use('/upload', express.raw({ type: '*/*', limit: '200mb' }));

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

// Get next pending task for a worker (respects assigned_worker field)
app.get('/worker/task/:id', (req, res) => {
  const workerId = req.params.id;
  const s = loadState();

  // Prefer tasks explicitly assigned to this worker, then unassigned pending tasks
  const task =
    s.tasks.find(t => t.status === 'pending' && t.assigned_worker === workerId) ||
    s.tasks.find(t => t.status === 'pending' && !t.assigned_worker);

  if (task) {
    pushTransition(task, 'running', { worker: workerId });
    task.status = 'running';
    task.worker = workerId;
    task.assigned_at = new Date().toISOString();
    saveState(s);
    return res.json({ task });
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

// Freeform state transition — any state string is valid
app.post('/task/:id/state', (req, res) => {
  const s = loadState();
  const task = s.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'not found' });
  const { to, note } = req.body;
  if (!to || typeof to !== 'string') return res.status(400).json({ error: 'to is required' });
  pushTransition(task, to, { note: note || null, manual: true });
  task.status = to;
  task[to + '_at'] = new Date().toISOString();

  // Auto-complete parent task when all subtasks finish
  if (task.parent_task && (to === 'done' || to === 'failed')) {
    const parent = s.tasks.find(t => t.id === task.parent_task);
    if (parent && !['done','failed','cancelled'].includes(parent.status)) {
      const siblings = s.tasks.filter(t => t.parent_task === task.parent_task);
      const allDone = siblings.every(t => t.status === 'done' || (t.id === task.id && to === 'done'));
      const anyFailed = siblings.some(t => t.status === 'failed' || (t.id === task.id && to === 'failed'));
      if (anyFailed) {
        pushTransition(parent, 'failed', { note: `subtask ${task.id} failed`, manual: true });
        parent.status = 'failed';
      } else if (allDone) {
        pushTransition(parent, 'done', { note: `all ${siblings.length} subtasks complete`, manual: true });
        parent.status = 'done';
        parent.done_at = new Date().toISOString();
      }
    }
  }

  saveState(s);
  res.json({ ok: true, task });
});

// Stream task logs from NFS artifact dir
app.get('/task/:id/logs', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const s = loadState();
  const task = s.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'not found' });
  // Use per-worker log if available, fall back to shared run.log
  const logFile = task.worker_log || (task.artifact_dir ? path.join(task.artifact_dir.replace(/\/$/, ''), 'run.log') : null);
  if (!logFile || !fs.existsSync(logFile)) return res.json({ logs: '', lines: 0 });
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    const tail = lines.slice(-200).join('\n');
    res.json({ logs: tail, lines: lines.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Set artifact_dir on a task (called by orchestrator after planning)
app.post('/task/:id/artifact', (req, res) => {
  const s = loadState();
  const task = s.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'not found' });
  if (req.body.artifact_dir) task.artifact_dir = req.body.artifact_dir;
  saveState(s);
  res.json({ ok: true });
});

// Dashboard API
app.get('/status', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(loadState());
});

// Add task — starts in 'queued' state for orchestrator to pick up
app.post('/task', (req, res) => {
  const s = loadState();
  const now = new Date().toISOString();
  const task = {
    id: Date.now().toString(),
    ...req.body,
    status: req.body.status || 'queued',
    created_at: now,
    transitions: [{ from: null, to: req.body.status || 'queued', at: now }],
  };
  s.tasks.push(task);
  saveState(s);
  res.json({ task });
});

// API keys (shared via NFS so all workers can read)
const KEYS_FILE = '/mnt/shared/keys.json';
function loadKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch { return {}; }
}
app.get('/config/keys', (req, res) => res.json(loadKeys()));
app.post('/config/keys', (req, res) => {
  const current = loadKeys();
  const updated = { ...current, ...req.body };
  fs.writeFileSync(KEYS_FILE, JSON.stringify(updated, null, 2));
  res.json({ ok: true, keys: Object.keys(updated) });
});

// Linear token storage
const LINEAR_TOKEN_FILE = '/opt/hw-master/linear_token.json';
app.get('/config/linear-token', (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(LINEAR_TOKEN_FILE, 'utf8'))); }
  catch { res.json({ token: null }); }
});
app.post('/config/linear-token', (req, res) => {
  fs.writeFileSync(LINEAR_TOKEN_FILE, JSON.stringify({ token: req.body.token }));
  res.json({ ok: true });
});

app.listen(3000, () => console.log('Master API on :3000'));

// Redeploy Vercel dashboard
const { exec } = require('child_process');
app.post('/deploy/dashboard', (req, res) => {
  res.json({ ok: true, message: 'Deploying...' });
  exec(
    `/usr/bin/vercel deploy --prod --token ${process.env.VERCEL_TOKEN} --scope ${process.env.VERCEL_SCOPE} --yes`,
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
      // Text files: return content; binary: return metadata only
      const ext = path.extname(abs).toLowerCase();
      const binaryExts = new Set(['.mp3','.aac','.wav','.ogg','.mp4','.webm','.avi','.mov','.png','.jpg','.jpeg','.gif','.webp','.pdf','.zip','.tar','.gz']);
      if (binaryExts.has(ext)) {
        const s = fs.statSync(abs);
        res.json({ type: 'file', path: rel, binary: true, size: s.size, ext });
      } else {
        const content = fs.readFileSync(abs, 'utf8');
        res.json({ type: 'file', path: rel, content });
      }
    }
  } catch(e) { res.status(400).json({ error: e.message }); }
});

// NFS binary file download/stream
app.get('/nfs/file', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rel = (req.query.path || '').replace(/\.\./g, '');
  const abs = path.join(NFS_ROOT, rel);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'not found' });
  const name = path.basename(abs);
  const ext = path.extname(abs).toLowerCase();
  const mimes = {
    '.mp4':'video/mp4','.webm':'video/webm','.avi':'video/x-msvideo','.mov':'video/quicktime',
    '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp',
    '.mp3':'audio/mpeg','.aac':'audio/aac','.wav':'audio/wav','.ogg':'audio/ogg','.pdf':'application/pdf','.zip':'application/zip',
    '.json':'application/json','.sh':'text/plain','.js':'text/javascript','.html':'text/html',
    '.txt':'text/plain','.log':'text/plain','.md':'text/plain',
  };
  const mime = mimes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  fs.createReadStream(abs).pipe(res);
});

// File upload to NFS
const UPLOAD_DIR = "/mnt/shared/uploads";
app.post("/upload", (req, res) => {
  const rawName = req.query.filename || req.headers['x-filename'] || "upload";
  const filename = path.basename(rawName.replace(/\.\./g, ""));
  const safeFile = filename.replace(/[^a-zA-Z0-9._\-]/g, "_");
  // support optional subdirectory via query: ?dir=gtbank_v1
  const subdir = (req.query.dir || '').replace(/[^a-zA-Z0-9._\-]/g, '_');
  const destDir = subdir ? path.join(UPLOAD_DIR, subdir) : UPLOAD_DIR;
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, safeFile);
  try {
    fs.writeFileSync(dest, req.body);
    const relPath = subdir ? `uploads/${subdir}/${safeFile}` : `uploads/${safeFile}`;
    res.json({ ok: true, path: relPath, nfs: `/mnt/shared/${relPath}`, size: req.body.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
