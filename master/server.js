const express = require('express');
const fs = require('fs');
const { execSync } = require('child_process');
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
  const { id, status, task, ip, vnc_port } = req.body;
  const s = loadState();
  s.workers[id] = { id, status, task, ip, vnc_port, updated_at: new Date().toISOString() };
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
