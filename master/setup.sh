#!/bin/bash
set -e

export DEBIAN_FRONTEND=noninteractive

# Base packages
apt-get update -qq
apt-get install -y -qq nfs-common nodejs npm python3-pip python3-venv redis-server nginx curl git jq

# NFS mount
mkdir -p /mnt/shared
echo "10.110.0.2:/33522846/743ca995-39f8-4f2e-ac0f-0759278f1dd4 /mnt/shared nfs defaults,_netdev 0 0" >> /etc/fstab
mount /mnt/shared || echo "NFS mount failed (continuing)"

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Master API — task queue server
mkdir -p /opt/hw-master
cat > /opt/hw-master/server.js << 'SERVEREOF'
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
SERVEREOF

cd /opt/hw-master && npm init -y && npm install express

# Systemd service for master API
cat > /etc/systemd/system/hw-master.service << 'SVCEOF'
[Unit]
Description=H Worker Master API
After=network.target redis.service

[Service]
ExecStart=/usr/bin/node /opt/hw-master/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable hw-master
systemctl start hw-master

# Telegram bot for task management
pip3 install python-telegram-bot --break-system-packages -q

cat > /opt/hw-master/tg_bot.py << 'BOTEOF'
import asyncio, json, urllib.request, os
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

MASTER_URL = "http://localhost:3000"
BOT_TOKEN = os.environ["TELEGRAM_BOT_TOKEN"]

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("H Worker Master Bot\n/status - worker status\n/task <description> - assign task\n/workers - list workers")

async def status_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    data = json.loads(urllib.request.urlopen(f"{MASTER_URL}/status").read())
    workers = data.get("workers", {})
    tasks = data.get("tasks", [])
    lines = ["*Workers:*"]
    for w in workers.values():
        age = w.get("updated_at","")[:19]
        lines.append(f"  {w['id']}: {w['status']} — {w.get('task','idle')} ({age})")
    lines.append(f"\n*Tasks:* {len(tasks)} total")
    done = sum(1 for t in tasks if t['status']=='done')
    pending = sum(1 for t in tasks if t['status']=='pending')
    assigned = sum(1 for t in tasks if t['status']=='assigned')
    lines.append(f"  done={done} assigned={assigned} pending={pending}")
    await update.message.reply_text("\n".join(lines), parse_mode="Markdown")

async def task_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    desc = " ".join(ctx.args)
    if not desc:
        await update.message.reply_text("Usage: /task <description>")
        return
    body = json.dumps({"description": desc}).encode()
    req = urllib.request.Request(f"{MASTER_URL}/task", data=body, headers={"Content-Type":"application/json"}, method="POST")
    resp = json.loads(urllib.request.urlopen(req).read())
    await update.message.reply_text(f"Task created: {resp['task']['id']}\n{desc}")

async def workers_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    data = json.loads(urllib.request.urlopen(f"{MASTER_URL}/status").read())
    workers = data.get("workers", {})
    if not workers:
        await update.message.reply_text("No workers registered yet.")
        return
    lines = []
    for w in workers.values():
        vnc = f"http://{w.get('ip','')}:6080" if w.get('vnc_port') else "no VNC"
        lines.append(f"*{w['id']}* ({w.get('ip','')})\n  Status: {w['status']}\n  VNC: {vnc}")
    await update.message.reply_text("\n\n".join(lines), parse_mode="Markdown")

app = ApplicationBuilder().token(BOT_TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.add_handler(CommandHandler("status", status_cmd))
app.add_handler(CommandHandler("task", task_cmd))
app.add_handler(CommandHandler("workers", workers_cmd))
app.run_polling()
BOTEOF

cat > /etc/systemd/system/hw-tgbot.service << TGSVC
[Unit]
Description=H Worker Telegram Bot
After=network.target hw-master.service

[Service]
ExecStart=/usr/bin/python3 /opt/hw-master/tg_bot.py
Restart=always
RestartSec=5
Environment=TELEGRAM_BOT_TOKEN=8386044481:AAGGJAQ4Ns5lolNszuXAXZ-Fdp19v9QcKU4

[Install]
WantedBy=multi-user.target
TGSVC

systemctl daemon-reload
systemctl enable hw-tgbot
systemctl start hw-tgbot

echo "=== MASTER SETUP DONE ==="
systemctl status hw-master --no-pager | tail -3
systemctl status hw-tgbot --no-pager | tail -3
