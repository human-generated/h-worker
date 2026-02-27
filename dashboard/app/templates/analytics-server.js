const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/analytics-' + PORT + '.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    ts INTEGER NOT NULL
  );
`);

const ec = db.prepare('SELECT COUNT(*) as c FROM events').get();
if (ec.c === 0) {
  const ins = db.prepare('INSERT INTO events (metric,value,ts) VALUES (?,?,?)');
  const now = Date.now();
  const HOUR = 3600000;
  const metrics = {
    pageviews: () => Math.floor(Math.random() * 800 + 200),
    revenue: () => Math.floor(Math.random() * 3000 + 500),
    signups: () => Math.floor(Math.random() * 50 + 5),
    errors: () => Math.floor(Math.random() * 30 + 1),
  };
  for (let h = 168; h >= 0; h--) {
    const ts = now - h * HOUR;
    const hour = new Date(ts).getHours();
    const multiplier = (hour >= 9 && hour <= 18) ? 1.5 : 0.6;
    Object.entries(metrics).forEach(([metric, gen]) => {
      ins.run(metric, Math.floor(gen() * multiplier), ts);
    });
  }
}

setInterval(() => {
  const ins = db.prepare('INSERT INTO events (metric,value,ts) VALUES (?,?,?)');
  const metrics = ['pageviews','signups','revenue','errors'];
  const values = [
    Math.floor(Math.random() * 50 + 10),
    Math.floor(Math.random() * 5 + 1),
    Math.floor(Math.random() * 200 + 50),
    Math.floor(Math.random() * 5),
  ];
  metrics.forEach((m, i) => ins.run(m, values[i], Date.now()));
}, 10000);

app.get('/api/metrics', (req, res) => {
  const { metric, hours } = req.query;
  const h = parseInt(hours) || 24;
  const since = Date.now() - h * 3600000;
  if (!metric) {
    const metrics = ['pageviews','revenue','signups','errors'];
    const result = {};
    metrics.forEach(m => {
      const rows = db.prepare('SELECT * FROM events WHERE metric = ? AND ts > ? ORDER BY ts ASC').all(m, since);
      result[m] = rows;
    });
    return res.json(result);
  }
  const rows = db.prepare('SELECT * FROM events WHERE metric = ? AND ts > ? ORDER BY ts ASC').all(metric, since);
  res.json(rows);
});

app.get('/api/events/recent', (req, res) => {
  const rows = db.prepare('SELECT * FROM events ORDER BY ts DESC LIMIT 20').all();
  res.json(rows);
});

app.post('/api/events', (req, res) => {
  const { metric, value } = req.body;
  if (!metric || value === undefined) return res.status(400).json({ error: 'metric and value required' });
  const r = db.prepare('INSERT INTO events (metric,value,ts) VALUES (?,?,?)').run(metric, value, Date.now());
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.listen(PORT, () => console.log('Analytics app on port ' + PORT));
