#!/bin/bash
# =============================================================================
# H-Worker Fleet Deployment Script
# =============================================================================
# Provisions a DigitalOcean Ubuntu 22.04 droplet as either a worker or master.
#
# USAGE
#   Worker:  ./deploy.sh worker  <WORKER_ID> <MASTER_IP> <TG_CHAT> <TG_TOKEN> <ANTHROPIC_KEY> [NFS_MOUNT]
#   Master:  ./deploy.sh master  <VERCEL_TOKEN> <VERCEL_SCOPE> <ANTHROPIC_KEY> [NFS_MOUNT]
#
# EXAMPLES
#   ./deploy.sh worker hw-worker-5 159.65.205.244 -5166727984 "8202...:AAF..." "sk-ant-..."
#   ./deploy.sh master "vcp_8L3sv4x..." blckchnhmns "sk-ant-..."
#
# NOTES
#   - Run as root on a fresh Ubuntu 22.04 LTS droplet
#   - NFS_MOUNT format: "server:/path /mnt/shared"  (default: skip NFS setup)
#   - After running, configure the DO Block Storage volume manually and re-run
#     setup_nfs() if needed
# =============================================================================
set -euo pipefail

ROLE="${1:-}"
if [[ "$ROLE" != "worker" && "$ROLE" != "master" ]]; then
  echo "Usage: $0 [worker|master] ..."
  exit 1
fi

# ── Colour helpers ────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${G}[deploy]${NC} $*"; }
warn() { echo -e "${Y}[warn]${NC} $*"; }
die()  { echo -e "${R}[error]${NC} $*"; exit 1; }

# ── Arg parsing ───────────────────────────────────────────────────────────────
if [[ "$ROLE" == "worker" ]]; then
  WORKER_ID="${2:-hw-worker-1}"
  MASTER_IP="${3:-}"
  TG_CHAT="${4:-}"
  TG_TOKEN="${5:-}"
  ANTHROPIC_KEY="${6:-}"
  NFS_MOUNT="${7:-}"
  [[ -z "$MASTER_IP"     ]] && die "MASTER_IP required"
  [[ -z "$TG_CHAT"       ]] && die "TG_CHAT required"
  [[ -z "$TG_TOKEN"      ]] && die "TG_TOKEN required"
  [[ -z "$ANTHROPIC_KEY" ]] && die "ANTHROPIC_KEY required"
else
  VERCEL_TOKEN="${2:-}"
  VERCEL_SCOPE="${3:-}"
  ANTHROPIC_KEY="${4:-}"
  NFS_MOUNT="${5:-}"
  [[ -z "$VERCEL_TOKEN"  ]] && die "VERCEL_TOKEN required"
  [[ -z "$VERCEL_SCOPE"  ]] && die "VERCEL_SCOPE required"
fi

# =============================================================================
# COMMON SETUP (both roles)
# =============================================================================

install_base() {
  log "Updating apt and installing base packages..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq \
    curl wget git htop jq unzip \
    nfs-common \
    build-essential \
    imagemagick \
    2>/dev/null
  log "Base packages installed."
}

install_nodejs() {
  if command -v node &>/dev/null && [[ "$(node --version)" == v22* ]]; then
    log "Node.js 22 already installed ($(node --version))."
    return
  fi
  log "Installing Node.js 22 via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>/dev/null
  apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed."
}

setup_nfs() {
  if [[ -z "$NFS_MOUNT" ]]; then
    warn "NFS_MOUNT not specified — skipping NFS setup."
    warn "  Format: \"10.x.x.x:/path /mnt/shared\""
    mkdir -p /mnt/shared
    return
  fi
  NFS_SERVER=$(echo "$NFS_MOUNT" | awk '{print $1}')
  NFS_LOCAL=$(echo  "$NFS_MOUNT" | awk '{print $2}')
  mkdir -p "$NFS_LOCAL"

  # Remove duplicate fstab entries if any
  sed -i "\|${NFS_LOCAL}|d" /etc/fstab
  echo "${NFS_SERVER} ${NFS_LOCAL} nfs defaults,_netdev 0 0" >> /etc/fstab

  mount -a 2>/dev/null || warn "NFS mount failed — check NFS_MOUNT and server accessibility"
  if mountpoint -q "$NFS_LOCAL"; then
    log "NFS mounted: ${NFS_SERVER} → ${NFS_LOCAL}"
  else
    warn "NFS not mounted. You may need to set it up manually."
  fi
}

# =============================================================================
# WORKER SETUP
# =============================================================================

install_desktop() {
  log "Installing XFCE4 desktop environment..."
  apt-get install -y -qq \
    xfce4 xfce4-goodies \
    xvfb x11vnc \
    tightvncserver \
    novnc websockify \
    dbus-x11 \
    2>/dev/null
  log "Desktop packages installed."
}

install_openclaw() {
  if command -v openclaw &>/dev/null; then
    log "OpenClaw already installed ($(openclaw --version 2>/dev/null || echo 'unknown version'))."
    return
  fi
  log "Installing OpenClaw via npm..."
  npm install -g openclaw 2>&1 | tail -3
  command -v openclaw &>/dev/null || die "openclaw install failed"
  log "OpenClaw installed at $(which openclaw)"
}

setup_worker_services() {
  log "Writing systemd service files for worker..."

  # ── Xvfb virtual display ──────────────────────────────────────────────────
  cat > /etc/systemd/system/xvfb.service << 'EOF'
[Unit]
Description=Xvfb Virtual Display
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :1 -screen 0 1280x800x24 -ac
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

  # ── XFCE4 desktop on virtual display ─────────────────────────────────────
  cat > /etc/systemd/system/xfce-desktop.service << 'EOF'
[Unit]
Description=XFCE4 Desktop
After=xvfb.service
Requires=xvfb.service

[Service]
Type=simple
Environment=DISPLAY=:1
Environment=HOME=/root
Environment=XDG_RUNTIME_DIR=/run/user/0
ExecStartPre=/bin/sleep 3
ExecStart=/usr/bin/dbus-launch --exit-with-session /usr/bin/startxfce4
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  # ── x11vnc VNC server ─────────────────────────────────────────────────────
  cat > /etc/systemd/system/x11vnc.service << 'EOF'
[Unit]
Description=x11vnc VNC Server
After=xvfb.service

[Service]
ExecStart=/usr/bin/x11vnc -display :1 -nopw -listen 0.0.0.0 -xkb -forever -shared
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  # ── noVNC index.html (auto-connect redirect) ─────────────────────────────
  cat > /usr/share/novnc/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html>
<head>
  <meta http-equiv='refresh' content='0; url=/vnc.html?autoconnect=true&resize=scale&reconnect=true'>
  <title>H Worker Desktop</title>
</head>
<body style='background:#0f172a;color:#38bdf8;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>
  Connecting to desktop...
</body>
</html>
HTMLEOF

  # ── noVNC web proxy (port 6080) ───────────────────────────────────────────
  cat > /etc/systemd/system/novnc.service << 'EOF'
[Unit]
Description=noVNC Web Interface
After=x11vnc.service

[Service]
ExecStart=/usr/share/novnc/utils/novnc_proxy --listen 6080 --vnc localhost:5900
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  # ── OpenClaw AI agent ─────────────────────────────────────────────────────
  cat > /etc/systemd/system/openclaw.service << EOF
[Unit]
Description=OpenClaw Worker
After=network.target xvfb.service

[Service]
ExecStart=/usr/bin/openclaw gateway
Environment=ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
Environment=TELEGRAM_BOT_TOKEN=${TG_TOKEN}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

  # ── Screenshot timer (for VNC preview in dashboard) ──────────────────────
  cat > /usr/local/bin/take_screenshot.sh << 'EOF'
#!/bin/bash
DISPLAY=:1 import -window root -quality 75 /usr/share/novnc/screenshot.jpg 2>/dev/null
EOF
  chmod +x /usr/local/bin/take_screenshot.sh

  cat > /etc/systemd/system/screenshot.service << 'EOF'
[Unit]
Description=Take VNC screenshot

[Service]
Type=oneshot
ExecStart=/usr/local/bin/take_screenshot.sh
EOF

  cat > /etc/systemd/system/screenshot.timer << 'EOF'
[Unit]
Description=Screenshot every 15s

[Timer]
OnBootSec=10
OnUnitActiveSec=15

[Install]
WantedBy=timers.target
EOF

  # ── H-Worker supervisor ───────────────────────────────────────────────────
  cat > /etc/systemd/system/hw-supervisor.service << EOF
[Unit]
Description=Claude Supervisor for OpenClaw
After=openclaw.service

[Service]
ExecStart=/opt/claude_supervisor.sh ${WORKER_ID} ${MASTER_IP} ${TG_CHAT} ${TG_TOKEN}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable xvfb xfce-desktop x11vnc novnc openclaw screenshot.timer hw-supervisor
  log "Systemd services installed and enabled."
}

setup_worker_skills() {
  log "Installing worker skills..."
  mkdir -p /opt/skills
  cat > /opt/skills/code_execute.json  << 'EOF'
{"name":"Code Execute","creator":"openclaw","desc":"Run scripts and terminal commands"}
EOF
  cat > /opt/skills/computer_control.json << 'EOF'
{"name":"Computer Control","creator":"openclaw","desc":"Control mouse, keyboard and GUI applications"}
EOF
  cat > /opt/skills/file_manager.json << 'EOF'
{"name":"File Manager","creator":"openclaw","desc":"Browse, read and write files on the filesystem"}
EOF
  cat > /opt/skills/web_browse.json << 'EOF'
{"name":"Web Browse","creator":"openclaw","desc":"Browse websites and extract information"}
EOF
  cat > /opt/skills/supervisor.json << 'EOF'
{"name":"Supervisor","creator":"openclaw","desc":"Monitor and restart system services"}
EOF
  log "Skills installed in /opt/skills/"
}

install_supervisor_script() {
  log "Installing hw-supervisor script..."
  # Copy from NFS if available, else use embedded version
  if [[ -f /mnt/shared/scripts/claude_supervisor.sh ]]; then
    cp /mnt/shared/scripts/claude_supervisor.sh /opt/claude_supervisor.sh
  else
    # Embedded fallback — identical to the version in this repo
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$SCRIPT_DIR/scripts/claude_supervisor.sh" ]]; then
      cp "$SCRIPT_DIR/scripts/claude_supervisor.sh" /opt/claude_supervisor.sh
    else
      die "claude_supervisor.sh not found. Place it at scripts/claude_supervisor.sh in this repo."
    fi
  fi
  chmod +x /opt/claude_supervisor.sh
  log "Supervisor script installed at /opt/claude_supervisor.sh"
}

setup_vnc_xstartup() {
  mkdir -p /root/.vnc
  cat > /root/.vnc/xstartup << 'EOF'
#!/bin/bash
xrdb $HOME/.Xresources
startxfce4 &
EOF
  chmod +x /root/.vnc/xstartup
}

# =============================================================================
# MASTER SETUP
# =============================================================================

install_vercel() {
  if command -v vercel &>/dev/null; then
    log "Vercel CLI already installed."
    return
  fi
  log "Installing Vercel CLI..."
  npm install -g vercel 2>&1 | tail -3
  log "Vercel CLI installed."
}

setup_master_files() {
  log "Installing master API files..."
  mkdir -p /opt/hw-master
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # server.js
  if [[ -f "$SCRIPT_DIR/master/server.js" ]]; then
    cp "$SCRIPT_DIR/master/server.js" /opt/hw-master/server.js
  else
    die "master/server.js not found in repo"
  fi

  # orchestrator.js
  if [[ -f "$SCRIPT_DIR/master/orchestrator.js" ]]; then
    cp "$SCRIPT_DIR/master/orchestrator.js" /opt/hw-master/orchestrator.js
  else
    die "master/orchestrator.js not found in repo"
  fi

  # Install npm dependencies for master
  cd /opt/hw-master
  npm install --save express 2>&1 | tail -3

  # Anthropic key
  echo "{\"key\":\"${ANTHROPIC_KEY}\"}" > /opt/hw-master/anthropic_key.json
  # Empty linear token placeholder
  echo '{"token":null}' > /opt/hw-master/linear_token.json

  log "Master files installed in /opt/hw-master/"
}

setup_master_services() {
  log "Writing systemd service files for master..."

  cat > /etc/systemd/system/hw-master.service << EOF
[Unit]
Description=H Worker Master API
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/hw-master/server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=VERCEL_TOKEN=${VERCEL_TOKEN}
Environment=VERCEL_SCOPE=${VERCEL_SCOPE}

[Install]
WantedBy=multi-user.target
EOF

  cat > /etc/systemd/system/hw-orchestrator.service << 'EOF'
[Unit]
Description=H Worker Orchestrator (Claude-powered task planner)
After=hw-master.service

[Service]
ExecStart=/usr/bin/node /opt/hw-master/orchestrator.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable hw-master hw-orchestrator
  log "Master systemd services installed and enabled."
}

setup_master_dashboard() {
  log "Setting up dashboard repo for Vercel deploys..."
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  mkdir -p /opt/hw-dashboard

  # Copy dashboard files if present in repo
  if [[ -d "$SCRIPT_DIR/dashboard" ]]; then
    cp -r "$SCRIPT_DIR/dashboard/." /opt/hw-dashboard/
    log "Dashboard files copied to /opt/hw-dashboard/"
  else
    warn "No dashboard/ directory found in repo — skipping dashboard copy."
  fi
}

# =============================================================================
# START SERVICES
# =============================================================================

start_worker_services() {
  log "Starting worker services..."
  systemctl start xvfb
  sleep 2
  systemctl start xfce-desktop
  sleep 3
  systemctl start x11vnc
  systemctl start novnc
  systemctl start openclaw
  systemctl start screenshot.timer
  systemctl start hw-supervisor
  log "Worker services started."
}

start_master_services() {
  log "Starting master services..."
  systemctl start hw-master
  sleep 2
  systemctl start hw-orchestrator
  log "Master services started."
}

# =============================================================================
# STATUS CHECK
# =============================================================================

check_worker_status() {
  echo ""
  log "=== Worker Status ==="
  for svc in xvfb xfce-desktop x11vnc novnc openclaw hw-supervisor screenshot.timer; do
    STATUS=$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")
    if [[ "$STATUS" == "active" ]]; then
      echo -e "  ${G}✓${NC} $svc"
    else
      echo -e "  ${R}✗${NC} $svc ($STATUS)"
    fi
  done
  PUBLIC_IP=$(curl -s --max-time 5 http://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
  echo ""
  echo "  VNC:   vnc://${PUBLIC_IP}:5900"
  echo "  noVNC: http://${PUBLIC_IP}:6080"
  echo "  Worker ID: ${WORKER_ID}"
  echo "  Master: ${MASTER_IP}"
}

check_master_status() {
  echo ""
  log "=== Master Status ==="
  for svc in hw-master hw-orchestrator; do
    STATUS=$(systemctl is-active "$svc" 2>/dev/null || echo "inactive")
    if [[ "$STATUS" == "active" ]]; then
      echo -e "  ${G}✓${NC} $svc"
    else
      echo -e "  ${R}✗${NC} $svc ($STATUS)"
    fi
  done
  PUBLIC_IP=$(curl -s --max-time 5 http://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
  echo ""
  echo "  API:   http://${PUBLIC_IP}:3000/status"
  sleep 2
  curl -s "http://localhost:3000/status" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'  Workers: {len(d.get(\"workers\",{}))} | Tasks: {len(d.get(\"tasks\",[]))}')
" 2>/dev/null || echo "  (API not yet ready)"
}

# =============================================================================
# MAIN
# =============================================================================

log "H-Worker fleet deployment — role: ${ROLE}"
log "Hostname: $(hostname)"

# =============================================================================
# NANOCLAW SETUP (workers)
# =============================================================================

function install_nanoclaw_start() {
  systemctl start nanoclaw-manager || true
}
install_nanoclaw() {
  log "Installing nanoclaw manager..."
  
  # Install python3-venv
  apt-get install -y -qq python3-venv python3-pip 2>/dev/null
  
  # Create directories
  mkdir -p /opt/nanoclaw/agents /usr/local/bin
  
  # Install zeroclaw binary
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$SCRIPT_DIR/worker/zeroclaw" ]]; then
    cp "$SCRIPT_DIR/worker/zeroclaw" /usr/local/bin/zeroclaw
  elif [[ -f /mnt/shared/scripts/zeroclaw ]]; then
    cp /mnt/shared/scripts/zeroclaw /usr/local/bin/zeroclaw
  else
    warn "zeroclaw not found — skipping binary install"
  fi
  [[ -f /usr/local/bin/zeroclaw ]] && chmod +x /usr/local/bin/zeroclaw
  
  # Install manager.py
  if [[ -f "$SCRIPT_DIR/worker/manager.py" ]]; then
    cp "$SCRIPT_DIR/worker/manager.py" /opt/nanoclaw/manager.py
  elif [[ -f /mnt/shared/scripts/manager.py ]]; then
    cp /mnt/shared/scripts/manager.py /opt/nanoclaw/manager.py
  else
    warn "manager.py not found — skipping"
  fi
  
  # Create venv and install dependencies
  python3 -m venv /opt/nanoclaw/venv
  /opt/nanoclaw/venv/bin/pip install fastapi uvicorn requests 2>&1 | tail -3
  
  # Write worker ID env file
  echo "WORKER_ID=${WORKER_ID}" > /opt/nanoclaw/worker.env
  
  # Install systemd service
  cat > /etc/systemd/system/nanoclaw-manager.service << EOF
[Unit]
Description=Nanoclaw Manager API (port 9200)
After=network.target

[Service]
ExecStart=/opt/nanoclaw/venv/bin/python3 /opt/nanoclaw/manager.py
Environment=MANAGER_PORT=9200
EnvironmentFile=-/opt/nanoclaw/worker.env
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  
  # Open port 9200
  ufw allow 9200/tcp 2>/dev/null || true
  
  systemctl daemon-reload
  systemctl enable nanoclaw-manager
  log "nanoclaw-manager installed."
}


install_base
install_nodejs
setup_nfs

if [[ "$ROLE" == "worker" ]]; then
  install_desktop
  install_openclaw
  install_nanoclaw
  setup_vnc_xstartup
  setup_worker_skills
  install_supervisor_script
  setup_worker_services
  install_nanoclaw_start
  start_worker_services
  check_worker_status
  echo ""
  log "Worker deployment complete."

elif [[ "$ROLE" == "master" ]]; then
  install_vercel
  setup_master_files
  setup_master_services
  setup_master_dashboard
  start_master_services
  check_master_status
  echo ""
  log "Master deployment complete."
  echo ""
  warn "Next steps:"
  echo "  1. Add NFS volume via DigitalOcean console and re-run with NFS_MOUNT set"
  echo "  2. Add credits to your Anthropic account for Claude-powered orchestration"
  echo "  3. Deploy dashboard: cd /opt/hw-dashboard && vercel deploy --prod --token ${VERCEL_TOKEN} --scope ${VERCEL_SCOPE} --yes"
  echo "  4. Provision workers with: ./deploy.sh worker hw-worker-N $(curl -s checkip.amazonaws.com 2>/dev/null) <TG_CHAT> <TG_TOKEN> <ANTHROPIC_KEY>"
fi
