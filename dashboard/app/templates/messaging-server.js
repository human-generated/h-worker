const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/messaging-' + PORT + '.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const seed = db.prepare('SELECT COUNT(*) as c FROM messages').get();
if (seed.c === 0) {
  const ins = db.prepare('INSERT INTO messages (channel, username, content, created_at) VALUES (?,?,?,?)');
  const now = Date.now();
  ins.run('general', 'alice', 'Hey everyone! Welcome to the team channel.', now - 7200000);
  ins.run('general', 'bob', 'Thanks Alice! Excited to be here.', now - 7000000);
  ins.run('general', 'carol', 'Good morning team! Sprint planning at 10am.', now - 3600000);
  ins.run('dev', 'dave', 'Pushed the new feature branch. PR ready for review.', now - 5000000);
  ins.run('dev', 'alice', 'On it! Will review within the hour.', now - 4500000);
  ins.run('dev', 'eve', 'Tests are passing on CI. Looks good.', now - 2000000);
  ins.run('random', 'bob', 'Anyone up for lunch at the pizza place?', now - 1800000);
  ins.run('random', 'carol', 'Count me in! 12:30?', now - 1600000);
}

app.get('/api/messages', (req, res) => {
  const channel = req.query.channel || 'general';
  const rows = db.prepare('SELECT * FROM messages WHERE channel = ? ORDER BY created_at DESC LIMIT 50').all(channel);
  res.json(rows.reverse());
});

app.post('/api/messages', (req, res) => {
  const { channel, username, content } = req.body;
  if (!channel || !username || !content) return res.status(400).json({ error: 'missing fields' });
  const result = db.prepare('INSERT INTO messages (channel, username, content, created_at) VALUES (?,?,?,?)').run(channel, username, content, Date.now());
  res.json({ ok: true, id: result.lastInsertRowid });
});

app.listen(PORT, () => console.log('Messaging app on port ' + PORT));
