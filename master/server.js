const express = require('express');
const fs = require('fs');
const app = express();
app.use(express.json());

const STATE_FILE = '/mnt/shared/hw_state.json';

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return { workers: {}, tasks: [] };
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { workers: {}, tasks: [] }; }
}
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

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
  const worker = s.workers[req.params.id] || {};
  const pending = s.tasks.find(t => t.status === 'pending');
  if (pending) {
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
  if (task) { task.status = 'done'; task.completed_at = new Date().toISOString(); saveState(s); }
  res.json({ ok: true });
});

// Dashboard API
app.get('/status', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(loadState());
});

// Add task
app.post('/task', (req, res) => {
  const s = loadState();
  const task = { id: Date.now().toString(), ...req.body, status: 'pending', created_at: new Date().toISOString() };
  s.tasks.push(task);
  saveState(s);
  res.json({ task });
});


// Linear token storage
const LINEAR_TOKEN_FILE = "/opt/hw-master/linear_token.json";
app.get("/config/linear-token", (req, res) => {
  try { res.json(JSON.parse(require("fs").readFileSync(LINEAR_TOKEN_FILE, "utf8"))); }
  catch { res.json({ token: null }); }
});
app.post("/config/linear-token", express.json(), (req, res) => {
  require("fs").writeFileSync(LINEAR_TOKEN_FILE, JSON.stringify({ token: req.body.token }));
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
const path = require('path');
const NFS_ROOT = '/mnt/shared';
app.get('/nfs', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const rel = (req.query.path || '').replace(/\.\./g, '');
  const abs = path.join(NFS_ROOT, rel);
  try {
    const fs2 = require('fs');
    const stat = fs2.statSync(abs);
    if (stat.isDirectory()) {
      const entries = fs2.readdirSync(abs).map(name => {
        const full = path.join(abs, name);
        const s = fs2.statSync(full);
        return { name, type: s.isDirectory() ? 'dir' : 'file', size: s.size, modified: s.mtime };
      });
      res.json({ type: 'dir', path: rel || '/', entries });
    } else {
      const content = fs2.readFileSync(abs, 'utf8');
      res.json({ type: 'file', path: rel, content });
    }
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

// Skills API
const SKILLS_DIR = '/mnt/shared/skills';

// List all shared skills
app.get('/skills', (req, res) => {
  try {
    const fs2 = require('fs');
    if (!fs2.existsSync(SKILLS_DIR)) fs2.mkdirSync(SKILLS_DIR, { recursive: true });
    const files = fs2.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json'));
    const skills = files.map(f => {
      try { return JSON.parse(fs2.readFileSync(path.join(SKILLS_DIR, f), 'utf8')); }
      catch { return null; }
    }).filter(Boolean);
    res.json({ skills });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Publish a skill (from worker or manually)
app.post('/skills', express.json(), (req, res) => {
  try {
    const fs2 = require('fs');
    const { name, creator, desc, code, origin } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const skill = { name, creator: creator || 'claude', desc: desc || '', code: code || '', origin: origin || 'manual', created_at: new Date().toISOString() };
    fs2.mkdirSync(SKILLS_DIR, { recursive: true });
    fs2.writeFileSync(path.join(SKILLS_DIR, slug + '.json'), JSON.stringify(skill, null, 2));
    res.json({ ok: true, slug });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Download & install skill from URL
app.post('/skills/install', express.json(), async (req, res) => {
  try {
    const { url, name, creator } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const https = require('https'), http = require('http');
    const proto = url.startsWith('https') ? https : http;
    const code = await new Promise((resolve, reject) => {
      let data = '';
      proto.get(url, r => { r.on('data', c => data += c); r.on('end', () => resolve(data)); }).on('error', reject);
    });
    const fs2 = require('fs');
    const skillName = name || url.split('/').pop().replace(/\.[^.]+$/, '');
    const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const skill = { name: skillName, creator: creator || 'download', desc: 'Downloaded from ' + url, code, origin: url, created_at: new Date().toISOString() };
    fs2.mkdirSync(SKILLS_DIR, { recursive: true });
    fs2.writeFileSync(path.join(SKILLS_DIR, slug + '.json'), JSON.stringify(skill, null, 2));
    // Also write executable to /mnt/shared/bin/ for workers to run
    const binDir = '/mnt/shared/bin';
    fs2.mkdirSync(binDir, { recursive: true });
    fs2.writeFileSync(path.join(binDir, slug), code, { mode: 0o755 });
    res.json({ ok: true, slug, size: code.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Delete a skill
app.delete('/skills/:slug', (req, res) => {
  try {
    const fs2 = require('fs');
    const f = path.join(SKILLS_DIR, req.params.slug + '.json');
    if (fs2.existsSync(f)) fs2.unlinkSync(f);
    const bin = path.join('/mnt/shared/bin', req.params.slug);
    if (fs2.existsSync(bin)) fs2.unlinkSync(bin);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
