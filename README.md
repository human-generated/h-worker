# H Worker

Multi-agent worker fleet: 1 master + N OpenClaw/Claude workers on DigitalOcean, with Claude-powered task orchestration, Telegram coordination, and a Vercel dashboard.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Vercel Dashboard  (hw-dashboard.vercel.app)            │
│  Workers · Tasks · State Machine · Skills · NFS         │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│  Master  (159.65.205.244)  :3000                        │
│  server.js     — task queue, worker registry, NFS API   │
│  orchestrator.js — Claude-powered planner (Haiku)       │
│  /mnt/shared   — NFS volume shared with all workers     │
└────┬──────────────┬──────────────┬──────────────┬───────┘
     │ NFS + tasks  │              │              │
┌────▼──┐      ┌────▼──┐     ┌────▼──┐      ┌────▼──┐
│ w-1   │      │ w-2   │     │ w-3   │      │ w-4   │
│OpenClaw│     │OpenClaw│    │OpenClaw│     │OpenClaw│
│XFCE   │      │XFCE   │     │XFCE   │      │XFCE   │
│:6080  │      │:6080  │     │:6080  │      │:6080  │
└───────┘      └───────┘     └───────┘      └───────┘
```

Each worker runs: OpenClaw (AI gateway) · XFCE4 desktop · Xvfb · x11vnc · noVNC :6080 · hw-supervisor

## Repo Structure

```
deploy.sh                  — provision any droplet (worker or master)
master/
  server.js                — Express API: tasks, workers, NFS, skills
  orchestrator.js          — Claude Haiku task planner
scripts/
  claude_supervisor.sh     — Worker: heartbeat + task execution
dashboard/
  app/                     — Next.js 14 dashboard (Vercel)
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

## Deploying a new worker

```bash
# 1. Create Ubuntu 22.04 droplet on DigitalOcean, attach shared NFS volume
# 2. SSH in as root and run:
curl -fsSL https://raw.githubusercontent.com/human-generated/h-worker/main/deploy.sh | bash -s -- \
  worker \
  hw-worker-5 \
  159.65.205.244 \
  -5166727984 \
  "BOT_TOKEN" \
  "sk-ant-..." \
  "10.110.0.2:/33522846/743ca995-39f8-4f2e-ac0f-0759278f1dd4 /mnt/shared"
```

## Deploying the master

```bash
curl -fsSL https://raw.githubusercontent.com/human-generated/h-worker/main/deploy.sh | bash -s -- \
  master \
  "vcp_..." \
  blckchnhmns \
  "sk-ant-..." \
  "10.110.0.2:/33522846/743ca995-39f8-4f2e-ac0f-0759278f1dd4 /mnt/shared"
```

## Submitting a task

```bash
# Tasks start as 'queued' — the orchestrator plans and assigns them automatically
curl -X POST http://159.65.205.244:3000/task \
  -H 'Content-Type: application/json' \
  -d '{"title":"My Task","type":"render","description":"...","extra":{}}'
```

## Task lifecycle

```
queued → planning → assigning → [task-specific states] → done
                                                       ↘ failed
                                                       ↘ cancelled
```

States are freeform strings reported by worker scripts (e.g. `installing_chromium → capturing_frames → encoding_video`).

## Re-deploy dashboard

```bash
curl -X POST http://159.65.205.244:3000/deploy/dashboard
```

## NFS Storage
Shared state at: `10.110.0.2:/33522846/743ca995-39f8-4f2e-ac0f-0759278f1dd4`
Mounted at `/mnt/shared` on all nodes. State file: `/mnt/shared/hw_state.json`
