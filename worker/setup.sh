#!/bin/bash
set -e
WORKER_ID=$1
MASTER_IP=$2
export DEBIAN_FRONTEND=noninteractive

# Base packages + desktop + VNC
apt-get update -qq
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y -qq nodejs nfs-common xfce4 xfce4-goodies tightvncserver novnc websockify x11vnc curl jq python3-pip

# NFS mount
mkdir -p /mnt/shared
echo "10.110.0.2:/33522846/743ca995-39f8-4f2e-ac0f-0759278f1dd4 /mnt/shared nfs defaults,_netdev 0 0" >> /etc/fstab
mount /mnt/shared || echo "NFS mount failed (continuing)"

# Install OpenClaw
npm install -g openclaw@latest

# VNC setup
mkdir -p /root/.vnc
echo "openclaw123" | vncpasswd -f > /root/.vnc/passwd
chmod 600 /root/.vnc/passwd
cat > /root/.vnc/xstartup << 'XEOF'
#!/bin/bash
xrdb $HOME/.Xresources
startxfce4 &
XEOF
chmod +x /root/.vnc/xstartup

# VNC systemd service
cat > /etc/systemd/system/vncserver.service << 'VNCSVC'
[Unit]
Description=VNC Server
After=network.target

[Service]
Type=forking
ExecStartPre=-/usr/bin/vncserver -kill :1
ExecStart=/usr/bin/vncserver :1 -geometry 1280x800 -depth 24
ExecStop=/usr/bin/vncserver -kill :1
Restart=on-failure

[Install]
WantedBy=multi-user.target
VNCSVC

# noVNC systemd service (web-based VNC on port 6080)
cat > /etc/systemd/system/novnc.service << 'NOVSVC'
[Unit]
Description=noVNC Web Interface
After=vncserver.service

[Service]
ExecStart=/usr/share/novnc/utils/novnc_proxy --listen 6080 --vnc localhost:5901
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
NOVSVC

# OpenClaw config
mkdir -p /root/.openclaw
cat > /root/.openclaw/openclaw.json << 'CONFEOF'
{
  "agent": {
    "model": "anthropic/claude-sonnet-4-5-20250929"
  },
  "channels": {
    "telegram": {
      "token": "8386044481:AAGGJAQ4Ns5lolNszuXAXZ-Fdp19v9QcKU4"
    }
  }
}
CONFEOF

# OpenClaw systemd service
cat > /etc/systemd/system/openclaw.service << OWSVC
[Unit]
Description=OpenClaw Worker
After=network.target vncserver.service

[Service]
ExecStart=$(which openclaw) gateway
Environment=ANTHROPIC_API_KEY=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
Environment=TELEGRAM_BOT_TOKEN=8386044481:AAGGJAQ4Ns5lolNszuXAXZ-Fdp19v9QcKU4
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
OWSVC

# Claude supervisor — monitors OpenClaw, restarts on error
cat > /opt/claude_supervisor.sh << 'SUPEOF'
#!/bin/bash
LOG=/var/log/openclaw.log
WORKER_ID=$1
MASTER_IP=$2
PUBLIC_IP=$(curl -s http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || hostname -I | awk '{print $1}')

while true; do
  STATUS=$(systemctl is-active openclaw)
  TASK=$(cat /tmp/current_task 2>/dev/null || echo "idle")

  # Heartbeat to master
  curl -s -X POST "http://$MASTER_IP:3000/worker/heartbeat"     -H "Content-Type: application/json"     -d "{\"id\":\"$WORKER_ID\",\"status\":\"$STATUS\",\"task\":\"$TASK\",\"ip\":\"$PUBLIC_IP\",\"vnc_port\":6080}"     2>/dev/null || true

  if [ "$STATUS" != "active" ]; then
    echo "$(date): OpenClaw not active ($STATUS), restarting..." >> $LOG
    systemctl restart openclaw
    sleep 10
    continue
  fi

  # Check for recent errors in journal
  ERRORS=$(journalctl -u openclaw --since "1 minute ago" -q 2>/dev/null | grep -i "error\|fatal\|crash" | wc -l)
  if [ "$ERRORS" -gt 5 ]; then
    echo "$(date): Too many errors ($ERRORS), restarting openclaw..." >> $LOG
    systemctl restart openclaw
    sleep 15
  fi

  # Poll master for new task
  TASK_RESP=$(curl -s "http://$MASTER_IP:3000/worker/task/$WORKER_ID" 2>/dev/null)
  TASK_ID=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('task'); print(t['id'] if t else '')" 2>/dev/null)
  TASK_DESC=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('task'); print(t.get('description','') if t else '')" 2>/dev/null)

  if [ -n "$TASK_ID" ]; then
    echo "$TASK_DESC" > /tmp/current_task
    echo "$(date): Received task $TASK_ID: $TASK_DESC" >> $LOG
    # Task execution happens via OpenClaw/Claude
    sleep 30
    curl -s -X POST "http://$MASTER_IP:3000/task/$TASK_ID/complete"       -H "Content-Type: application/json" -d "{}" 2>/dev/null || true
    rm -f /tmp/current_task
  fi

  sleep 15
done
SUPEOF
chmod +x /opt/claude_supervisor.sh

cat > /etc/systemd/system/hw-supervisor.service << SUPSVC
[Unit]
Description=Claude Supervisor for OpenClaw
After=openclaw.service

[Service]
ExecStart=/opt/claude_supervisor.sh $WORKER_ID $MASTER_IP
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SUPSVC

# Substitute actual values
sed -i "s/\$WORKER_ID/${WORKER_ID}/g; s/\$MASTER_IP/${MASTER_IP}/g" /etc/systemd/system/hw-supervisor.service

systemctl daemon-reload
systemctl enable vncserver novnc openclaw hw-supervisor
systemctl start vncserver
sleep 3
systemctl start novnc openclaw hw-supervisor

echo "=== WORKER $WORKER_ID SETUP DONE ==="
systemctl status openclaw --no-pager | tail -3
systemctl status hw-supervisor --no-pager | tail -3
