const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/ecom-' + PORT + '.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, category TEXT, price REAL, stock INTEGER, image_url TEXT
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer TEXT, total REAL, status TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER, product_id INTEGER, qty INTEGER, price REAL
  );
`);

const pCount = db.prepare('SELECT COUNT(*) as c FROM products').get();
if (pCount.c === 0) {
  const ip = db.prepare('INSERT INTO products (name,category,price,stock,image_url) VALUES (?,?,?,?,?)');
  ip.run('MacBook Pro 16"','Electronics',2499.99,15,'https://via.placeholder.com/200x150/1e293b/3b82f6?text=MacBook');
  ip.run('Sony WH-1000XM5','Electronics',349.99,42,'https://via.placeholder.com/200x150/1e293b/22c55e?text=Headphones');
  ip.run('iPad Air','Electronics',749.99,28,'https://via.placeholder.com/200x150/1e293b/f59e0b?text=iPad');
  ip.run('Samsung 4K Monitor','Electronics',599.99,19,'https://via.placeholder.com/200x150/1e293b/ef4444?text=Monitor');
  ip.run('Nike Air Max 270','Clothing',129.99,56,'https://via.placeholder.com/200x150/1e293b/a855f7?text=Shoes');
  ip.run('Levi 501 Jeans','Clothing',79.99,88,'https://via.placeholder.com/200x150/1e293b/06b6d4?text=Jeans');
  ip.run('North Face Jacket','Clothing',299.99,31,'https://via.placeholder.com/200x150/1e293b/3b82f6?text=Jacket');
  ip.run('Adidas Running Shirt','Clothing',49.99,120,'https://via.placeholder.com/200x150/1e293b/22c55e?text=Shirt');
  ip.run('Atomic Habits','Books',14.99,200,'https://via.placeholder.com/200x150/1e293b/f59e0b?text=Book1');
  ip.run('Deep Work','Books',16.99,150,'https://via.placeholder.com/200x150/1e293b/ef4444?text=Book2');
  ip.run('The Lean Startup','Books',13.99,175,'https://via.placeholder.com/200x150/1e293b/a855f7?text=Book3');
  ip.run('Clean Code','Books',39.99,90,'https://via.placeholder.com/200x150/1e293b/06b6d4?text=Book4');

  const io = db.prepare('INSERT INTO orders (customer,total,status,created_at) VALUES (?,?,?,?)');
  const ii = db.prepare('INSERT INTO order_items (order_id,product_id,qty,price) VALUES (?,?,?,?)');
  const now = Date.now();
  const orders = [
    {c:'Alice Chen',t:2849.98,s:'delivered',at:now-864000000,items:[[1,1,2499.99],[2,1,349.99]]},
    {c:'Bob Martinez',t:749.99,s:'shipped',at:now-432000000,items:[[3,1,749.99]]},
    {c:'Carol White',t:209.98,s:'processing',at:now-86400000,items:[[5,1,129.99],[9,1,14.99],[10,1,16.99],[11,1,13.99]]},
    {c:'Dave Kim',t:599.99,s:'pending',at:now-43200000,items:[[4,1,599.99]]},
    {c:'Eve Johnson',t:349.97,s:'delivered',at:now-172800000,items:[[6,1,79.99],[7,1,299.99]]},
    {c:'Frank Liu',t:129.97,s:'shipped',at:now-21600000,items:[[8,1,49.99],[9,1,14.99],[10,1,16.99],[11,1,13.99]]},
  ];
  orders.forEach(o => {
    const r = io.run(o.c,o.t,o.s,o.at);
    o.items.forEach(([pid,qty,price]) => ii.run(r.lastInsertRowid,pid,qty,price));
  });
}

app.get('/api/products', (req, res) => {
  const { category } = req.query;
  const rows = category
    ? db.prepare('SELECT * FROM products WHERE category = ?').all(category)
    : db.prepare('SELECT * FROM products').all();
  res.json(rows);
});

app.get('/api/orders', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json(orders);
});

app.post('/api/orders', (req, res) => {
  const { customer, total, status, items } = req.body;
  if (!customer) return res.status(400).json({ error: 'customer required' });
  const r = db.prepare('INSERT INTO orders (customer,total,status,created_at) VALUES (?,?,?,?)').run(customer, total || 0, status || 'pending', Date.now());
  if (items && Array.isArray(items)) {
    const ii = db.prepare('INSERT INTO order_items (order_id,product_id,qty,price) VALUES (?,?,?,?)');
    items.forEach(item => {
      const p = db.prepare('SELECT price FROM products WHERE id = ?').get(item.product_id);
      ii.run(r.lastInsertRowid, item.product_id, item.qty || 1, p ? p.price : 0);
    });
  }
  res.json({ ok: true, id: r.lastInsertRowid });
});

app.listen(PORT, () => console.log('E-Commerce app on port ' + PORT));
