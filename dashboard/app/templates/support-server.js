const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/support-' + PORT + '.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, status TEXT, tickets_handled INTEGER
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT, customer TEXT, priority TEXT, status TEXT,
    agent_id INTEGER, created_at INTEGER, resolved_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER, author TEXT, content TEXT, created_at INTEGER
  );
`);

const ac = db.prepare('SELECT COUNT(*) as c FROM agents').get();
if (ac.c === 0) {
  const ia = db.prepare('INSERT INTO agents (name,status,tickets_handled) VALUES (?,?,?)');
  const it = db.prepare('INSERT INTO tickets (subject,customer,priority,status,agent_id,created_at,resolved_at) VALUES (?,?,?,?,?,?,?)');
  const ic = db.prepare('INSERT INTO comments (ticket_id,author,content,created_at) VALUES (?,?,?,?)');

  ia.run('Sarah Mitchell', 'available', 245);
  ia.run('James Park', 'busy', 312);
  ia.run('Priya Sharma', 'available', 189);
  ia.run('Carlos Rivera', 'break', 421);

  const now = Date.now();
  const tickets = [
    ['Production database down - cannot access any data', 'TechCorp Inc', 'critical', 'open', 2, now - 1800000, null],
    ['Payment gateway returning 500 errors', 'ShopMaster LLC', 'critical', 'in_progress', 1, now - 3600000, null],
    ['User authentication failing for all accounts', 'StartupX', 'high', 'open', 3, now - 7200000, null],
    ['API rate limits causing app crashes', 'DevAgency Pro', 'high', 'in_progress', 2, now - 14400000, null],
    ['Email notifications not being sent', 'RetailCo', 'medium', 'open', null, now - 21600000, null],
    ['Dashboard loading very slowly', 'Analytics Corp', 'medium', 'in_progress', 1, now - 28800000, null],
    ['Feature request: bulk export to CSV', 'Enterprise Inc', 'low', 'open', null, now - 43200000, null],
    ['Documentation links are broken', 'DevUser123', 'low', 'resolved', 4, now - 86400000, now - 43200000],
    ['Cannot change account email address', 'user@example.com', 'medium', 'resolved', 3, now - 172800000, now - 86400000],
    ['Mobile app crashing on iOS 17', 'MobileFirst Ltd', 'high', 'open', null, now - 10800000, null],
    ['SSL certificate expiring in 3 days', 'SecureShop', 'critical', 'open', null, now - 900000, null],
    ['Cannot export reports larger than 10MB', 'DataCrunch Co', 'medium', 'in_progress', 4, now - 36000000, null],
  ];

  tickets.forEach((t, i) => {
    const r = it.run(...t);
    ic.run(r.lastInsertRowid, t[1], 'Hi support team, ' + t[0].toLowerCase() + '. This is urgently affecting our business.', t[6] - 3600000 || now - 900000);
    ic.run(r.lastInsertRowid, t[4] ? ['Sarah Mitchell','James Park','Priya Sharma','Carlos Rivera'][t[4]-1] : 'Bot', 'Thank you for reaching out. We have received your ticket and are looking into this.', t[6] - 1800000 || now - 600000);
    if (i % 3 === 0) ic.run(r.lastInsertRowid, t[1], 'Any update on this issue? It is still affecting us.', now - 300000);
  });
}

app.get('/api/tickets', (req, res) => {
  const { status, priority } = req.query;
  let q = 'SELECT * FROM tickets';
  const filters = [];
  const vals = [];
  if (status) { filters.push('status = ?'); vals.push(status); }
  if (priority) { filters.push('priority = ?'); vals.push(priority); }
  if (filters.length) q += ' WHERE ' + filters.join(' AND ');
  q += ' ORDER BY CASE priority WHEN "critical" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 ELSE 4 END, created_at ASC';
  res.json(db.prepare(q).all(...vals));
});

app.put('/api/tickets/:id', (req, res) => {
  const { status, agent_id } = req.body;
  const updates = [];
  const vals = [];
  if (status !== undefined) {
    updates.push('status = ?'); vals.push(status);
    if (status === 'resolved') { updates.push('resolved_at = ?'); vals.push(Date.now()); }
  }
  if (agent_id !== undefined) { updates.push('agent_id = ?'); vals.push(agent_id); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  db.prepare('UPDATE tickets SET ' + updates.join(', ') + ' WHERE id = ?').run(...vals);
  res.json({ ok: true });
});

app.get('/api/agents', (req, res) => {
  res.json(db.prepare('SELECT * FROM agents ORDER BY tickets_handled DESC').all());
});

app.get('/api/comments', (req, res) => {
  const { ticket_id } = req.query;
  if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });
  res.json(db.prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC').all(ticket_id));
});

app.post('/api/comments', (req, res) => {
  const { ticket_id, author, content } = req.body;
  if (!ticket_id || !content) return res.status(400).json({ error: 'ticket_id and content required' });
  const r = db.prepare('INSERT INTO comments (ticket_id,author,content,created_at) VALUES (?,?,?,?)').run(ticket_id, author || 'Agent', content, Date.now());
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.listen(PORT, () => console.log('Support app on port ' + PORT));
