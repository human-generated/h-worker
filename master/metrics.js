/**
 * nanoclaw-metrics — Prometheus metrics exporter for hw-master
 * Reads hw_state.json and exports metrics on port 9201
 */
const http = require('http');
const fs   = require('fs');

const STATE_FILE = '/mnt/shared/hw_state.json';
const PORT = 9201;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { workers: {}, tasks: [] }; }
}

function buildMetrics() {
  const s = loadState();
  const workers = Object.values(s.workers || {});
  const tasks   = s.tasks || [];
  const lines   = [];

  // hw_tasks_total by status
  const byStatus = {};
  for (const t of tasks) {
    const st = t.status || 'unknown';
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  lines.push('# HELP hw_tasks_total Total tasks by status');
  lines.push('# TYPE hw_tasks_total counter');
  for (const [st, n] of Object.entries(byStatus)) {
    lines.push(`hw_tasks_total{status="${st}"} ${n}`);
  }

  // hw_workers_active
  const activeWorkers = workers.filter(w => {
    if (!w.updated_at) return false;
    const age = Date.now() - new Date(w.updated_at).getTime();
    return age < 120000; // active in last 2 minutes
  });
  lines.push('# HELP hw_workers_active Number of active workers (heartbeat < 2min)');
  lines.push('# TYPE hw_workers_active gauge');
  lines.push(`hw_workers_active ${activeWorkers.length}`);

  // hw_worker_info per worker
  lines.push('# HELP hw_worker_info Worker info (1 = present)');
  lines.push('# TYPE hw_worker_info gauge');
  for (const w of workers) {
    const id = (w.id || '').replace(/"/g, '');
    const ip = (w.ip || '').replace(/"/g, '');
    const st = (w.status || 'unknown').replace(/"/g, '');
    lines.push(`hw_worker_info{id="${id}",ip="${ip}",status="${st}"} 1`);
  }

  return lines.join('\n') + '\n';
}

const server = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(buildMetrics());
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`nanoclaw-metrics exporter on :${PORT}`);
});
