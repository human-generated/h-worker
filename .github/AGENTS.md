# Agent Access Guide

This repo contains all infrastructure code for the H Worker system.

## Key files
- `master/server.js` — Master API (task queue, worker heartbeat, /deploy/dashboard)
- `master/tg_bot.py` — Telegram bot for master (@h_worker_1_bot)
- `master/setup.sh` — Full master provisioning script
- `worker/supervisor.sh` — Claude supervisor (runs on each worker, heartbeat + restart)
- `worker/setup.sh` — Full worker provisioning script
- `dashboard/` — Next.js Vercel dashboard

## Credentials
All secrets in `/home/bot/.openclaw-secrets`. GitHub token in standard git config.

## DigitalOcean API
Token: stored in secrets. Region: ams3. Droplet type: s-2vcpu-2gb.

## Adding a new worker
1. Create droplet via DO API (see master/setup.sh for pattern)
2. Run `bash worker/setup.sh hw-worker-N 159.65.205.244` on it
3. Worker auto-registers with master via heartbeat
