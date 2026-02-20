#!/bin/bash
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

report_state() {
  local TASK_ID="$1" STATE="$2" NOTE="$3"
  curl -s -X POST "http://${MASTER_IP}:3000/task/${TASK_ID}/state" \
    -H "Content-Type: application/json" \
    -d "{\"to\":\"${STATE}\",\"note\":\"${NOTE}\"}" 2>/dev/null || true
}

get_skills_json() {
  python3 -c "
import json, glob, os
seen = set()
skills = []
for pattern in ['/opt/skills/*.json', '/mnt/shared/skills/*.json']:
    for f in sorted(glob.glob(pattern)):
        try:
            s = json.load(open(f))
            if s.get('name') not in seen:
                seen.add(s['name'])
                skills.append(s)
        except: pass
print(json.dumps(skills))
" 2>/dev/null || echo "[]"
}

sync_skills_to_nfs() {
  python3 -c "
import json, glob, shutil, os
os.makedirs('/mnt/shared/skills', exist_ok=True)
for f in glob.glob('/opt/skills/*.json'):
    try:
        s = json.load(open(f))
        s['origin'] = '${WORKER_ID}'
        dest = '/mnt/shared/skills/' + os.path.basename(f)
        if not os.path.exists(dest):
            with open(dest, 'w') as out: json.dump(s, out)
    except: pass
" 2>/dev/null || true
}

execute_task() {
  local TASK_ID="$1"
  local TASK_SCRIPT="$2"
  local TASK_DESC="$3"

  if [ -n "$TASK_SCRIPT" ] && [ -f "$TASK_SCRIPT" ]; then
    echo "$TASK_DESC" > /tmp/current_task
    echo "$TASK_ID" > /tmp/current_task_id
    send_tg "⚙️ *${WORKER_ID}* executing script for task \`${TASK_ID}\`\nRole: ${TASK_DESC}"

    bash "$TASK_SCRIPT" "$TASK_ID" >> /var/log/hw-task.log 2>&1
    EXIT=$?

    rm -f /tmp/current_task /tmp/current_task_id

    if [ "$EXIT" -eq 0 ]; then
      # Script itself should have reported 'done' state — just log it
      echo "$(date): Task ${TASK_ID} script exit 0" >> $LOG
    else
      report_state "$TASK_ID" "failed" "Script exited with code $EXIT on ${WORKER_ID}"
      send_tg "❌ *${WORKER_ID}* task \`${TASK_ID}\` failed (exit $EXIT)"
    fi
  else
    # No script field — legacy: just mark complete after a delay
    echo "$TASK_DESC" > /tmp/current_task
    sleep 30
    curl -s -X POST "http://${MASTER_IP}:3000/task/${TASK_ID}/complete" \
      -H "Content-Type: application/json" -d "{}" 2>/dev/null || true
    send_tg "✅ *${WORKER_ID}* completed: ${TASK_DESC}"
    rm -f /tmp/current_task
  fi
}

PUBLIC_IP=$(curl -s --max-time 5 http://checkip.amazonaws.com 2>/dev/null || hostname -I | awk '{print $1}')
sync_skills_to_nfs
send_tg "✅ *${WORKER_ID}* started — IP: ${PUBLIC_IP}"

while true; do
  STATUS=$(systemctl is-active openclaw 2>/dev/null || echo "inactive")
  TASK=$(cat /tmp/current_task 2>/dev/null || echo "idle")
  SKILLS=$(get_skills_json)

  PAYLOAD=$(python3 -c "
import json
print(json.dumps({
  'id': '${WORKER_ID}',
  'status': '${STATUS}',
  'task': open('/tmp/current_task').read().strip() if __import__('os').path.exists('/tmp/current_task') else 'idle',
  'ip': '${PUBLIC_IP}',
  'vnc_port': 6080,
  'skills': ${SKILLS}
}))" 2>/dev/null || echo '{"id":"'"${WORKER_ID}"'","status":"active","task":"idle","ip":"'"${PUBLIC_IP}"'","vnc_port":6080,"skills":[]}')

  curl -s -X POST "http://${MASTER_IP}:3000/worker/heartbeat" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" 2>/dev/null || true

  # Check for a pending task assigned to this worker (or unassigned)
  TASK_RESP=$(curl -s "http://${MASTER_IP}:3000/worker/task/${WORKER_ID}" 2>/dev/null)
  TASK_ID=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('task'); print(t['id'] if t else '')" 2>/dev/null)
  TASK_SCRIPT=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('task'); print(t.get('script','') if t else '')" 2>/dev/null)
  TASK_DESC=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); t=d.get('task'); print(t.get('description','') if t else '')" 2>/dev/null)

  if [ -n "$TASK_ID" ]; then
    execute_task "$TASK_ID" "$TASK_SCRIPT" "$TASK_DESC"
  fi

  sleep 15
done
