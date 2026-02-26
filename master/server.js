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

// ── Sandbox Builder ────────────────────────────────────────────────────────
const SANDBOXES_FILE = '/mnt/shared/sandboxes.json';
const SANDBOX_WORKER = '164.90.197.224';
const SSH_KEY = '/opt/hw-master/keys/openclaw-key.pem';
const { execSync } = require('child_process');

function loadSandboxes() {
  try { return JSON.parse(fs.readFileSync(SANDBOXES_FILE, 'utf8')); } catch { return {}; }
}
function saveSandboxes(s) { fs.writeFileSync(SANDBOXES_FILE, JSON.stringify(s, null, 2)); }

function nextSandboxPort() {
  const sbs = loadSandboxes();
  const used = new Set(Object.values(sbs).map(s => s.port).filter(Boolean));
  for (let p = 8100; p <= 8199; p++) { if (!used.has(p)) return p; }
  return 8100;
}

function sshRun(ip, cmd) {
  return execSync(
    `ssh -i ${SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@${ip} ${JSON.stringify(cmd)}`,
    { timeout: 30000, encoding: 'utf8' }
  );
}

function sshWriteFile(ip, remotePath, content) {
  // Write to temp file on master, then scp to worker
  const tmpFile = `/tmp/sbx-write-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  try {
    execSync(
      `scp -i ${SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 '${tmpFile}' root@${ip}:'${remotePath}'`,
      { timeout: 30000, encoding: 'utf8' }
    );
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// GET /sandboxes
app.get('/sandboxes', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(loadSandboxes());
});

// POST /sandboxes — create empty sandbox
app.post('/sandboxes', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const id = 'sbx-' + Date.now();
  const port = nextSandboxPort();
  const sb = {
    id, port,
    title: req.body.title || 'New Sandbox',
    status: 'created',
    worker_ip: SANDBOX_WORKER,
    url: `http://${SANDBOX_WORKER}:${port}`,
    messages: [],
    log: [],
    files: {},
    suggested_workers: [],
    created_at: new Date().toISOString(),
  };
  const sbs = loadSandboxes();
  sbs[id] = sb;
  saveSandboxes(sbs);
  try { sshRun(SANDBOX_WORKER, `mkdir -p /opt/sandboxes/${id}`); } catch {}
  res.json({ ok: true, sandbox: sb });
});

// POST /sandboxes/:id/chat — agentic build loop (polling-friendly, synchronous)
app.post('/sandboxes/:id/chat', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let sbs = loadSandboxes();
  let sb = sbs[req.params.id];
  if (!sb) return res.status(404).json({ error: 'sandbox not found' });

  const userMsg = req.body.message || '';
  const imageUrls = req.body.image_urls || []; // array of base64 data URIs or http URLs

  // Build content for this user message (text + optional images)
  let userContent;
  if (imageUrls.length > 0) {
    userContent = [{ type: 'text', text: userMsg }];
    for (const imgUrl of imageUrls) {
      if (imgUrl.startsWith('data:')) {
        const match = imgUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (match) {
          userContent.push({ type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } });
        }
      } else {
        userContent.push({ type: 'image', source: { type: 'url', url: imgUrl } });
      }
    }
  } else {
    userContent = userMsg;
  }

  sb.messages.push({ role: 'user', content: userContent });
  sb.status = 'building';
  sb.log = sb.log || [];
  sb.log.push({ tool: 'user', result: userMsg, at: new Date().toISOString() });
  sbs[req.params.id] = sb;
  saveSandboxes(sbs);

  // Respond immediately so client can start polling
  res.json({ ok: true, status: 'building', message: 'Build started, poll GET /sandboxes/:id for updates' });

  // Load anthropic key
  let anthropicKey = '';
  try {
    const keyData = JSON.parse(fs.readFileSync('/opt/hw-master/anthropic_key.json', 'utf8'));
    anthropicKey = keyData.key || keyData.token || '';
  } catch {}

  const isOAuth = anthropicKey.startsWith('sk-ant-oat');
  const authHeaders = isOAuth
    ? { 'Authorization': `Bearer ${anthropicKey}`, 'anthropic-beta': 'oauth-2025-04-20' }
    : { 'x-api-key': anthropicKey };

  const TOOLS = [
    {
      name: 'write_file',
      description: 'Write a file to the sandbox directory on the deployment worker',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path within sandbox (e.g. server.js, public/index.html)' },
          content: { type: 'string', description: 'Full file content' },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'bash',
      description: 'Run a bash command in the sandbox directory on the worker (e.g. npm install)',
      input_schema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
    {
      name: 'deploy',
      description: 'Start the application. Kills any existing process on the sandbox port and starts node with the given entry point.',
      input_schema: {
        type: 'object',
        properties: { entry_point: { type: 'string', description: 'Main file to run, e.g. server.js' } },
        required: ['entry_point'],
      },
    },
    {
      name: 'suggest_workers',
      description: 'Propose worker agents that will simulate real interactions with the deployed app',
      input_schema: {
        type: 'object',
        properties: {
          workers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                role: { type: 'string' },
                description: { type: 'string' },
                scenarios: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                      script: { type: 'string', description: 'Bash script to execute the scenario' },
                    },
                    required: ['name', 'description', 'script'],
                  },
                },
              },
              required: ['id', 'role', 'description', 'scenarios'],
            },
          },
        },
        required: ['workers'],
      },
    },
  ];

  const freshSbs0 = loadSandboxes();
  const freshSb0 = freshSbs0[sb.id] || sb;
  const SYSTEM = `You are a full-stack developer building web applications on demand. IMPORTANT: Keep server.js under 6000 characters. Use concise but functional code.

When given a description, build a complete working application:
1. Use write_file to create all necessary files. Build a Node.js Express server (server.js) that serves static HTML and provides REST APIs. The HTML should be a single index.html with inline CSS and vanilla JS (no build step, no React, no bundler).
2. Use bash("npm install express") to install dependencies (no package.json needed, just install inline).
3. Use deploy("server.js") to start the app on port ${freshSb0.port} (always use PORT=${freshSb0.port} in server.js: const PORT = process.env.PORT || ${freshSb0.port}).
4. Use suggest_workers with 3 specific worker agents with bash scripts using the real URL http://${SANDBOX_WORKER}:${freshSb0.port}.

Make the apps visually STUNNING with a dark professional UI: dark background (#0a0a0f), colored accents (blue #3b82f6, green #22c55e, amber #f59e0b, red #ef4444), glass-morphism cards, smooth CSS animations, gradients, status indicators. Include real data structures, real API endpoints with proper in-memory state, realistic mock data (names, IDs, timestamps). The frontend should auto-poll APIs every 2-3 seconds for live updates. Use CSS grid/flexbox for professional layouts. Add charts/stats using pure CSS (no charting libs). Aim for a product that looks like it could ship.

CRITICAL CODING RULES to avoid syntax errors:
- NEVER use backtick template literals inside Express res.send() or res.json() HTML strings — use single-quoted strings or write the HTML to a separate .html file
- For HTML served by Express, always write it to public/index.html via write_file, then use express.static('public') — never inline large HTML in template literals inside server.js
- When building HTML in JS, use string concatenation (+) not template literals if the HTML contains quotes or complex characters
- Keep server.js under 4000 characters; put all HTML/CSS/JS in public/index.html

If the user sends follow-up requests, iterate on the EXISTING files — rewrite only what needs to change, keep what works. You have the full conversation history.

Sandbox ID: ${freshSb0.id}, Port: ${freshSb0.port}, Worker: ${SANDBOX_WORKER}`;

  // Use full conversation history for ongoing chat context
  const freshSbForHistory = loadSandboxes()[sb.id] || sb;
  let apiMessages = freshSbForHistory.messages.filter(m => m.role === 'user' || m.role === 'assistant');
  if (apiMessages.length === 0) apiMessages = [{ role: 'user', content: userContent }];
  let finalText = '';

  function addLog(tool, result) {
    const freshSbs = loadSandboxes();
    const freshSb = freshSbs[sb.id] || sb;
    freshSb.log = freshSb.log || [];
    freshSb.log.push({ tool, result: String(result).slice(0, 500), at: new Date().toISOString() });
    freshSbs[sb.id] = freshSb;
    saveSandboxes(freshSbs);
  }

  // Agentic tool loop — max 15 iterations
  for (let iter = 0; iter < 15; iter++) {
    let claudeResp;
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          ...authHeaders,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          system: SYSTEM,
          tools: TOOLS,
          messages: apiMessages,
        }),
      });
      claudeResp = await resp.json();
    } catch (e) {
      addLog('error', 'Claude API error: ' + e.message);
      break;
    }

    if (claudeResp.error) {
      addLog('error', claudeResp.error.message);
      break;
    }

    const content = claudeResp.content || [];
    apiMessages.push({ role: 'assistant', content });

    const toolResults = [];
    for (const block of content) {
      if (block.type === 'text' && block.text) {
        finalText = block.text;
        addLog('text', block.text.slice(0, 300));
      }
      if (block.type === 'tool_use') {
        const { name, input, id: toolId } = block;
let toolResult = '';
        const freshSbs = loadSandboxes();
        const freshSb = freshSbs[sb.id] || sb;

        try {
          if (name === 'write_file') {
            if (!input.path || input.content === undefined || input.content === null) {
              toolResult = `Error: write_file requires path and content (got path=${input.path}, content type=${typeof input.content})`;
            } else {
              const remotePath = `/opt/sandboxes/${sb.id}/${input.path}`;
              sshRun(SANDBOX_WORKER, `mkdir -p $(dirname '${remotePath}')`);
              sshWriteFile(SANDBOX_WORKER, remotePath, input.content);
              freshSb.files = freshSb.files || {};
              freshSb.files[input.path] = input.content;
              toolResult = `Written: ${input.path} (${String(input.content).length} bytes)`;
            }
          } else if (name === 'bash') {
            if (!input.command) {
              toolResult = 'Error: bash requires command parameter';
            } else {
              const out = sshRun(SANDBOX_WORKER, `cd /opt/sandboxes/${sb.id} && ${input.command} 2>&1`);
              toolResult = out.slice(0, 2000);
            }
          } else if (name === 'deploy') {
            sshRun(SANDBOX_WORKER, `fuser -k ${freshSb.port}/tcp 2>/dev/null || true`);
            // Use nohup with explicit backgrounding that disconnects from SSH
            const startCmd = `nohup bash -c 'cd /opt/sandboxes/${sb.id} && PORT=${freshSb.port} node ${input.entry_point} >> /opt/sandboxes/${sb.id}/app.log 2>&1' > /dev/null 2>&1 &`;
            sshRun(SANDBOX_WORKER, startCmd);
            await new Promise(r => setTimeout(r, 3000));
            // Verify it's running
            try {
              const check = sshRun(SANDBOX_WORKER, `curl -s --max-time 3 http://localhost:${freshSb.port}/ > /dev/null 2>&1 && echo running || echo starting`);
              freshSb.status = 'deployed';
              toolResult = `Deployed at http://${SANDBOX_WORKER}:${freshSb.port} (${check.trim()})`;
            } catch {
              freshSb.status = 'deployed';
              toolResult = `Deployed at http://${SANDBOX_WORKER}:${freshSb.port}`;
            }
          } else if (name === 'suggest_workers') {
            freshSb.suggested_workers = input.workers;
            toolResult = `Suggested ${input.workers.length} workers`;
          }
        } catch (e) {
          toolResult = 'Error: ' + e.message;
        }

        freshSb.log = freshSb.log || [];
        freshSb.log.push({ tool: name, result: toolResult.slice(0, 500), at: new Date().toISOString() });
        freshSbs[sb.id] = freshSb;
        saveSandboxes(freshSbs);

        toolResults.push({ type: 'tool_result', tool_use_id: toolId, content: toolResult });
      }
    }

    if (toolResults.length === 0) break;
    apiMessages.push({ role: 'user', content: toolResults });
  }

  // Save final message
  const finalSbs = loadSandboxes();
  if (finalSbs[sb.id]) {
    finalSbs[sb.id].messages.push({ role: 'assistant', content: finalText });
    if (finalSbs[sb.id].status === 'building') finalSbs[sb.id].status = 'done';
    saveSandboxes(finalSbs);
  }
});

// GET /sandboxes/:id
app.get('/sandboxes/:id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const sbs = loadSandboxes();
  const sb = sbs[req.params.id];
  if (!sb) return res.status(404).json({ error: 'not found' });
  res.json(sb);
});

// POST /sandboxes/:id/scenario — run a worker scenario
app.post('/sandboxes/:id/scenario', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const sbs = loadSandboxes();
  const sb = sbs[req.params.id];
  if (!sb) return res.status(404).json({ error: 'sandbox not found' });
  const { script, worker_ip } = req.body;
  if (!script) return res.status(400).json({ error: 'script required' });
  const targetIp = worker_ip || SANDBOX_WORKER;
  // Write script to temp file, scp to worker, run it
  const tmpLocal = `/tmp/scenario-${Date.now()}.sh`;
  const tmpRemote = `/tmp/scenario-${Date.now()}.sh`;
  try {
    fs.writeFileSync(tmpLocal, script, 'utf8');
    execSync(
      `scp -i ${SSH_KEY} -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o ConnectTimeout=10 '${tmpLocal}' root@${targetIp}:'${tmpRemote}'`,
      { timeout: 15000, encoding: 'utf8' }
    );
    const out = sshRun(targetIp, `bash '${tmpRemote}' 2>&1; rm -f '${tmpRemote}'`);
    res.json({ ok: true, output: out });
  } catch (e) {
    res.json({ ok: false, output: e.message });
  } finally {
    try { fs.unlinkSync(tmpLocal); } catch {}
  }
});

// DELETE /sandboxes/:id
app.delete('/sandboxes/:id', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const sbs = loadSandboxes();
  const sb = sbs[req.params.id];
  if (sb) {
    try { sshRun(sb.worker_ip, `fuser -k ${sb.port}/tcp 2>/dev/null || true; rm -rf /opt/sandboxes/${sb.id}`); } catch {}
    delete sbs[req.params.id];
    saveSandboxes(sbs);
  }
  res.json({ ok: true });
});

// CORS OPTIONS for sandbox routes
['', '/:id', '/:id/chat', '/:id/scenario'].forEach(path => {
  app.options('/sandboxes' + path, (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.sendStatus(204);
  });
});
