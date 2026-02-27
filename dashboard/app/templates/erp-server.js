const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8100;
const db = new Database('/tmp/erp-' + PORT + '.db');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT, name TEXT, category TEXT, qty INTEGER, reorder_point INTEGER, cost REAL
  );
  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor TEXT, status TEXT, total REAL, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, dept TEXT, role TEXT, salary REAL
  );
`);

const ic = db.prepare('SELECT COUNT(*) as c FROM inventory').get();
if (ic.c === 0) {
  const ii = db.prepare('INSERT INTO inventory (sku,name,category,qty,reorder_point,cost) VALUES (?,?,?,?,?,?)');
  const ipo = db.prepare('INSERT INTO purchase_orders (vendor,status,total,created_at) VALUES (?,?,?,?)');
  const ie = db.prepare('INSERT INTO employees (name,dept,role,salary) VALUES (?,?,?,?)');

  const items = [
    ['INV-001','MacBook Pro 16"','Electronics',12,5,1800],
    ['INV-002','Dell XPS 15','Electronics',8,3,1200],
    ['INV-003','Office Chairs','Furniture',45,10,250],
    ['INV-004','Standing Desks','Furniture',18,5,600],
    ['INV-005','A4 Paper Reams','Office Supplies',200,50,8],
    ['INV-006','Printer Ink Black','Office Supplies',35,15,25],
    ['INV-007','USB-C Hubs','Electronics',60,20,45],
    ['INV-008','Monitor 27"','Electronics',15,4,350],
    ['INV-009','Whiteboards','Furniture',8,2,120],
    ['INV-010','Ethernet Cables','Networking',90,30,12],
    ['INV-011','Wireless Mice','Electronics',55,20,35],
    ['INV-012','Keyboards','Electronics',50,20,80],
    ['INV-013','Laptop Stands','Accessories',40,15,55],
    ['INV-014','Headsets','Electronics',22,8,150],
    ['INV-015','Coffee Pods','Consumables',300,100,1],
  ];
  items.forEach(i => ii.run(...i));

  const now = Date.now();
  ipo.run('TechCorp Supplies', 'delivered', 15600, now - 864000000);
  ipo.run('Office World', 'approved', 4200, now - 432000000);
  ipo.run('Global Furniture Co', 'pending', 8800, now - 86400000);
  ipo.run('NetGear Distribution', 'approved', 3600, now - 43200000);
  ipo.run('Coffee Direct', 'delivered', 900, now - 172800000);

  ie.run('Emma Thompson', 'Engineering', 'Senior Engineer', 145000);
  ie.run('James Wilson', 'Engineering', 'Lead Developer', 165000);
  ie.run('Sofia Rodriguez', 'Product', 'Product Manager', 135000);
  ie.run('Liam Chen', 'Design', 'UI/UX Designer', 115000);
  ie.run('Olivia Brown', 'Marketing', 'Marketing Manager', 110000);
  ie.run('Noah Davis', 'Sales', 'Sales Director', 155000);
  ie.run('Ava Martinez', 'Engineering', 'DevOps Engineer', 140000);
  ie.run('William Taylor', 'Finance', 'CFO', 195000);
  ie.run('Isabella Anderson', 'HR', 'HR Manager', 100000);
  ie.run('Benjamin Garcia', 'Sales', 'Account Executive', 90000);
  ie.run('Mia Jackson', 'Engineering', 'Frontend Developer', 120000);
  ie.run('Ethan White', 'Operations', 'COO', 210000);
}

app.get('/api/inventory', (req, res) => {
  res.json(db.prepare('SELECT * FROM inventory ORDER BY qty ASC').all());
});

app.put('/api/inventory/:id', (req, res) => {
  const { qty } = req.body;
  if (qty === undefined) return res.status(400).json({ error: 'qty required' });
  db.prepare('UPDATE inventory SET qty = ? WHERE id = ?').run(qty, req.params.id);
  res.json({ ok: true });
});

app.get('/api/purchase-orders', (req, res) => {
  res.json(db.prepare('SELECT * FROM purchase_orders ORDER BY created_at DESC').all());
});

app.get('/api/employees', (req, res) => {
  const { dept } = req.query;
  const rows = dept
    ? db.prepare('SELECT * FROM employees WHERE dept = ? ORDER BY salary DESC').all(dept)
    : db.prepare('SELECT * FROM employees ORDER BY salary DESC').all();
  res.json(rows);
});

app.listen(PORT, () => console.log('ERP app on port ' + PORT));
