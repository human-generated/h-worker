# H Worker

Multi-agent worker system: 1 master + 4 OpenClaw/Claude workers on DigitalOcean, with Telegram bot management and a Vercel dashboard.

## Architecture

```
Telegram (@h_worker_1_bot)
        │
        ▼
   hw-master (159.65.205.244)
   ├── Master API :3000
   ├── Task queue (NFS-backed)
   └── Vercel deploy trigger
        │
        ├── hw-worker-1 (164.90.197.224)
        ├── hw-worker-2 (167.99.222.95)
        ├── hw-worker-3 (178.128.247.39)
        └── hw-worker-4 (142.93.131.96)
             Each worker runs:
             ├── OpenClaw (Telegram AI gateway)
             ├── Claude supervisor (auto-restart + heartbeat)
             ├── Xvfb + x11vnc (virtual desktop)
             └── noVNC :6080 (web desktop stream)
```

## Shared Telegram Group
**H Worker Network**: https://t.me/+0muzguuZfC40ZDY8
Workers post status updates here. All `h_worker_*_bot`s are members with privacy mode disabled.

## Dashboard
**https://hw-dashboard.vercel.app** — live worker status, task assignment, desktop links.

## Master Bot Commands (@h_worker_1_bot)
- `/status` — worker statuses + task counts
- `/workers` — list all workers with VNC desktop links
- `/task <description>` — queue a task for next free worker
- `/redeploy` — redeploy the Vercel dashboard from master

## Desktop Streams (noVNC)
- Worker 1: http://164.90.197.224:6080
- Worker 2: http://167.99.222.95:6080
- Worker 3: http://178.128.247.39:6080
- Worker 4: http://142.93.131.96:6080

## Secrets (store in /home/bot/.openclaw-secrets)
```
ANTHROPIC_API_KEY=...
TELEGRAM_BOT_TOKEN=...   # h_worker_1_bot token
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
TELEGRAM_API_ID=...
TELEGRAM_API_HASH=...
```

## Re-deploy
```bash
# Full redeploy from scratch
bash master/setup.sh          # on hw-master
bash worker/setup.sh <id> <master-ip>   # on each worker

# Dashboard (from master)
curl -X POST http://159.65.205.244:3000/deploy/dashboard
# or via Telegram: /redeploy
```

## NFS Storage
Shared state at: `10.110.0.2:/33522846/743ca995-39f8-4f2e-ac0f-0759278f1dd4`
Mounted at `/mnt/shared` on all nodes. State file: `/mnt/shared/hw_state.json`
