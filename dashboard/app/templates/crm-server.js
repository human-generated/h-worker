const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/crm-' + PORT + '.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, company TEXT, email TEXT, stage TEXT, value REAL, owner TEXT
  );
  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id INTEGER, type TEXT, note TEXT, created_at INTEGER
  );
`);

const cc = db.prepare('SELECT COUNT(*) as c FROM contacts').get();
if (cc.c === 0) {
  const ic = db.prepare('INSERT INTO contacts (name,company,email,stage,value,owner) VALUES (?,?,?,?,?,?)');
  const ia = db.prepare('INSERT INTO activities (contact_id,type,note,created_at) VALUES (?,?,?,?)');
  const now = Date.now();
  const contacts = [
    ['Sarah Connor', 'Cyberdyne Systems', 'sarah@cyberdyne.io', 'lead', 15000, 'alice'],
    ['John Wick', 'Continental Hotels', 'jwick@continental.com', 'prospect', 45000, 'bob'],
    ['Tony Stark', 'Stark Industries', 'tony@stark.io', 'qualified', 250000, 'alice'],
    ['Bruce Wayne', 'Wayne Enterprises', 'bruce@wayne.co', 'proposal', 500000, 'carol'],
    ['Diana Prince', 'Themyscira LLC', 'diana@themyscira.com', 'qualified', 180000, 'bob'],
    ['Peter Parker', 'Daily Bugle', 'peter@dailybugle.com', 'lead', 8000, 'alice'],
    ['Clark Kent', 'Daily Planet', 'clark@dailyplanet.com', 'prospect', 62000, 'carol'],
    ['Natasha Romanov', 'SHIELD Corp', 'natasha@shield.gov', 'closed', 320000, 'bob'],
    ['Steve Rogers', 'Avengers Inc', 'steve@avengers.com', 'closed', 150000, 'alice'],
    ['Thor Odinson', 'Asgard Ventures', 'thor@asgard.com', 'proposal', 750000, 'carol'],
  ];
  contacts.forEach((c, i) => {
    const r = ic.run(...c);
    ia.run(r.lastInsertRowid, 'call', 'Initial discovery call completed', now - (i * 86400000 * 3));
    ia.run(r.lastInsertRowid, 'email', 'Sent product overview deck', now - (i * 86400000 * 2));
    if (i % 3 === 0) ia.run(r.lastInsertRowid, 'meeting', 'Demo scheduled for next week', now - 86400000);
    if (i % 4 === 0) ia.run(r.lastInsertRowid, 'note', 'Decision maker confirmed', now - 3600000);
    if (i % 2 === 0) ia.run(r.lastInsertRowid, 'email', 'Follow-up sent after demo', now - 7200000);
  });
}

app.get('/api/contacts', (req, res) => {
  const { stage } = req.query;
  const rows = stage
    ? db.prepare('SELECT * FROM contacts WHERE stage = ? ORDER BY value DESC').all(stage)
    : db.prepare('SELECT * FROM contacts ORDER BY value DESC').all();
  res.json(rows);
});

app.put('/api/contacts/:id', (req, res) => {
  const { stage, value, owner } = req.body;
  const updates = [];
  const vals = [];
  if (stage !== undefined) { updates.push('stage = ?'); vals.push(stage); }
  if (value !== undefined) { updates.push('value = ?'); vals.push(value); }
  if (owner !== undefined) { updates.push('owner = ?'); vals.push(owner); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  db.prepare('UPDATE contacts SET ' + updates.join(', ') + ' WHERE id = ?').run(...vals);
  res.json({ ok: true });
});

app.get('/api/activities', (req, res) => {
  const { contact_id } = req.query;
  const rows = contact_id
    ? db.prepare('SELECT a.*, c.name as contact_name FROM activities a JOIN contacts c ON a.contact_id = c.id WHERE a.contact_id = ? ORDER BY a.created_at DESC').all(contact_id)
    : db.prepare('SELECT a.*, c.name as contact_name FROM activities a JOIN contacts c ON a.contact_id = c.id ORDER BY a.created_at DESC LIMIT 20').all();
  res.json(rows);
});

app.post('/api/activities', (req, res) => {
  const { contact_id, type, note } = req.body;
  if (!contact_id || !type) return res.status(400).json({ error: 'contact_id and type required' });
  const r = db.prepare('INSERT INTO activities (contact_id,type,note,created_at) VALUES (?,?,?,?)').run(contact_id, type, note || '', Date.now());
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.listen(PORT, () => console.log('CRM app on port ' + PORT));
