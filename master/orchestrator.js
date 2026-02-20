#!/usr/bin/env node
/**
 * hw-master orchestrator — autonomous task planner
 * Watches for 'queued' tasks, plans with Claude, writes worker scripts, telegrams
 */
const fs   = require('fs');
const path = require('path');

const MASTER        = 'http://localhost:3000';
const TG_TOKEN      = '8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8';
const TG_CHAT       = '-5166727984';
const ARTIFACT_BASE = '/mnt/shared/artifacts';
const KEY_FILE      = '/opt/hw-master/anthropic_key.json';

function getKey() {
  try { return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key; } catch {}
  return process.env.ANTHROPIC_API_KEY || '';
}

async function tg(text) {
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, parse_mode: 'Markdown' }),
    });
  } catch {}
}

async function api(endpoint, body) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(`${MASTER}${endpoint}`, opts);
  return r.json();
}

async function setState(taskId, to, note) {
  return api(`/task/${taskId}/state`, { to, note });
}

async function claude(prompt) {
  const key = getKey();
  if (!key) throw new Error('No ANTHROPIC_API_KEY — set it in ' + KEY_FILE);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const d = await res.json();
  if (!d.content) throw new Error('Claude error: ' + JSON.stringify(d));
  return d.content[0].text;
}

function slugify(s) {
  return (s || 'task').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
}

// ── Built-in plans for when Claude is unavailable ────────────────────────────
function builtinPlan(task, artifactDir, workerList) {
  const desc = (task.description || '').toLowerCase();
  const type = (task.type || '').toLowerCase();
  const extra = task.extra || {};

  // Pick the first available worker
  const worker = workerList.find(w => w.status === 'active') || { id: 'hw-worker-1', ip: '164.90.197.224' };

  // HTML → Video render plan
  if (type === 'render' || desc.includes('video') || desc.includes('render') || desc.includes('slide')) {
    const htmlSource = extra.html_source || '';
    const taskId = task.id;
    const aDir = artifactDir;
    const outVideo = `${aDir}/output.mp4`;
    const TG_TOKEN = '8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8';
    const TG_CHAT  = '-5166727984';

    const script = `#!/bin/bash
set -e
TASK_ID="${taskId}"
MASTER="http://159.65.205.244:3000"
ARTIFACT_DIR="${aDir}"
HTML_SOURCE="${htmlSource}"
OUT_VIDEO="${outVideo}"
TG_TOKEN="${TG_TOKEN}"
TG_CHAT="${TG_CHAT}"

tg() { curl -s "https://api.telegram.org/bot$TG_TOKEN/sendMessage" -d chat_id="$TG_CHAT" -d text="$1" -d parse_mode=Markdown > /dev/null 2>&1 || true; }
state() { curl -sX POST "$MASTER/task/$TASK_ID/state" -H 'Content-Type: application/json' -d "{\\"to\\":\\"$1\\",\\"note\\":\\"$2\\"}" > /dev/null 2>&1; }

mkdir -p "$ARTIFACT_DIR/frames"

# Use existing HTML if available, else look in artifacts
if [ ! -f "$HTML_SOURCE" ]; then
  HTML_SOURCE=$(find /mnt/shared/artifacts -name "gtbank-index.html" 2>/dev/null | head -1)
fi
[ -z "$HTML_SOURCE" ] && { state "failed" "No HTML source found"; exit 1; }

# Copy HTML to artifact dir
cp "$HTML_SOURCE" "$ARTIFACT_DIR/gtbank-index.html"

# Install chromium
state "installing_chromium" "apt-get install chromium-browser"
tg "🔧 *$(hostname)* installing chromium..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq chromium-browser 2>/dev/null
CHROMIUM=$(command -v chromium-browser || command -v chromium || echo "")
[ -z "$CHROMIUM" ] && { state "failed" "chromium not found"; exit 1; }

# Install ffmpeg
state "installing_ffmpeg" "apt-get install ffmpeg"
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg 2>/dev/null

# Install puppeteer
state "installing_puppeteer" "npm install puppeteer"
cd "$ARTIFACT_DIR"
[ ! -d node_modules/puppeteer ] && npm install --save puppeteer 2>&1 | tail -3

# Copy capture script
CAPTURE_JS=$(find /mnt/shared/artifacts -name "gtbank-capture.js" 2>/dev/null | head -1)
[ -z "$CAPTURE_JS" ] && CAPTURE_JS="$ARTIFACT_DIR/capture.js"

cat > "$ARTIFACT_DIR/capture.js" << 'CAPEOF'
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const HTML = process.argv[2];
const OUTDIR = process.argv[3];
const FPS = parseInt(process.argv[4] || '30');
const SLIDE_MS = parseInt(process.argv[5] || '3000');
const SLIDES = 5;
const FRAME_MS = 1000 / FPS;
const FRAMES_PER_SLIDE = Math.ceil(SLIDE_MS / FRAME_MS);
async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--window-size=1280,720'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  let gf = 0;
  for (let slide = 1; slide <= SLIDES; slide++) {
    const url = 'file://' + path.resolve(HTML) + '?slide=' + slide;
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 200));
    for (let f = 0; f < FRAMES_PER_SLIDE; f++) {
      const ms = f * FRAME_MS;
      await page.evaluate((ms) => {
        document.querySelectorAll('.slide.active').forEach(s => s.getAnimations({subtree:true}).forEach(a => { try { a.currentTime = ms; } catch {} }));
      }, ms);
      await page.screenshot({ path: path.join(OUTDIR, 'frame_' + String(gf).padStart(5,'0') + '.png'), clip: {x:0,y:0,width:1280,height:720} });
      gf++;
    }
    console.log('Slide ' + slide + ': ' + FRAMES_PER_SLIDE + ' frames');
  }
  await browser.close();
  console.log('Total frames: ' + gf);
}
main().catch(e => { console.error(e); process.exit(1); });
CAPEOF

# Capture frames
state "capturing_frames" "rendering 450 frames via puppeteer"
tg "🎬 *$(hostname)* capturing 5 slides × 90 frames..."
rm -f "$ARTIFACT_DIR/frames"/frame_*.png
CHROMIUM_PATH="$CHROMIUM" node "$ARTIFACT_DIR/capture.js" "$ARTIFACT_DIR/gtbank-index.html" "$ARTIFACT_DIR/frames" 30 3000

FRAME_COUNT=$(ls "$ARTIFACT_DIR/frames"/frame_*.png 2>/dev/null | wc -l)
[ "$FRAME_COUNT" -lt 400 ] && { state "failed" "Only $FRAME_COUNT frames captured"; exit 1; }

# Encode video
state "encoding_video" "ffmpeg H.264 encode"
tg "🎞 *$(hostname)* encoding $FRAME_COUNT frames → MP4..."
ffmpeg -y -framerate 30 -i "$ARTIFACT_DIR/frames/frame_%05d.png" \\
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart \\
  "$OUT_VIDEO" 2>&1 | tail -5

SIZE=$(du -h "$OUT_VIDEO" | cut -f1)
state "done" "MP4 ready: $OUT_VIDEO ($SIZE)"
tg "✅ *GTBank Wrapped 2025* render complete on \`$(hostname)\`
📁 \`$OUT_VIDEO\`
🎞 $FRAME_COUNT frames → 15s MP4 ($SIZE)"
`;

    return {
      plan_summary: `Render GTBank Wrapped 2025 HTML slides to MP4 on ${worker.id}`,
      telegram_message: `📋 *Plan: GTBank Wrapped 2025 Render*\n\n🖥 *${worker.id}* → renderer\nSteps: install_chromium → install_ffmpeg → install_puppeteer → capture_frames → encode_video\n\nArtifact: \`${aDir}/output.mp4\``,
      artifact_dir: aDir + '/',
      worker_assignments: [{ worker_id: worker.id, role: 'renderer', script }],
    };
  }

  return null; // No built-in plan for this task type
}

const processed = new Set();

async function orchestrate() {
  let status;
  try { status = await api('/status'); } catch { return; }

  const { tasks = [], workers = {} } = status;
  // Only orchestrate top-level tasks (no parent_task), not subtasks
  const queued = tasks.filter(t => t.status === 'queued' && !t.parent_task && !processed.has(t.id));

  for (const task of queued) {
    processed.add(task.id);
    const label = task.title || task.description || task.id;
    console.log(`[orch] Picked up: ${task.id} "${label}"`);

    try {
      await setState(task.id, 'planning', 'Master analyzing task with Claude');
      await tg(`🧠 *New task*: ${label}\nID: \`${task.id}\`\nMaster is planning...`);

      const workerInfo = Object.values(workers)
        .map(w => `  • ${w.id} ip=${w.ip} status=${w.status} skills=[${(w.skills||[]).map(s=>s.name).join(',')||'none'}]`)
        .join('\n') || '  • hw-worker-1 (164.90.197.224) — available';

      const artifactDir = `${ARTIFACT_BASE}/${task.id}-${slugify(label)}`;

      const prompt = `You are the master orchestrator for a fleet of Ubuntu 22.04 worker VMs.

## TASK
ID: ${task.id}
Title: ${task.title || '(none)'}
Description: ${task.description || ''}
Type: ${task.type || 'general'}
Extra: ${JSON.stringify(task.extra || {})}

## AVAILABLE WORKERS
${workerInfo}

## ENVIRONMENT
- OS: Ubuntu 22.04, bash, Node.js 22, npm, apt-get (run non-interactive)
- NFS at /mnt/shared/ on all nodes (read/write)
- Artifact dir for this task: ${artifactDir}/
- MASTER API: http://159.65.205.244:3000
- Task ID for state reporting: ${task.id}
- TG bot token: 8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8
- TG chat: -5166727984

## HOW WORKERS REPORT PROGRESS
(bash snippet for scripts)
# Report a state change (freeform snake_case):
curl -sX POST http://159.65.205.244:3000/task/${task.id}/state -H 'Content-Type: application/json' -d '{"to":"STATE_NAME","note":"human readable note"}'

# Send telegram:
curl -s "https://api.telegram.org/bot8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8/sendMessage" -d chat_id=-5166727984 -d text="MESSAGE" -d parse_mode=Markdown

## YOUR JOB
1. Break the task into worker roles (usually 1–3 workers)
2. For each worker write a complete bash script that:
   - Starts with #!/bin/bash and set -e
   - Reports descriptive states at every step: installing_deps → downloading → processing → encoding → uploading → done
   - Saves all output to ${artifactDir}/
   - Reports done (or failed) at the end
   - Sends telegram milestones
3. Decide which states the task flows through — this is shown in the UI state machine
4. Write a human-friendly telegram plan announcement

Return ONLY raw valid JSON (no markdown fences, no commentary):
{
  "plan_summary": "one sentence",
  "telegram_message": "telegram plan with emojis, markdown, worker names",
  "artifact_dir": "${artifactDir}/",
  "worker_assignments": [
    {
      "worker_id": "hw-worker-1",
      "role": "renderer",
      "script": "#!/bin/bash\\nset -e\\n# full script\\n..."
    }
  ]
}`;

      let plan;
      try {
        const raw = await claude(prompt);
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) throw new Error('no JSON found');
        plan = JSON.parse(m[0]);
      } catch (e) {
        console.warn('[orch] Claude unavailable:', e.message, '— using built-in planner');
        plan = builtinPlan(task, artifactDir, Object.values(workers));
        if (!plan) {
          await setState(task.id, 'failed', 'Claude unavailable and no built-in plan for this task type');
          await tg(`❌ Task \`${task.id}\` failed: Claude API unavailable (${e.message.slice(0,80)})`);
          continue;
        }
      }

      const aDir = (plan.artifact_dir || artifactDir).replace(/\/$/, '');
      fs.mkdirSync(aDir, { recursive: true });

      await setState(task.id, 'assigning', plan.plan_summary);
      await tg(plan.telegram_message);

      for (const asgn of plan.worker_assignments || []) {
        const scriptPath = path.join(aDir, `worker-${asgn.worker_id}.sh`);
        fs.writeFileSync(scriptPath, asgn.script, { mode: 0o755 });
        console.log(`[orch] Script → ${scriptPath}`);

        // Create a subtask with 'pending' (not 'queued') so it goes to workers, not orchestrator
        await api('/task', {
          title: `${label} [${asgn.role}]`,
          type: task.type || 'script',
          description: asgn.role,
          script: scriptPath,
          parent_task: task.id,
          assigned_worker: asgn.worker_id,
          artifact_dir: aDir,
          status: 'pending',
        });
      }

      console.log(`[orch] Task ${task.id} → ${plan.worker_assignments?.length || 0} subtask(s) created`);

    } catch (e) {
      console.error('[orch] Fatal error for task', task.id, ':', e.message);
      await setState(task.id, 'failed', 'Orchestration error: ' + e.message);
      await tg(`❌ Task \`${task.id}\` orchestration error: ${e.message}`);
    }
  }
}

console.log('[orch] Started — polling every 5s for queued tasks');
setInterval(orchestrate, 5000);
orchestrate();
