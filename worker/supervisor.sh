#\!/bin/bash
WORKER_ID=$1
MASTER_IP=$2
CHAT_ID=$3
BOT_TOKEN=$4
LOG=/var/log/openclaw.log

send_tg() {
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"$1\",\"parse_mode\":\"Markdown\"}" \
    2>/dev/null || true
}

PUBLIC_IP=$(curl -s --max-time 5 http://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
send_tg "✅ *${WORKER_ID}* started — IP: ${PUBLIC_IP}"

while true; do
  STATUS=$(systemctl is-active openclaw)
  TASK=$(cat /tmp/current_task 2>/dev/null || echo "idle")

  # Heartbeat to master
  curl -s -X POST "http://${MASTER_IP}:3000/worker/heartbeat" \
    -H "Content-Type: application/json" \
    -d "{\"id\":\"${WORKER_ID}\",\"status\":\"${STATUS}\",\"task\":\"${TASK}\",\"ip\":\"${PUBLIC_IP}\",\"vnc_port\":6080}" \
    2>/dev/null || true

  if [ "$STATUS" \!= "active" ]; then
    echo "$(date): OpenClaw not active (${STATUS}), restarting..." >> $LOG
    send_tg "⚠️ *${WORKER_ID}* openclaw ${STATUS} — restarting"
    systemctl restart openclaw
    sleep 10
    continue
  fi

  # Check for errors
  ERRORS=$(journalctl -u openclaw --since "1 minute ago" -q 2>/dev/null | grep -i "error\|fatal\|crash" | wc -l)
  if [ "$ERRORS" -gt 5 ]; then
    echo "$(date): Too many errors ($ERRORS), restarting..." >> $LOG
    send_tg "🔄 *${WORKER_ID}* restarting due to errors (${ERRORS}/min)"
    systemctl restart openclaw
    sleep 15
  fi

  # Poll master for task
  TASK_RESP=$(curl -s "http://${MASTER_IP}:3000/worker/task/${WORKER_ID}" 2>/dev/null)
  TASK_ID=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('task'); print(t['id'] if t else '')" 2>/dev/null)
  TASK_DESC=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('task'); print(t.get('description','') if t else '')" 2>/dev/null)

  if [ -n "$TASK_ID" ]; then
    echo "$TASK_DESC" > /tmp/current_task
    send_tg "🔧 *${WORKER_ID}* picked task: ${TASK_DESC}"
    sleep 30
    curl -s -X POST "http://${MASTER_IP}:3000/task/${TASK_ID}/complete" \
      -H "Content-Type: application/json" -d "{}" 2>/dev/null || true
    send_tg "✅ *${WORKER_ID}* completed: ${TASK_DESC}"
    rm -f /tmp/current_task
  fi

  sleep 15
done
