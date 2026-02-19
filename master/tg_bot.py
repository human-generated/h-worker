import asyncio, json, urllib.request, os, subprocess
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

MASTER_URL = 'http://localhost:3000'
BOT_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        'H Worker Master\n'
        '/status — worker status\n'
        '/workers — list workers with VNC links\n'
        '/task <desc> — assign task to next free worker\n'
        '/redeploy — redeploy Vercel dashboard'
    )

async def status_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    data = json.loads(urllib.request.urlopen(f'{MASTER_URL}/status').read())
    workers = data.get('workers', {})
    tasks = data.get('tasks', [])
    lines = ['*Workers:*']
    for w in workers.values():
        lines.append(f"  {w['id']}: {w['status']} — {w.get('task','idle')}")
    done = sum(1 for t in tasks if t['status']=='done')
    pending = sum(1 for t in tasks if t['status']=='pending')
    assigned = sum(1 for t in tasks if t['status']=='assigned')
    lines.append(f'\n*Tasks:* done={done} assigned={assigned} pending={pending}')
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')

async def workers_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    data = json.loads(urllib.request.urlopen(f'{MASTER_URL}/status').read())
    workers = data.get('workers', {})
    if not workers:
        await update.message.reply_text('No workers connected yet.')
        return
    lines = []
    for w in workers.values():
        vnc = f"http://{w.get('ip','')}:6080" if w.get('vnc_port') else 'no VNC'
        lines.append(f"*{w['id']}* ({w.get('ip','')})\n  Status: {w['status']}\n  Desktop: {vnc}")
    await update.message.reply_text('\n\n'.join(lines), parse_mode='Markdown')

async def task_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    desc = ' '.join(ctx.args)
    if not desc:
        await update.message.reply_text('Usage: /task <description>')
        return
    body = json.dumps({'description': desc}).encode()
    req = urllib.request.Request(f'{MASTER_URL}/task', data=body, headers={'Content-Type':'application/json'}, method='POST')
    resp = json.loads(urllib.request.urlopen(req).read())
    await update.message.reply_text(f"Task queued: {resp['task']['id']}\n{desc}")

async def redeploy_cmd(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text('Triggering Vercel dashboard redeploy...')
    req = urllib.request.Request(f'{MASTER_URL}/deploy/dashboard', data=b'{}', headers={'Content-Type':'application/json'}, method='POST')
    urllib.request.urlopen(req)
    await update.message.reply_text('Deploy started. Check https://hw-dashboard.vercel.app in ~1 min.')

app = ApplicationBuilder().token(BOT_TOKEN).build()
app.add_handler(CommandHandler('start', start))
app.add_handler(CommandHandler('status', status_cmd))
app.add_handler(CommandHandler('workers', workers_cmd))
app.add_handler(CommandHandler('task', task_cmd))
app.add_handler(CommandHandler('redeploy', redeploy_cmd))
app.run_polling()
