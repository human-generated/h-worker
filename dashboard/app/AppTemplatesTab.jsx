'use client';
import { useState } from 'react';

const T = {
  bg: '#F4F4F4', card: '#FFFFFF', text: '#0D0D0D', muted: '#888888',
  border: '1px solid rgba(0,0,0,0.06)', shadow: '0 4px 20px rgba(0,0,0,0.05)',
  radius: '2px', mono: "'JetBrains Mono', monospace", ui: "'Space Grotesk', sans-serif",
  mint: '#6CEFA0', blue: '#6CDDEF', purple: '#B06CEF', orange: '#EF9B6C', red: '#EF4444',
};

const S = {
  card: { background: T.card, borderRadius: T.radius, padding: '1rem', boxShadow: T.shadow, border: T.border },
  btn: { background: T.text, color: '#fff', border: 'none', borderRadius: T.radius, padding: '0.5rem 1.25rem', cursor: 'pointer', fontFamily: T.mono, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
  btnGhost: { background: T.card, color: T.muted, border: '1px solid rgba(0,0,0,0.1)', borderRadius: T.radius, padding: '0.38rem 0.75rem', cursor: 'pointer', fontFamily: T.mono, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
  badge: (color) => ({ background: color, color: '#0D0D0D', borderRadius: T.radius, padding: '2px 7px', fontSize: '0.62rem', fontFamily: T.mono, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }),
};

// Read template file contents — using a simpler string approach
function getTemplates() {
  const messagingServer = `const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/messaging-' + PORT + '.db');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
db.exec('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, username TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL)');
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
app.listen(PORT, () => console.log('Messaging app on port ' + PORT));`;

  const messagingHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><title>Messaging</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a0a0f; color:#e2e8f0; font-family:'Segoe UI',sans-serif; display:flex; height:100vh; overflow:hidden; }
#sidebar { width:220px; background:#111827; border-right:1px solid #1e293b; display:flex; flex-direction:column; flex-shrink:0; }
#sidebar-header { padding:1rem; border-bottom:1px solid #1e293b; }
#sidebar-header h2 { font-size:1rem; font-weight:700; color:#f1f5f9; }
.channel-item { padding:0.6rem 1rem; cursor:pointer; display:flex; align-items:center; gap:0.5rem; font-size:0.85rem; color:#94a3b8; border-left:3px solid transparent; transition:all 0.15s; }
.channel-item:hover { background:#1e293b; color:#e2e8f0; }
.channel-item.active { background:#1e293b; color:#3b82f6; border-left-color:#3b82f6; font-weight:600; }
#main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
#chat-header { padding:0.75rem 1.25rem; border-bottom:1px solid #1e293b; background:#111827; }
#messages { flex:1; overflow-y:auto; padding:1rem 1.25rem; display:flex; flex-direction:column; gap:0.5rem; }
.msg-header { display:flex; align-items:baseline; gap:0.6rem; margin-bottom:0.15rem; }
.msg-user { font-weight:700; font-size:0.82rem; color:#3b82f6; }
.msg-time { font-size:0.68rem; color:#475569; }
.msg-content { background:#1e293b; padding:0.5rem 0.75rem; border-radius:0 8px 8px 8px; font-size:0.85rem; line-height:1.5; max-width:600px; color:#cbd5e1; }
#input-area { padding:1rem 1.25rem; border-top:1px solid #1e293b; background:#111827; display:flex; gap:0.75rem; align-items:center; }
#username-input { background:#1e293b; border:1px solid #334155; border-radius:6px; padding:0.5rem 0.75rem; color:#e2e8f0; font-size:0.82rem; width:120px; outline:none; }
#msg-input { flex:1; background:#1e293b; border:1px solid #334155; border-radius:6px; padding:0.5rem 0.75rem; color:#e2e8f0; font-size:0.85rem; outline:none; }
#send-btn { background:#3b82f6; color:#fff; border:none; border-radius:6px; padding:0.5rem 1.25rem; cursor:pointer; font-weight:600; }
</style>
</head>
<body>
<div id="sidebar">
<div id="sidebar-header"><h2>HW Chat</h2></div>
<div>
<div class="channel-item active" data-ch="general"># general</div>
<div class="channel-item" data-ch="dev"># dev</div>
<div class="channel-item" data-ch="random"># random</div>
</div>
</div>
<div id="main">
<div id="chat-header"><strong id="ch-name">#general</strong> <span id="msg-count" style="color:#64748b;font-size:0.75rem;"></span></div>
<div id="messages"></div>
<div id="input-area">
<input id="username-input" placeholder="Your name" value="user" />
<input id="msg-input" placeholder="Message..." />
<button id="send-btn">Send</button>
</div>
</div>
<script>
let currentChannel = 'general', lastCount = 0;
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
async function fetchMessages() {
  const r = await fetch('/api/messages?channel=' + currentChannel);
  const msgs = await r.json();
  if (msgs.length === lastCount) return;
  lastCount = msgs.length;
  document.getElementById('messages').innerHTML = msgs.map(m => '<div class="msg"><div class="msg-header"><span class="msg-user">' + m.username + '</span><span class="msg-time">' + fmtTime(m.created_at) + '</span></div><div class="msg-content">' + esc(m.content) + '</div></div>').join('');
  document.getElementById('msg-count').textContent = msgs.length + ' messages';
  document.getElementById('messages').scrollTop = 999999;
}
document.querySelectorAll('.channel-item').forEach(el => el.addEventListener('click', () => {
  document.querySelectorAll('.channel-item').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  currentChannel = el.dataset.ch;
  lastCount = 0;
  document.getElementById('ch-name').textContent = '#' + currentChannel;
  fetchMessages();
}));
document.getElementById('send-btn').addEventListener('click', async () => {
  const content = document.getElementById('msg-input').value.trim();
  const username = document.getElementById('username-input').value.trim() || 'user';
  if (!content) return;
  await fetch('/api/messages', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({channel:currentChannel,username,content}) });
  document.getElementById('msg-input').value = '';
  lastCount = 0;
  fetchMessages();
});
document.getElementById('msg-input').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('send-btn').click(); });
fetchMessages();
setInterval(fetchMessages, 2000);
</script>
</body>
</html>`;

  const ecomServer = `const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/ecom-' + PORT + '.db');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
db.exec('CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, category TEXT, price REAL, stock INTEGER, image_url TEXT); CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, customer TEXT, total REAL, status TEXT, created_at INTEGER); CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, product_id INTEGER, qty INTEGER, price REAL)');
const pCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
if (pCount.c === 0) {
  const ip = db.prepare('INSERT INTO products (name,category,price,stock,image_url) VALUES (?,?,?,?,?)');
  ip.run('MacBook Pro 16','Electronics',2499.99,15,'https://via.placeholder.com/200x150/1e293b/3b82f6?text=MacBook');
  ip.run('Sony WH-1000XM5','Electronics',349.99,42,'https://via.placeholder.com/200x150/1e293b/22c55e?text=Headphones');
  ip.run('iPad Air','Electronics',749.99,28,'https://via.placeholder.com/200x150/1e293b/f59e0b?text=iPad');
  ip.run('Samsung 4K Monitor','Electronics',599.99,19,'https://via.placeholder.com/200x150/1e293b/ef4444?text=Monitor');
  ip.run('Nike Air Max 270','Clothing',129.99,56,'https://via.placeholder.com/200x150/1e293b/a855f7?text=Shoes');
  ip.run('Levis 501 Jeans','Clothing',79.99,88,'https://via.placeholder.com/200x150/1e293b/06b6d4?text=Jeans');
  ip.run('North Face Jacket','Clothing',299.99,31,'https://via.placeholder.com/200x150/1e293b/3b82f6?text=Jacket');
  ip.run('Adidas Running Shirt','Clothing',49.99,120,'https://via.placeholder.com/200x150/1e293b/22c55e?text=Shirt');
  ip.run('Atomic Habits','Books',14.99,200,'https://via.placeholder.com/200x150/1e293b/f59e0b?text=Book1');
  ip.run('Deep Work','Books',16.99,150,'https://via.placeholder.com/200x150/1e293b/ef4444?text=Book2');
  ip.run('The Lean Startup','Books',13.99,175,'https://via.placeholder.com/200x150/1e293b/a855f7?text=Book3');
  ip.run('Clean Code','Books',39.99,90,'https://via.placeholder.com/200x150/1e293b/06b6d4?text=Book4');
  const io = db.prepare('INSERT INTO orders (customer,total,status,created_at) VALUES (?,?,?,?)');
  const ii = db.prepare('INSERT INTO order_items (order_id,product_id,qty,price) VALUES (?,?,?,?)');
  const now = Date.now();
  [[1,'Alice Chen',2849.98,'delivered',now-864000000],[2,'Bob Martinez',749.99,'shipped',now-432000000],[3,'Carol White',209.98,'processing',now-86400000],[4,'Dave Kim',599.99,'pending',now-43200000],[5,'Eve Johnson',349.97,'delivered',now-172800000],[6,'Frank Liu',129.97,'shipped',now-21600000]].forEach(([pid,c,t,s,at]) => {
    const r = io.run(c,t,s,at);
    ii.run(r.lastInsertRowid,pid,1,t);
  });
}
app.get('/api/products', (req, res) => {
  const rows = req.query.category ? db.prepare('SELECT * FROM products WHERE category = ?').all(req.query.category) : db.prepare('SELECT * FROM products').all();
  res.json(rows);
});
app.get('/api/orders', (req, res) => res.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all()));
app.post('/api/orders', (req, res) => {
  const { customer, total, status, items } = req.body;
  if (!customer) return res.status(400).json({ error: 'customer required' });
  const r = db.prepare('INSERT INTO orders (customer,total,status,created_at) VALUES (?,?,?,?)').run(customer, total || 0, status || 'pending', Date.now());
  if (items && Array.isArray(items)) {
    const ii = db.prepare('INSERT INTO order_items (order_id,product_id,qty,price) VALUES (?,?,?,?)');
    items.forEach(item => { const p = db.prepare('SELECT price FROM products WHERE id = ?').get(item.product_id); ii.run(r.lastInsertRowid, item.product_id, item.qty || 1, p ? p.price : 0); });
  }
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.listen(PORT, () => console.log('E-Commerce app on port ' + PORT));`;

  const ecomHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>E-Commerce</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { background:#0a0a0f; color:#e2e8f0; font-family:'Segoe UI',sans-serif; } .header { background:#111827; border-bottom:1px solid #1e293b; padding:1rem 1.5rem; display:flex; align-items:center; justify-content:space-between; } .stats-bar { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; padding:1rem 1.5rem; background:#0f172a; border-bottom:1px solid #1e293b; } .stat { background:#1e293b; border-radius:8px; padding:0.75rem 1rem; } .stat-label { font-size:0.68rem; color:#64748b; text-transform:uppercase; } .stat-value { font-size:1.5rem; font-weight:700; margin-top:0.2rem; } .tabs { display:flex; border-bottom:1px solid #1e293b; background:#111827; } .tab { padding:0.75rem 1.5rem; cursor:pointer; font-size:0.82rem; color:#64748b; border-bottom:2px solid transparent; } .tab.active { color:#3b82f6; border-bottom-color:#3b82f6; } #content { padding:1.5rem; } .product-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:1rem; } .product-card { background:#1e293b; border-radius:10px; overflow:hidden; border:1px solid #334155; } .product-img { width:100%; height:120px; object-fit:cover; } .product-body { padding:0.75rem; } .product-name { font-size:0.82rem; font-weight:600; } .product-price { color:#22c55e; font-weight:700; } .filter-btn { padding:0.3rem 0.8rem; border-radius:20px; border:1px solid #334155; background:transparent; color:#94a3b8; cursor:pointer; font-size:0.72rem; margin-right:0.4rem; margin-bottom:0.75rem; } .filter-btn.active { background:#3b82f6; border-color:#3b82f6; color:#fff; } .order-row { background:#1e293b; border-radius:8px; padding:0.75rem 1rem; display:flex; align-items:center; gap:1rem; margin-bottom:0.5rem; } .badge { padding:0.2rem 0.6rem; border-radius:20px; font-size:0.68rem; font-weight:600; text-transform:uppercase; } .badge-delivered { background:#14532d; color:#4ade80; } .badge-shipped { background:#1e3a5f; color:#60a5fa; } .badge-processing { background:#451a03; color:#fb923c; } .badge-pending { background:#1f2937; color:#9ca3af; }</style>
</head>
<body>
<div class="header"><h1>ShopHW E-Commerce</h1><span style="color:#64748b;font-size:0.75rem;">Live inventory</span></div>
<div class="stats-bar">
<div class="stat"><div class="stat-label">Revenue</div><div class="stat-value" id="s-rev" style="color:#22c55e;">-</div></div>
<div class="stat"><div class="stat-label">Orders</div><div class="stat-value" id="s-ord" style="color:#3b82f6;">-</div></div>
<div class="stat"><div class="stat-label">Products</div><div class="stat-value" id="s-pro" style="color:#f59e0b;">-</div></div>
</div>
<div class="tabs">
<div class="tab active" data-tab="products">Products</div>
<div class="tab" data-tab="orders">Orders</div>
</div>
<div id="content">
<div id="products-tab">
<div><button class="filter-btn active" data-cat="">All</button><button class="filter-btn" data-cat="Electronics">Electronics</button><button class="filter-btn" data-cat="Clothing">Clothing</button><button class="filter-btn" data-cat="Books">Books</button></div>
<div class="product-grid" id="product-grid"></div>
</div>
<div id="orders-tab" style="display:none"><div id="order-list"></div></div>
</div>
<script>
let currentCat='';
function fmtP(p){return '$'+Number(p).toFixed(2);}
async function fetchProducts(){
  const products=await fetch('/api/products'+(currentCat?'?category='+currentCat:'')).then(r=>r.json());
  document.getElementById('product-grid').innerHTML=products.map(p=>'<div class="product-card"><img class="product-img" src="'+p.image_url+'" /><div class="product-body"><div class="product-name">'+p.name+'</div><div style="font-size:0.68rem;color:#64748b;">'+p.category+'</div><div class="product-price">'+fmtP(p.price)+'</div></div></div>').join('');
  document.getElementById('s-pro').textContent=products.length;
}
async function fetchOrders(){
  const orders=await fetch('/api/orders').then(r=>r.json());
  document.getElementById('order-list').innerHTML=orders.map(o=>'<div class="order-row"><span style="color:#64748b;font-family:monospace;">#'+o.id+'</span><span style="flex:1;font-weight:600;">'+o.customer+'</span><span style="color:#22c55e;font-weight:700;">'+fmtP(o.total)+'</span><span class="badge badge-'+o.status+'">'+o.status+'</span></div>').join('');
  document.getElementById('s-rev').textContent=fmtP(orders.reduce((s,o)=>s+o.total,0));
  document.getElementById('s-ord').textContent=orders.length;
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  document.getElementById('products-tab').style.display=t.dataset.tab==='products'?'':'none';
  document.getElementById('orders-tab').style.display=t.dataset.tab==='orders'?'':'none';
}));
document.querySelectorAll('.filter-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.filter-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
  currentCat=b.dataset.cat; fetchProducts();
}));
fetchProducts(); fetchOrders();
setInterval(()=>{fetchProducts();fetchOrders();},3000);
</script>
</body>
</html>`;

  const crmServer = `const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/crm-' + PORT + '.db');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
db.exec('CREATE TABLE IF NOT EXISTS contacts (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, company TEXT, email TEXT, stage TEXT, value REAL, owner TEXT); CREATE TABLE IF NOT EXISTS activities (id INTEGER PRIMARY KEY AUTOINCREMENT, contact_id INTEGER, type TEXT, note TEXT, created_at INTEGER)');
const cc = db.prepare('SELECT COUNT(*) as c FROM contacts').get();
if (cc.c === 0) {
  const ic = db.prepare('INSERT INTO contacts (name,company,email,stage,value,owner) VALUES (?,?,?,?,?,?)');
  const ia = db.prepare('INSERT INTO activities (contact_id,type,note,created_at) VALUES (?,?,?,?)');
  const now = Date.now();
  const contacts = [['Sarah Connor','Cyberdyne Systems','sarah@cyberdyne.io','lead',15000,'alice'],['John Wick','Continental Hotels','jwick@continental.com','prospect',45000,'bob'],['Tony Stark','Stark Industries','tony@stark.io','qualified',250000,'alice'],['Bruce Wayne','Wayne Enterprises','bruce@wayne.co','proposal',500000,'carol'],['Diana Prince','Themyscira LLC','diana@themyscira.com','qualified',180000,'bob'],['Peter Parker','Daily Bugle','peter@dailybugle.com','lead',8000,'alice'],['Clark Kent','Daily Planet','clark@dailyplanet.com','prospect',62000,'carol'],['Natasha Romanov','SHIELD Corp','natasha@shield.gov','closed',320000,'bob'],['Steve Rogers','Avengers Inc','steve@avengers.com','closed',150000,'alice'],['Thor Odinson','Asgard Ventures','thor@asgard.com','proposal',750000,'carol']];
  contacts.forEach((c,i)=>{const r=ic.run(...c);ia.run(r.lastInsertRowid,'call','Discovery call completed',now-(i*86400000*3));ia.run(r.lastInsertRowid,'email','Sent product overview deck',now-(i*86400000*2));if(i%3===0)ia.run(r.lastInsertRowid,'meeting','Demo scheduled',now-86400000);});
}
app.get('/api/contacts', (req, res) => {
  const rows = req.query.stage ? db.prepare('SELECT * FROM contacts WHERE stage = ? ORDER BY value DESC').all(req.query.stage) : db.prepare('SELECT * FROM contacts ORDER BY value DESC').all();
  res.json(rows);
});
app.put('/api/contacts/:id', (req, res) => {
  const { stage, value, owner } = req.body;
  const updates = []; const vals = [];
  if (stage !== undefined) { updates.push('stage = ?'); vals.push(stage); }
  if (value !== undefined) { updates.push('value = ?'); vals.push(value); }
  if (owner !== undefined) { updates.push('owner = ?'); vals.push(owner); }
  if (!updates.length) return res.status(400).json({ error: 'nothing to update' });
  vals.push(req.params.id);
  db.prepare('UPDATE contacts SET ' + updates.join(', ') + ' WHERE id = ?').run(...vals);
  res.json({ ok: true });
});
app.get('/api/activities', (req, res) => {
  const rows = req.query.contact_id ? db.prepare('SELECT a.*, c.name as contact_name FROM activities a JOIN contacts c ON a.contact_id = c.id WHERE a.contact_id = ? ORDER BY a.created_at DESC').all(req.query.contact_id) : db.prepare('SELECT a.*, c.name as contact_name FROM activities a JOIN contacts c ON a.contact_id = c.id ORDER BY a.created_at DESC LIMIT 20').all();
  res.json(rows);
});
app.post('/api/activities', (req, res) => {
  const { contact_id, type, note } = req.body;
  if (!contact_id || !type) return res.status(400).json({ error: 'contact_id and type required' });
  const r = db.prepare('INSERT INTO activities (contact_id,type,note,created_at) VALUES (?,?,?,?)').run(contact_id, type, note || '', Date.now());
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.listen(PORT, () => console.log('CRM app on port ' + PORT));`;

  const crmHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>CRM</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { background:#0a0a0f; color:#e2e8f0; font-family:'Segoe UI',sans-serif; } .header { background:#111827; border-bottom:1px solid #1e293b; padding:1rem 1.5rem; display:flex; align-items:center; justify-content:space-between; } .pipeline { display:flex; gap:1rem; padding:1rem 1.5rem; overflow-x:auto; min-height:calc(100vh - 200px); } .stage-col { min-width:200px; flex:1; display:flex; flex-direction:column; gap:0.5rem; } .stage-header { padding:0.5rem 0.75rem; border-radius:8px 8px 0 0; font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; display:flex; justify-content:space-between; } .stage-lead { background:#1e293b; color:#94a3b8; } .stage-prospect { background:#1c1917; color:#fb923c; } .stage-qualified { background:#1a1f2e; color:#60a5fa; } .stage-proposal { background:#1a1a2e; color:#a78bfa; } .stage-closed { background:#14532d30; color:#4ade80; } .contact-card { background:#1e293b; border-radius:8px; padding:0.75rem; border:1px solid #334155; } .contact-name { font-size:0.85rem; font-weight:600; } .contact-company { font-size:0.72rem; color:#64748b; } .contact-value { font-size:0.82rem; color:#22c55e; font-weight:600; } .activity-feed { background:#111827; border-top:1px solid #1e293b; padding:0.75rem 1.5rem; max-height:160px; overflow-y:auto; } .activity-item { display:flex; gap:0.75rem; align-items:center; padding:0.3rem 0; border-bottom:1px solid #1e293b22; font-size:0.75rem; } .atype { padding:0.1rem 0.5rem; border-radius:10px; font-size:0.65rem; font-weight:600; text-transform:uppercase; } .type-call { background:#1e3a5f; color:#60a5fa; } .type-email { background:#14532d30; color:#4ade80; } .type-meeting { background:#451a03; color:#fb923c; } .type-note { background:#2d1b69; color:#a78bfa; }</style>
</head>
<body>
<div class="header"><h1>CRM Pipeline</h1><span id="summary" style="color:#64748b;font-size:0.75rem;">Loading...</span></div>
<div class="pipeline" id="pipeline"></div>
<div class="activity-feed">
<div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem;">Recent Activities</div>
<div id="activities"></div>
</div>
<script>
const STAGES=['lead','prospect','qualified','proposal','closed'];
const LABELS={lead:'Lead',prospect:'Prospect',qualified:'Qualified',proposal:'Proposal',closed:'Closed Won'};
function fmtVal(v){if(v>=1000000)return '$'+(v/1000000).toFixed(1)+'M';if(v>=1000)return '$'+(v/1000).toFixed(0)+'k';return '$'+v;}
async function fetchAll(){
  const [contacts,activities]=await Promise.all([fetch('/api/contacts').then(r=>r.json()),fetch('/api/activities').then(r=>r.json())]);
  const byStage={};STAGES.forEach(s=>{byStage[s]=[];});contacts.forEach(c=>{if(byStage[c.stage])byStage[c.stage].push(c);});
  const totalValue=contacts.reduce((s,c)=>s+c.value,0);
  document.getElementById('summary').textContent=contacts.length+' contacts | '+fmtVal(totalValue)+' pipeline';
  document.getElementById('pipeline').innerHTML=STAGES.map(stage=>{
    const cards=byStage[stage]||[];
    const sv=cards.reduce((s,c)=>s+c.value,0);
    return '<div class="stage-col"><div class="stage-header stage-'+stage+'"><span>'+LABELS[stage]+'</span><span>'+cards.length+' | '+fmtVal(sv)+'</span></div>'+cards.map(c=>'<div class="contact-card"><div class="contact-name">'+c.name+'</div><div class="contact-company">'+c.company+'</div><div class="contact-value">'+fmtVal(c.value)+'</div></div>').join('')+'</div>';
  }).join('');
  document.getElementById('activities').innerHTML=activities.slice(0,12).map(a=>{
    const diff=Math.floor((Date.now()-a.created_at)/3600000);
    const t=diff<24?diff+'h ago':Math.floor(diff/24)+'d ago';
    return '<div class="activity-item"><span class="atype type-'+a.type+'">'+a.type+'</span><span style="flex:1;color:#94a3b8;">'+a.note+'</span><span style="color:#475569;font-size:0.68rem;">'+a.contact_name+' '+t+'</span></div>';
  }).join('');
}
fetchAll(); setInterval(fetchAll,3000);
</script>
</body>
</html>`;

  const erpServer = `const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/erp-' + PORT + '.db');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
db.exec('CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT, name TEXT, category TEXT, qty INTEGER, reorder_point INTEGER, cost REAL); CREATE TABLE IF NOT EXISTS purchase_orders (id INTEGER PRIMARY KEY AUTOINCREMENT, vendor TEXT, status TEXT, total REAL, created_at INTEGER); CREATE TABLE IF NOT EXISTS employees (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, dept TEXT, role TEXT, salary REAL)');
const ic = db.prepare('SELECT COUNT(*) as c FROM inventory').get();
if (ic.c === 0) {
  const ii=db.prepare('INSERT INTO inventory (sku,name,category,qty,reorder_point,cost) VALUES (?,?,?,?,?,?)');
  const ipo=db.prepare('INSERT INTO purchase_orders (vendor,status,total,created_at) VALUES (?,?,?,?)');
  const ie=db.prepare('INSERT INTO employees (name,dept,role,salary) VALUES (?,?,?,?)');
  [['INV-001','MacBook Pro 16','Electronics',12,5,1800],['INV-002','Dell XPS 15','Electronics',8,3,1200],['INV-003','Office Chairs','Furniture',45,10,250],['INV-004','Standing Desks','Furniture',18,5,600],['INV-005','A4 Paper Reams','Office Supplies',200,50,8],['INV-006','Printer Ink','Office Supplies',35,15,25],['INV-007','USB-C Hubs','Electronics',60,20,45],['INV-008','Monitor 27in','Electronics',15,4,350],['INV-009','Whiteboards','Furniture',8,2,120],['INV-010','Ethernet Cables','Networking',90,30,12],['INV-011','Wireless Mice','Electronics',55,20,35],['INV-012','Keyboards','Electronics',50,20,80],['INV-013','Laptop Stands','Accessories',40,15,55],['INV-014','Headsets','Electronics',22,8,150],['INV-015','Coffee Pods','Consumables',300,100,1]].forEach(i=>ii.run(...i));
  const now=Date.now();
  ipo.run('TechCorp Supplies','delivered',15600,now-864000000);
  ipo.run('Office World','approved',4200,now-432000000);
  ipo.run('Global Furniture Co','pending',8800,now-86400000);
  ipo.run('NetGear Distribution','approved',3600,now-43200000);
  ipo.run('Coffee Direct','delivered',900,now-172800000);
  ie.run('Emma Thompson','Engineering','Senior Engineer',145000);
  ie.run('James Wilson','Engineering','Lead Developer',165000);
  ie.run('Sofia Rodriguez','Product','Product Manager',135000);
  ie.run('Liam Chen','Design','UI/UX Designer',115000);
  ie.run('Olivia Brown','Marketing','Marketing Manager',110000);
  ie.run('Noah Davis','Sales','Sales Director',155000);
  ie.run('Ava Martinez','Engineering','DevOps Engineer',140000);
  ie.run('William Taylor','Finance','CFO',195000);
  ie.run('Isabella Anderson','HR','HR Manager',100000);
  ie.run('Benjamin Garcia','Sales','Account Executive',90000);
  ie.run('Mia Jackson','Engineering','Frontend Developer',120000);
  ie.run('Ethan White','Operations','COO',210000);
}
app.get('/api/inventory', (req,res)=>res.json(db.prepare('SELECT * FROM inventory ORDER BY qty ASC').all()));
app.put('/api/inventory/:id', (req,res)=>{ const {qty}=req.body; if(qty===undefined)return res.status(400).json({error:'qty required'}); db.prepare('UPDATE inventory SET qty=? WHERE id=?').run(qty,req.params.id); res.json({ok:true}); });
app.get('/api/purchase-orders', (req,res)=>res.json(db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all()));
app.get('/api/employees', (req,res)=>{ const rows=req.query.dept?db.prepare('SELECT * FROM employees WHERE dept=? ORDER BY salary DESC').all(req.query.dept):db.prepare('SELECT * FROM employees ORDER BY salary DESC').all(); res.json(rows); });
app.listen(PORT, ()=>console.log('ERP app on port ' + PORT));`;

  const erpHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>ERP System</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { background:#0a0a0f; color:#e2e8f0; font-family:'Segoe UI',sans-serif; } .header { background:#111827; border-bottom:1px solid #1e293b; padding:1rem 1.5rem; display:flex; align-items:center; justify-content:space-between; } .tabs { display:flex; border-bottom:1px solid #1e293b; background:#111827; } .tab { padding:0.75rem 1.5rem; cursor:pointer; font-size:0.82rem; color:#64748b; border-bottom:2px solid transparent; } .tab.active { color:#3b82f6; border-bottom-color:#3b82f6; } #content { padding:1.5rem; } table { width:100%; border-collapse:collapse; font-size:0.82rem; } th { text-align:left; padding:0.5rem 0.75rem; font-size:0.68rem; color:#64748b; text-transform:uppercase; letter-spacing:0.06em; border-bottom:1px solid #1e293b; } td { padding:0.6rem 0.75rem; border-bottom:1px solid #1e293b22; } tr:hover td { background:#1e293b22; } .bar { height:6px; border-radius:3px; background:#1e293b; overflow:hidden; width:80px; } .bar-fill { height:100%; border-radius:3px; } .badge { padding:0.2rem 0.6rem; border-radius:12px; font-size:0.65rem; font-weight:600; text-transform:uppercase; } .badge-delivered { background:#14532d30; color:#4ade80; } .badge-approved { background:#1e3a5f; color:#60a5fa; } .badge-pending { background:#1f2937; color:#9ca3af; } .emp-card { display:inline-block; background:#1e293b; border-radius:8px; padding:0.75rem 1rem; margin:0.4rem; min-width:180px; vertical-align:top; border-left:3px solid #3b82f6; }</style>
</head>
<body>
<div class="header"><h1>HW-ERP System</h1><span id="erp-summary" style="color:#64748b;font-size:0.75rem;">Loading...</span></div>
<div class="tabs">
<div class="tab active" data-tab="inventory">Inventory</div>
<div class="tab" data-tab="po">Purchase Orders</div>
<div class="tab" data-tab="employees">Employees</div>
</div>
<div id="content">
<div id="inventory-tab"><table><thead><tr><th>SKU</th><th>Name</th><th>Category</th><th>Qty</th><th>Stock Level</th><th>Reorder At</th><th>Unit Cost</th></tr></thead><tbody id="inv-body"></tbody></table></div>
<div id="po-tab" style="display:none"><table><thead><tr><th>ID</th><th>Vendor</th><th>Status</th><th>Total</th><th>Date</th></tr></thead><tbody id="po-body"></tbody></table></div>
<div id="employees-tab" style="display:none"><div id="emp-grid"></div></div>
</div>
<script>
function fmtC(v){return '$'+Number(v).toLocaleString();}
function fmtD(ts){return new Date(ts).toLocaleDateString();}
async function fetchInventory(){
  const items=await fetch('/api/inventory').then(r=>r.json());
  const low=items.filter(i=>i.qty<=i.reorder_point).length;
  document.getElementById('erp-summary').textContent=items.length+' items | '+low+' low stock';
  document.getElementById('inv-body').innerHTML=items.map(i=>{
    const pct=Math.min(100,Math.round((i.qty/Math.max(i.reorder_point*3,i.qty))*100));
    const c=i.qty<=i.reorder_point?'#ef4444':i.qty<=i.reorder_point*1.5?'#f59e0b':'#22c55e';
    return '<tr><td style="font-family:monospace;color:#64748b;">'+i.sku+'</td><td style="font-weight:600;">'+i.name+'</td><td style="color:#94a3b8;font-size:0.75rem;">'+i.category+'</td><td style="font-weight:700;color:'+c+'">'+i.qty+'</td><td><div class="bar"><div class="bar-fill" style="width:'+pct+'%;background:'+c+'"></div></div></td><td style="color:#64748b;">'+i.reorder_point+'</td><td>'+fmtC(i.cost)+'</td></tr>';
  }).join('');
}
async function fetchPOs(){
  const pos=await fetch('/api/purchase-orders').then(r=>r.json());
  document.getElementById('po-body').innerHTML=pos.map(p=>'<tr><td style="font-family:monospace;color:#64748b;">#'+p.id+'</td><td style="font-weight:600;">'+p.vendor+'</td><td><span class="badge badge-'+p.status+'">'+p.status+'</span></td><td style="color:#22c55e;font-weight:700;">'+fmtC(p.total)+'</td><td style="color:#64748b;">'+fmtD(p.created_at)+'</td></tr>').join('');
}
async function fetchEmployees(){
  const emps=await fetch('/api/employees').then(r=>r.json());
  const depts=[...new Set(emps.map(e=>e.dept))];
  document.getElementById('emp-grid').innerHTML=depts.map(dept=>{
    const de=emps.filter(e=>e.dept===dept);
    return '<div style="margin-bottom:1.5rem;"><div style="font-size:0.72rem;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem;">'+dept+' ('+de.length+')</div>'+de.map(e=>'<div class="emp-card"><div style="font-weight:600;">'+e.name+'</div><div style="font-size:0.72rem;color:#64748b;">'+e.role+'</div><div style="color:#22c55e;font-weight:600;">'+fmtC(e.salary)+'/yr</div></div>').join('')+'</div>';
  }).join('');
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  document.getElementById('inventory-tab').style.display=t.dataset.tab==='inventory'?'':'none';
  document.getElementById('po-tab').style.display=t.dataset.tab==='po'?'':'none';
  document.getElementById('employees-tab').style.display=t.dataset.tab==='employees'?'':'none';
}));
fetchInventory(); fetchPOs(); fetchEmployees();
setInterval(fetchInventory,3000);
</script>
</body>
</html>`;

  const supportServer = `const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/support-' + PORT + '.db');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
db.exec('CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, status TEXT, tickets_handled INTEGER); CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT, customer TEXT, priority TEXT, status TEXT, agent_id INTEGER, created_at INTEGER, resolved_at INTEGER); CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER, author TEXT, content TEXT, created_at INTEGER)');
const ac = db.prepare('SELECT COUNT(*) as c FROM agents').get();
if (ac.c === 0) {
  const ia=db.prepare('INSERT INTO agents (name,status,tickets_handled) VALUES (?,?,?)');
  const it=db.prepare('INSERT INTO tickets (subject,customer,priority,status,agent_id,created_at,resolved_at) VALUES (?,?,?,?,?,?,?)');
  const ic=db.prepare('INSERT INTO comments (ticket_id,author,content,created_at) VALUES (?,?,?,?)');
  ia.run('Sarah Mitchell','available',245); ia.run('James Park','busy',312); ia.run('Priya Sharma','available',189); ia.run('Carlos Rivera','break',421);
  const now=Date.now();
  const tickets=[['Production database down','TechCorp Inc','critical','open',2,now-1800000,null],['Payment gateway 500 errors','ShopMaster LLC','critical','in_progress',1,now-3600000,null],['User authentication failing','StartupX','high','open',3,now-7200000,null],['API rate limits crashing app','DevAgency Pro','high','in_progress',2,now-14400000,null],['Email notifications not sent','RetailCo','medium','open',null,now-21600000,null],['Dashboard loading slowly','Analytics Corp','medium','in_progress',1,now-28800000,null],['Feature request: bulk export','Enterprise Inc','low','open',null,now-43200000,null],['Documentation links broken','DevUser123','low','resolved',4,now-86400000,now-43200000],['Cannot change email address','user@example.com','medium','resolved',3,now-172800000,now-86400000],['Mobile app crashing iOS 17','MobileFirst Ltd','high','open',null,now-10800000,null],['SSL cert expiring in 3 days','SecureShop','critical','open',null,now-900000,null],['Cannot export large reports','DataCrunch Co','medium','in_progress',4,now-36000000,null]];
  tickets.forEach((t,i)=>{
    const r=it.run(...t);
    ic.run(r.lastInsertRowid,t[1],'This issue is urgently affecting our business. Please help.',now-900000);
    ic.run(r.lastInsertRowid,t[4]?['Sarah Mitchell','James Park','Priya Sharma','Carlos Rivera'][t[4]-1]:'Support Bot','Thank you for reaching out. We have received your ticket and are investigating.',now-600000);
    if(i%3===0)ic.run(r.lastInsertRowid,t[1],'Any update on this? Still affected.',now-300000);
  });
}
app.get('/api/tickets', (req,res)=>{
  let q='SELECT * FROM tickets'; const filters=[]; const vals=[];
  if(req.query.status){filters.push('status = ?');vals.push(req.query.status);}
  if(req.query.priority){filters.push('priority = ?');vals.push(req.query.priority);}
  if(filters.length)q+=' WHERE '+filters.join(' AND ');
  q+=' ORDER BY CASE priority WHEN "critical" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 ELSE 4 END, created_at ASC';
  res.json(db.prepare(q).all(...vals));
});
app.put('/api/tickets/:id', (req,res)=>{
  const {status,agent_id}=req.body; const updates=[]; const vals=[];
  if(status!==undefined){updates.push('status = ?');vals.push(status);if(status==='resolved'){updates.push('resolved_at = ?');vals.push(Date.now());}}
  if(agent_id!==undefined){updates.push('agent_id = ?');vals.push(agent_id);}
  if(!updates.length)return res.status(400).json({error:'nothing to update'});
  vals.push(req.params.id);
  db.prepare('UPDATE tickets SET '+updates.join(', ')+' WHERE id = ?').run(...vals);
  res.json({ok:true});
});
app.get('/api/agents', (req,res)=>res.json(db.prepare('SELECT * FROM agents ORDER BY tickets_handled DESC').all()));
app.get('/api/comments', (req,res)=>{
  if(!req.query.ticket_id)return res.status(400).json({error:'ticket_id required'});
  res.json(db.prepare('SELECT * FROM comments WHERE ticket_id = ? ORDER BY created_at ASC').all(req.query.ticket_id));
});
app.post('/api/comments', (req,res)=>{
  const {ticket_id,author,content}=req.body;
  if(!ticket_id||!content)return res.status(400).json({error:'ticket_id and content required'});
  const r=db.prepare('INSERT INTO comments (ticket_id,author,content,created_at) VALUES (?,?,?,?)').run(ticket_id,author||'Agent',content,Date.now());
  res.json({ok:true,id:r.lastInsertRowid});
});
app.listen(PORT, ()=>console.log('Support app on port ' + PORT));`;

  const supportHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Support Center</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { background:#0a0a0f; color:#e2e8f0; font-family:'Segoe UI',sans-serif; display:flex; height:100vh; overflow:hidden; } #sidebar { width:290px; background:#111827; border-right:1px solid #1e293b; display:flex; flex-direction:column; flex-shrink:0; } #sidebar-header { padding:1rem; border-bottom:1px solid #1e293b; } #ticket-list { flex:1; overflow-y:auto; } .ticket-item { padding:0.75rem 1rem; border-bottom:1px solid #1e293b22; cursor:pointer; } .ticket-item:hover { background:#1e293b44; } .ticket-item.active { background:#1e293b; border-left:3px solid #3b82f6; } .ticket-subj { font-size:0.82rem; font-weight:600; margin-bottom:0.2rem; } .ticket-meta { display:flex; gap:0.5rem; align-items:center; font-size:0.68rem; } .p-dot { width:7px; height:7px; border-radius:50%; } .pc-critical { background:#ef4444; } .pc-high { background:#f97316; } .pc-medium { background:#eab308; } .pc-low { background:#6b7280; } .pl-critical { color:#ef4444; } .pl-high { color:#f97316; } .pl-medium { color:#eab308; } .pl-low { color:#6b7280; } #main { flex:1; display:flex; flex-direction:column; overflow:hidden; } #agents-bar { background:#0f172a; border-bottom:1px solid #1e293b; padding:0.5rem 1rem; display:flex; gap:1rem; overflow-x:auto; } .agent-chip { display:flex; align-items:center; gap:0.4rem; background:#1e293b; border-radius:20px; padding:0.3rem 0.75rem; font-size:0.72rem; white-space:nowrap; } .a-dot { width:7px; height:7px; border-radius:50%; } .s-available { background:#22c55e; } .s-busy { background:#f59e0b; } .s-break { background:#6b7280; } #ticket-detail { flex:1; overflow-y:auto; padding:1.5rem; } .comment { background:#1e293b; border-radius:8px; padding:0.75rem; margin-bottom:0.75rem; } .comment-author { font-size:0.75rem; font-weight:700; color:#3b82f6; margin-bottom:0.3rem; } .comment-content { font-size:0.85rem; color:#cbd5e1; }</style>
</head>
<body>
<div id="sidebar">
<div id="sidebar-header"><h2>Support Queue</h2><small id="q-summary" style="color:#64748b;">Loading...</small></div>
<div id="ticket-list"></div>
</div>
<div id="main">
<div id="agents-bar"></div>
<div id="ticket-detail"><div id="no-sel" style="color:#334155;margin:auto;text-align:center;padding:3rem;">Select a ticket</div><div id="ticket-content" style="display:none"></div></div>
</div>
<script>
let selId=null, tickets=[];
function fmtTime(ts){const d=Date.now()-ts;if(d<3600000)return Math.floor(d/60000)+'m ago';if(d<86400000)return Math.floor(d/3600000)+'h ago';return Math.floor(d/86400000)+'d ago';}
async function fetchAll(){
  const [tks,ags]=await Promise.all([fetch('/api/tickets').then(r=>r.json()),fetch('/api/agents').then(r=>r.json())]);
  tickets=tks;
  const open=tks.filter(t=>t.status!=='resolved').length;
  const crit=tks.filter(t=>t.priority==='critical'&&t.status!=='resolved').length;
  document.getElementById('q-summary').textContent=open+' open | '+crit+' critical';
  document.getElementById('ticket-list').innerHTML=tks.map(t=>'<div class="ticket-item'+(t.id===selId?' active':'')+'" data-id="'+t.id+'"><div class="ticket-subj">'+t.subject.slice(0,42)+'</div><div class="ticket-meta"><span class="p-dot pc-'+t.priority+'"></span><span class="pl-'+t.priority+'">'+t.priority+'</span><span style="color:#64748b;margin-left:auto;">'+t.customer.slice(0,18)+'</span></div></div>').join('');
  document.getElementById('agents-bar').innerHTML='<span style="font-size:0.68rem;color:#475569;line-height:2;">Agents:</span>'+ags.map(a=>'<div class="agent-chip"><span class="a-dot s-'+a.status+'"></span>'+a.name.split(' ')[0]+'<span style="color:#475569">'+a.tickets_handled+'</span></div>').join('');
  document.querySelectorAll('.ticket-item').forEach(el=>el.addEventListener('click',()=>selectTicket(parseInt(el.dataset.id))));
  if(selId)fetchComments(selId);
}
function selectTicket(id){
  selId=id; const t=tickets.find(x=>x.id===id); if(!t)return;
  document.querySelectorAll('.ticket-item').forEach(el=>el.classList.toggle('active',parseInt(el.dataset.id)===id));
  document.getElementById('no-sel').style.display='none';
  document.getElementById('ticket-content').style.display='';
  const sc={open:'#f59e0b',in_progress:'#3b82f6',resolved:'#22c55e'};
  document.getElementById('ticket-content').innerHTML='<div style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;">'+t.subject+'</div><div style="display:flex;gap:1rem;font-size:0.72rem;color:#64748b;margin-bottom:1.5rem;"><span>'+t.customer+'</span><span style="background:'+(sc[t.status]||'#64748b')+'22;color:'+(sc[t.status]||'#64748b')+';padding:0.2rem 0.7rem;border-radius:12px;font-size:0.68rem;font-weight:700;">'+t.status.replace('_',' ')+'</span><span>'+t.priority+'</span><span>'+fmtTime(t.created_at)+'</span></div><div id="comments-list"></div>';
  fetchComments(id);
}
async function fetchComments(id){
  try{const c=await fetch('/api/comments?ticket_id='+id).then(r=>r.json());const el=document.getElementById('comments-list');if(el)el.innerHTML=c.map(x=>'<div class="comment"><div class="comment-author">'+x.author+'</div><div class="comment-content">'+x.content+'</div><div style="font-size:0.65rem;color:#475569;margin-top:0.3rem;">'+fmtTime(x.created_at)+'</div></div>').join('');}catch(e){}
}
fetchAll(); setInterval(fetchAll,2000);
</script>
</body>
</html>`;

  const analyticsServer = `const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/analytics-' + PORT + '.db');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
db.exec('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, metric TEXT NOT NULL, value REAL NOT NULL, ts INTEGER NOT NULL)');
const ec = db.prepare('SELECT COUNT(*) as c FROM events').get();
if (ec.c === 0) {
  const ins = db.prepare('INSERT INTO events (metric,value,ts) VALUES (?,?,?)');
  const now = Date.now();
  const HOUR = 3600000;
  for (let h = 168; h >= 0; h--) {
    const ts = now - h * HOUR;
    const m = (new Date(ts)).getHours();
    const mult = (m >= 9 && m <= 18) ? 1.5 : 0.6;
    ins.run('pageviews', Math.floor((Math.random() * 800 + 200) * mult), ts);
    ins.run('revenue', Math.floor((Math.random() * 3000 + 500) * mult), ts);
    ins.run('signups', Math.floor((Math.random() * 50 + 5) * mult), ts);
    ins.run('errors', Math.floor((Math.random() * 30 + 1) * mult), ts);
  }
}
setInterval(function() {
  const ins = db.prepare('INSERT INTO events (metric,value,ts) VALUES (?,?,?)');
  ins.run('pageviews', Math.floor(Math.random()*50+10), Date.now());
  ins.run('signups', Math.floor(Math.random()*5+1), Date.now());
  ins.run('revenue', Math.floor(Math.random()*200+50), Date.now());
  ins.run('errors', Math.floor(Math.random()*5), Date.now());
}, 10000);
app.get('/api/metrics', (req, res) => {
  const h = parseInt(req.query.hours) || 24;
  const since = Date.now() - h * 3600000;
  const metrics = ['pageviews','revenue','signups','errors'];
  if (!req.query.metric) {
    const result = {};
    metrics.forEach(m => { result[m] = db.prepare('SELECT * FROM events WHERE metric = ? AND ts > ? ORDER BY ts ASC').all(m, since); });
    return res.json(result);
  }
  res.json(db.prepare('SELECT * FROM events WHERE metric = ? AND ts > ? ORDER BY ts ASC').all(req.query.metric, since));
});
app.get('/api/events/recent', (req, res) => res.json(db.prepare('SELECT * FROM events ORDER BY ts DESC LIMIT 20').all()));
app.post('/api/events', (req, res) => {
  const { metric, value } = req.body;
  if (!metric || value === undefined) return res.status(400).json({ error: 'metric and value required' });
  const r = db.prepare('INSERT INTO events (metric,value,ts) VALUES (?,?,?)').run(metric, value, Date.now());
  res.json({ ok: true, id: r.lastInsertRowid });
});
app.listen(PORT, () => console.log('Analytics app on port ' + PORT));`;

  const analyticsHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Analytics Dashboard</title>
<style>* { margin:0; padding:0; box-sizing:border-box; } body { background:#0a0a0f; color:#e2e8f0; font-family:'Segoe UI',sans-serif; } .header { background:#111827; border-bottom:1px solid #1e293b; padding:1rem 1.5rem; display:flex; align-items:center; justify-content:space-between; } .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:1rem; padding:1rem 1.5rem; } .kpi-card { background:#111827; border-radius:10px; padding:1rem 1.25rem; border:1px solid #1e293b; position:relative; overflow:hidden; } .kpi-card::after { content:''; position:absolute; top:0; left:0; right:0; height:3px; } .kpi-pv::after { background:linear-gradient(90deg,#3b82f6,#60a5fa); } .kpi-rev::after { background:linear-gradient(90deg,#22c55e,#4ade80); } .kpi-su::after { background:linear-gradient(90deg,#a855f7,#c084fc); } .kpi-err::after { background:linear-gradient(90deg,#ef4444,#f87171); } .kpi-label { font-size:0.68rem; color:#64748b; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:0.5rem; } .kpi-value { font-size:2rem; font-weight:800; } .charts-grid { display:grid; grid-template-columns:2fr 1fr; gap:1rem; padding:0 1.5rem 1rem; } .chart-card { background:#111827; border-radius:10px; padding:1rem 1.25rem; border:1px solid #1e293b; } .chart-title { font-size:0.75rem; font-weight:600; color:#94a3b8; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:1rem; } .bar-chart { display:flex; align-items:flex-end; gap:2px; height:100px; } .bar { flex:1; border-radius:2px 2px 0 0; min-height:2px; } .event-log { background:#111827; border-radius:10px; padding:1rem 1.25rem; border:1px solid #1e293b; margin:0 1.5rem 1rem; } .event-row { display:flex; gap:0.75rem; align-items:center; padding:0.3rem 0; border-bottom:1px solid #1e293b22; font-size:0.75rem; } .em { padding:0.1rem 0.5rem; border-radius:10px; font-size:0.65rem; font-weight:700; text-transform:uppercase; } .em-pageviews { background:#1e3a5f; color:#60a5fa; } .em-revenue { background:#14532d30; color:#4ade80; } .em-signups { background:#2d1b69; color:#c084fc; } .em-errors { background:#7f1d1d22; color:#f87171; }</style>
</head>
<body>
<div class="header"><h1>Analytics Dashboard</h1><span id="last-upd" style="color:#64748b;font-size:0.75rem;">Live</span></div>
<div class="kpi-grid">
<div class="kpi-card kpi-pv"><div class="kpi-label">Pageviews Today</div><div class="kpi-value" id="kpi-pv" style="color:#3b82f6;">-</div></div>
<div class="kpi-card kpi-rev"><div class="kpi-label">Revenue Today</div><div class="kpi-value" id="kpi-rev" style="color:#22c55e;">-</div></div>
<div class="kpi-card kpi-su"><div class="kpi-label">New Signups</div><div class="kpi-value" id="kpi-su" style="color:#a855f7;">-</div></div>
<div class="kpi-card kpi-err"><div class="kpi-label">Errors</div><div class="kpi-value" id="kpi-err" style="color:#ef4444;">-</div></div>
</div>
<div class="charts-grid">
<div class="chart-card"><div class="chart-title">Pageviews Last 24h (hourly)</div><div class="bar-chart" id="pv-chart"></div><div style="display:flex;justify-content:space-between;font-size:0.62rem;color:#475569;margin-top:4px;"><span>24h ago</span><span>now</span></div></div>
<div class="chart-card"><div class="chart-title">7-Day Revenue Trend</div><div style="position:relative;height:100px;" id="rev-chart"></div></div>
</div>
<div class="event-log"><div style="font-size:0.75rem;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.75rem;">Real-time Events</div><div id="event-log"></div></div>
<script>
function fmtN(n){if(n>=1000000)return(n/1000000).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'k';return Math.round(n).toString();}
function fmtC(n){if(n>=1000)return'$'+(n/1000).toFixed(1)+'k';return'$'+Math.round(n);}
function fmtT(ts){const d=Date.now()-ts;if(d<60000)return Math.floor(d/1000)+'s ago';if(d<3600000)return Math.floor(d/60000)+'m ago';return Math.floor(d/3600000)+'h ago';}
function byHour(evs){const m={};evs.forEach(e=>{const h=Math.floor(e.ts/3600000)*3600000;m[h]=(m[h]||0)+e.value;});return Object.entries(m).sort((a,b)=>a[0]-b[0]).map(([ts,val])=>({ts:parseInt(ts),val}));}
function byDay(evs){const m={};evs.forEach(e=>{const d=Math.floor(e.ts/86400000)*86400000;m[d]=(m[d]||0)+e.value;});return Object.entries(m).sort((a,b)=>a[0]-b[0]).map(([ts,val])=>({ts:parseInt(ts),val}));}
async function fetchData(){
  try{
    const [m24,m7d,recent]=await Promise.all([fetch('/api/metrics?hours=24').then(r=>r.json()),fetch('/api/metrics?hours=168').then(r=>r.json()),fetch('/api/events/recent').then(r=>r.json())]);
    const sum=arr=>arr.reduce((s,e)=>s+e.value,0);
    document.getElementById('kpi-pv').textContent=fmtN(sum(m24.pageviews||[]));
    document.getElementById('kpi-rev').textContent=fmtC(sum(m24.revenue||[]));
    document.getElementById('kpi-su').textContent=fmtN(sum(m24.signups||[]));
    document.getElementById('kpi-err').textContent=fmtN(sum(m24.errors||[]));
    const pvH=byHour(m24.pageviews||[]);const maxPv=Math.max(...pvH.map(h=>h.val),1);
    document.getElementById('pv-chart').innerHTML=pvH.map(h=>'<div class="bar" style="height:'+Math.max(2,Math.round((h.val/maxPv)*96))+'px;background:linear-gradient(180deg,#3b82f6,#1d4ed8);" title="'+fmtN(h.val)+'"></div>').join('');
    const revD=byDay(m7d.revenue||[]).slice(-7);const maxR=Math.max(...revD.map(d=>d.val),1);
    const pts=revD.map((d,i)=>{const x=Math.round((i/(revD.length-1||1))*280);const y=Math.round(90-(d.val/maxR)*80);return x+','+y;}).join(' ');
    document.getElementById('rev-chart').innerHTML='<svg width="100%" height="100" viewBox="0 0 280 100" preserveAspectRatio="none"><polyline points="'+pts+'" fill="none" stroke="#22c55e" stroke-width="2.5"/>'+revD.map((d,i)=>{const x=Math.round((i/(revD.length-1||1))*280);const y=Math.round(90-(d.val/maxR)*80);return'<circle cx="'+x+'" cy="'+y+'" r="3" fill="#22c55e"/>';}).join('')+'</svg>';
    document.getElementById('event-log').innerHTML=recent.map(e=>'<div class="event-row"><span class="em em-'+e.metric+'">'+e.metric+'</span><span style="font-weight:700;">'+(e.metric==='revenue'?fmtC(e.value):fmtN(e.value))+'</span><span style="color:#475569;margin-left:auto;">'+fmtT(e.ts)+'</span></div>').join('');
    document.getElementById('last-upd').textContent='Updated: '+new Date().toLocaleTimeString();
  }catch(e){}
}
fetchData(); setInterval(fetchData,3000);
</script>
</body>
</html>`;

  return [
    {
      id: 'messaging',
      icon: '💬',
      name: 'Messaging',
      description: 'Real-time team chat with channels, message feed, and SQLite persistence.',
      stack: ['Express', 'SQLite', 'REST API'],
      npm_packages: ['express', 'better-sqlite3'],
      entry_point: 'server.js',
      files: [
        { path: 'server.js', content: messagingServer },
        { path: 'public/index.html', content: messagingHtml },
      ],
    },
    {
      id: 'ecommerce',
      icon: '🛒',
      name: 'E-Commerce',
      description: 'Product catalog, order management, revenue stats with filtering.',
      stack: ['Express', 'SQLite', 'REST API'],
      npm_packages: ['express', 'better-sqlite3'],
      entry_point: 'server.js',
      files: [
        { path: 'server.js', content: ecomServer },
        { path: 'public/index.html', content: ecomHtml },
      ],
    },
    {
      id: 'crm',
      icon: '📊',
      name: 'CRM',
      description: 'Kanban pipeline with contact cards, activity feed, and deal tracking.',
      stack: ['Express', 'SQLite', 'Pipeline'],
      npm_packages: ['express', 'better-sqlite3'],
      entry_point: 'server.js',
      files: [
        { path: 'server.js', content: crmServer },
        { path: 'public/index.html', content: crmHtml },
      ],
    },
    {
      id: 'erp',
      icon: '🏭',
      name: 'ERP',
      description: 'Enterprise resource planning with inventory, POs, and employee directory.',
      stack: ['Express', 'SQLite', 'Multi-tab'],
      npm_packages: ['express', 'better-sqlite3'],
      entry_point: 'server.js',
      files: [
        { path: 'server.js', content: erpServer },
        { path: 'public/index.html', content: erpHtml },
      ],
    },
    {
      id: 'support',
      icon: '🎧',
      name: 'Support / Call Center',
      description: 'Ticket queue sorted by priority, agent status, SLA countdown, thread view.',
      stack: ['Express', 'SQLite', 'Real-time'],
      npm_packages: ['express', 'better-sqlite3'],
      entry_point: 'server.js',
      files: [
        { path: 'server.js', content: supportServer },
        { path: 'public/index.html', content: supportHtml },
      ],
    },
    {
      id: 'analytics',
      icon: '📈',
      name: 'Analytics Dashboard',
      description: 'KPI cards, bar charts, line charts, real-time event log with auto-seeding.',
      stack: ['Express', 'SQLite', 'Charts'],
      npm_packages: ['express', 'better-sqlite3'],
      entry_point: 'server.js',
      files: [
        { path: 'server.js', content: analyticsServer },
        { path: 'public/index.html', content: analyticsHtml },
      ],
    },
  ];
}

const TEMPLATES = getTemplates();

function TemplateCard({ template, onDeployed, deployedInstances }) {
  const [status, setStatus] = useState('idle'); // idle | deploying | deployed | error
  const [error, setError] = useState('');
  const [deployedUrl, setDeployedUrl] = useState('');

  async function deploy() {
    setStatus('deploying');
    setError('');
    try {
      const r = await fetch('/api/sandbox/deploy-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: template.name,
          files: template.files,
          npm_packages: template.npm_packages,
          entry_point: template.entry_point,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setStatus('deployed');
        setDeployedUrl(d.sandbox.url);
        if (onDeployed) onDeployed(d.sandbox);
      } else {
        setStatus('error');
        setError(d.error || 'Deploy failed');
      }
    } catch (e) {
      setStatus('error');
      setError(e.message);
    }
  }

  const accentColors = {
    messaging: T.blue,
    ecommerce: T.mint,
    crm: T.orange,
    erp: T.purple,
    support: T.red,
    analytics: '#F59E0B',
  };
  const accent = accentColors[template.id] || T.blue;

  return (
    <div style={{
      background: T.card,
      borderRadius: '4px',
      padding: '1.25rem',
      boxShadow: T.shadow,
      border: `1px solid rgba(0,0,0,0.06)`,
      borderTop: `3px solid ${accent}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '0.6rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.8rem' }}>{template.icon}</span>
        <div>
          <div style={{ fontFamily: T.ui, fontSize: '1rem', fontWeight: 700, color: T.text }}>{template.name}</div>
          <div style={{ fontFamily: T.mono, fontSize: '0.68rem', color: T.muted, marginTop: '0.15rem' }}>
            {template.description}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
        {template.stack.map(s => (
          <span key={s} style={S.badge('rgba(0,0,0,0.06)')}>{s}</span>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
        {status === 'idle' && (
          <button style={{ ...S.btn, background: accent, color: '#0D0D0D' }} onClick={deploy}>
            Deploy
          </button>
        )}
        {status === 'deploying' && (
          <button style={{ ...S.btn, opacity: 0.7, cursor: 'not-allowed' }} disabled>
            Deploying...
          </button>
        )}
        {status === 'deployed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontFamily: T.mono, fontSize: '0.72rem', color: '#22c55e', fontWeight: 600 }}>Deployed</span>
            <a href={deployedUrl} target="_blank" rel="noreferrer"
              style={{ color: T.blue, fontFamily: T.mono, fontSize: '0.72rem', textDecoration: 'none' }}>
              {deployedUrl} ↗
            </a>
            <button style={{ ...S.btn, background: accent, color: '#0D0D0D', fontSize: '0.62rem', padding: '0.35rem 0.8rem' }} onClick={deploy}>
              Deploy Again
            </button>
          </div>
        )}
        {status === 'error' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontFamily: T.mono, fontSize: '0.72rem', color: T.red }}>Error: {error.slice(0, 60)}</span>
            <button style={{ ...S.btnGhost }} onClick={deploy}>Retry</button>
          </div>
        )}
      </div>

      {deployedInstances && deployedInstances.length > 0 && (
        <div style={{ borderTop: T.border, paddingTop: '0.6rem', marginTop: '0.2rem' }}>
          <div style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
            Deployed Instances
          </div>
          {deployedInstances.map(sb => (
            <div key={sb.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <a href={sb.url} target="_blank" rel="noreferrer"
                style={{ color: T.blue, fontFamily: T.mono, fontSize: '0.7rem', textDecoration: 'none' }}>
                {sb.url}
              </a>
              <span style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.muted }}>{sb.id}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppTemplatesTab() {
  const [deployedByTemplate, setDeployedByTemplate] = useState({});

  function handleDeployed(templateId, sandbox) {
    setDeployedByTemplate(prev => ({
      ...prev,
      [templateId]: [...(prev[templateId] || []), sandbox],
    }));
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontFamily: T.mono, fontSize: '0.62rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '0.4rem' }}>
          App Templates
        </div>
        <div style={{ fontFamily: T.ui, fontSize: '0.88rem', color: T.text }}>
          Deploy pre-built full-stack applications to sandboxes in one click.
          Each template includes a Node.js backend with SQLite, seeded data, and a live UI.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
        {TEMPLATES.map(template => (
          <TemplateCard
            key={template.id}
            template={template}
            onDeployed={(sb) => handleDeployed(template.id, sb)}
            deployedInstances={deployedByTemplate[template.id] || []}
          />
        ))}
      </div>
    </div>
  );
}
