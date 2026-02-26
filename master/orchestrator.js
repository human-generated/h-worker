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
const NFS_KEYS_FILE = '/mnt/shared/keys.json';

function getKey() {
  try { return JSON.parse(fs.readFileSync(KEY_FILE, 'utf8')).key; } catch {}
  return process.env.ANTHROPIC_API_KEY || '';
}

function getNfsKeys() {
  try { return JSON.parse(fs.readFileSync(NFS_KEYS_FILE, 'utf8')); } catch { return {}; }
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
  const isOAuth = key.startsWith('sk-ant-oat');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(isOAuth
        ? { 'Authorization': `Bearer ${key}`, 'anthropic-beta': 'oauth-2025-04-20' }
        : { 'x-api-key': key }),
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

  // ── Image slideshow plan ────────────────────────────────────────────────────
  if (type === 'image_slideshow' || (extra.images && extra.images.length > 0 && extra.narrations)) {
    const imgs = extra.images || [];
    const narrs = extra.narrations || [];
    const nSlides = Math.min(imgs.length, narrs.length);
    if (nSlides > 0 && (extra.elevenlabs_key || extra.elevenlabs_key === undefined)) {
      const taskId = task.id;
      const aDir = artifactDir;
      const outVideo = `${aDir}/output.mp4`;
      const TG_TOKEN = '8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8';
      const TG_CHAT  = '-5166727984';
      const elKey = extra.elevenlabs_key || '';
      const vId = extra.voice_id || 'it5NMxoQQ2INIh4XcO44';
      const maxSlideSec = (extra.max_slide_ms || 8000) / 1000;

      // Build narration bash variables
      const narrationVars = narrs.slice(0, nSlides).map((n, idx) => {
        const esc = n.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
        return `NARR${idx+1}='${esc}'`;
      }).join('\n');

      // Build image copy commands (hardcoded source → artifact dir)
      const imageCopyLines = imgs.slice(0, nSlides).map((img, idx) =>
        `cp "${img}" "${aDir}/img${idx+1}.png"`
      ).join('\n');

      // Build per-slide TTS + duration blocks (JS loop, no bash loop vars)
      let ttsBlocks = '';
      let segBlocks = '';
      for (let i = 1; i <= nSlides; i++) {
        ttsBlocks += `
xi_tts "$NARR${i}" "$ARTIFACT_DIR/audio/slide${i}.mp3"
[ ! -s "$ARTIFACT_DIR/audio/slide${i}.mp3" ] && { state "failed" "ElevenLabs failed for slide ${i}"; exit 1; }
A${i}=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ARTIFACT_DIR/audio/slide${i}.mp3" 2>/dev/null)
D${i}=$(python3 -c "print(round(min(float('$A${i}'), ${maxSlideSec}), 3))")
tg "Slide ${i} ready: $D${i}s"
`;
        segBlocks += `
state "rendering_slide_${i}" "ffmpeg image ${i} + audio"
ffmpeg -y -loop 1 -i "${aDir}/img${i}.png" -i "$ARTIFACT_DIR/audio/slide${i}.mp3" \\
  -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k \\
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:-1:-1:color=black,setsar=1" \\
  -pix_fmt yuv420p -t $D${i} \\
  "$ARTIFACT_DIR/seg${i}.mp4" 2>&1 | tail -2
`;
      }

      // Concat file entries (hardcoded paths — no bash var expansion needed)
      const concatFileLines = Array.from({length: nSlides}, (_, idx) =>
        `file '${aDir}/seg${idx+1}.mp4'`
      ).join('\n');

      const script = `#!/bin/bash
set -e
TASK_ID="\${1:-${taskId}}"
MASTER="http://159.65.205.244:3000"
ARTIFACT_DIR="${aDir}"
OUT_VIDEO="${outVideo}"
TG_TOKEN="${TG_TOKEN}"
TG_CHAT="${TG_CHAT}"
ELEVENLABS_KEY="${elKey}"
VOICE_ID="${vId}"
${narrationVars}

tg() { curl -s "https://api.telegram.org/bot$TG_TOKEN/sendMessage" -d chat_id="$TG_CHAT" -d text="$1" -d parse_mode=Markdown > /dev/null 2>&1 || true; }
state() { curl -sX POST "$MASTER/task/$TASK_ID/state" -H 'Content-Type: application/json' -d "{\\"to\\":\\"$1\\",\\"note\\":\\"$2\\"}" > /dev/null 2>&1; }

mkdir -p "$ARTIFACT_DIR/audio"
exec > >(tee -a "$ARTIFACT_DIR/run.log") 2>&1
echo "[$(date -u +%H:%M:%S)] Starting slideshow task $TASK_ID"

state "installing_deps" "apt-get install ffmpeg python3"
tg "🔧 *$(hostname)* installing deps..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ffmpeg python3 2>/dev/null

# Python helper for ElevenLabs JSON
cat > "$ARTIFACT_DIR/tts.py" << 'PYEOF'
import json, sys
text = sys.argv[1]
print(json.dumps({'text': text, 'model_id': 'eleven_multilingual_v2', 'voice_settings': {'stability': 0.5, 'similarity_boost': 0.75}}))
PYEOF

xi_tts() {
  local TEXT="$1" OUT="$2"
  python3 "$ARTIFACT_DIR/tts.py" "$TEXT" | \\
    curl -sX POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID" \\
      -H "xi-api-key: $ELEVENLABS_KEY" \\
      -H "Content-Type: application/json" \\
      -d @- -o "$OUT"
}

# Copy source images
state "copying_images" "copying ${nSlides} source images"
${imageCopyLines}

# Generate TTS narrations
state "generating_audio" "ElevenLabs TTS for ${nSlides} slides"
tg "🎙 *$(hostname)* generating narrations via ElevenLabs..."
${ttsBlocks}

# Render each slide as a video segment
${segBlocks}

# Concatenate all segments
state "concatenating" "ffmpeg concat ${nSlides} segments"
tg "🎞 *$(hostname)* concatenating..."
cat > "$ARTIFACT_DIR/concat.txt" << 'CEOF'
${concatFileLines}
CEOF

ffmpeg -y -f concat -safe 0 -i "$ARTIFACT_DIR/concat.txt" \\
  -c:v libx264 -c:a aac -b:a 128k -movflags +faststart \\
  "$OUT_VIDEO" 2>&1 | tail -5

SIZE=$(du -h "$OUT_VIDEO" | cut -f1)
state "done" "MP4 ready: $OUT_VIDEO ($SIZE)"
tg "✅ *Slideshow* complete on \`$(hostname)\`
📁 \`$OUT_VIDEO\`
🎬 ${nSlides} slides → MP4 ($SIZE)"
`;

      return {
        plan_summary: `Render ${nSlides}-image slideshow with ElevenLabs audio on ${worker.id}`,
        telegram_message: `📋 *Plan: Image Slideshow*\n\n🖥 *${worker.id}* → renderer\nSteps: installing_deps → copying_images → generating_audio → rendering_slide_1..${nSlides} → concatenating\n\n${nSlides} images, max ${maxSlideSec}s/slide\nArtifact: \`${aDir}/output.mp4\``,
        artifact_dir: aDir + '/',
        worker_assignments: [{ worker_id: worker.id, role: 'renderer', script }],
      };
    }
  }

  // HTML → Video render plan — ONLY if type is explicitly 'render' and html_source is provided
  if (type === 'render' && extra.html_source) {
    const htmlSource = extra.html_source || '';
    const taskId = task.id;
    const aDir = artifactDir;
    const outVideo = `${aDir}/output.mp4`;
    const TG_TOKEN = '8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8';
    const TG_CHAT  = '-5166727984';
    const elevenlabsKey = extra.elevenlabs_key || '';
    const voiceId = extra.voice_id || 'it5NMxoQQ2INIh4XcO44';

    // ── ElevenLabs audio render ──────────────────────────────────────────────
    if (elevenlabsKey) {
      const script = `#!/bin/bash
set -e
TASK_ID="\${1:-${taskId}}"
MASTER="http://159.65.205.244:3000"
ARTIFACT_DIR="${aDir}"
HTML_SOURCE="${htmlSource}"
OUT_VIDEO="${outVideo}"
TG_TOKEN="${TG_TOKEN}"
TG_CHAT="${TG_CHAT}"
ELEVENLABS_KEY="${elevenlabsKey}"
VOICE_ID="${voiceId}"

tg() { curl -s "https://api.telegram.org/bot$TG_TOKEN/sendMessage" -d chat_id="$TG_CHAT" -d text="$1" -d parse_mode=Markdown > /dev/null 2>&1 || true; }
state() { curl -sX POST "$MASTER/task/$TASK_ID/state" -H 'Content-Type: application/json' -d "{\\"to\\":\\"$1\\",\\"note\\":\\"$2\\"}" > /dev/null 2>&1; }

mkdir -p "$ARTIFACT_DIR/frames" "$ARTIFACT_DIR/audio"
exec > >(tee -a "$ARTIFACT_DIR/run.log") 2>&1
echo "[$(date -u +%H:%M:%S)] Starting render task $TASK_ID"

# Find/copy HTML source
if [ ! -f "$HTML_SOURCE" ]; then
  HTML_SOURCE=$(find /mnt/shared/artifacts -name "gtbank-index.html" 2>/dev/null | head -1)
fi
[ -z "$HTML_SOURCE" ] && { state "failed" "No HTML source found"; exit 1; }
cp "$HTML_SOURCE" "$ARTIFACT_DIR/gtbank-index.html"

# Install dependencies
state "installing_deps" "apt-get install chromium-browser ffmpeg python3"
tg "🔧 *$(hostname)* installing dependencies..."
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq chromium-browser ffmpeg python3 2>/dev/null
CHROMIUM=$(command -v chromium-browser || command -v chromium || echo "")
[ -z "$CHROMIUM" ] && { state "failed" "chromium not found"; exit 1; }

cd "$ARTIFACT_DIR"
state "installing_puppeteer" "npm install puppeteer (with bundled Chrome)"
[ ! -d node_modules/puppeteer ] && npm install --save puppeteer 2>&1 | tail -5
# Use puppeteer's bundled Chrome — avoids snap/system Chromium issues
CHROMIUM=$(node -e "const p=require('puppeteer'); console.log(p.executablePath ? p.executablePath() : '')" 2>/dev/null || echo "")
[ -z "$CHROMIUM" ] && CHROMIUM=$(find $ARTIFACT_DIR/node_modules/.cache -name 'chrome' -type f 2>/dev/null | head -1)
# Fallback to system chromium if puppeteer bundled not found
[ -z "$CHROMIUM" ] && CHROMIUM=$(command -v google-chrome-stable || command -v chromium-browser || command -v chromium || echo "")
[ -z "$CHROMIUM" ] && { state "failed" "No usable Chrome binary found"; exit 1; }
echo "Using Chrome: $CHROMIUM"

# Write Python helper for ElevenLabs JSON body (avoids shell quoting issues)
cat > "$ARTIFACT_DIR/tts.py" << 'PYEOF'
import json, sys
text = sys.argv[1]
print(json.dumps({'text': text, 'model_id': 'eleven_multilingual_v2', 'voice_settings': {'stability': 0.5, 'similarity_boost': 0.75}}))
PYEOF

xi_tts() {
  local TEXT="$1" OUT="$2"
  python3 "$ARTIFACT_DIR/tts.py" "$TEXT" | \\
    curl -sX POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE_ID" \\
      -H "xi-api-key: $ELEVENLABS_KEY" \\
      -H "Content-Type: application/json" \\
      -d @- -o "$OUT"
}
dur_ms() {
  local F="$1"
  local S=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$F" 2>/dev/null)
  python3 -c "print(int(float('$S') * 1000) + 1000)"
}

# Generate TTS audio for each slide (unrolled — no loop variable)
state "generating_audio" "ElevenLabs TTS for 5 slides"
tg "🎙 *$(hostname)* generating voice narrations via ElevenLabs..."

xi_tts "Welcome to your GTBank Wrapped 2025. Hello Melchizedek, your year in numbers is here." "$ARTIFACT_DIR/audio/slide1.mp3"
[ ! -s "$ARTIFACT_DIR/audio/slide1.mp3" ] && { state "failed" "ElevenLabs failed for slide 1"; exit 1; }
D1=$(dur_ms "$ARTIFACT_DIR/audio/slide1.mp3")
tg "🎙 Slide 1 ready: $D1 ms"

xi_tts "You have been a GTBank customer for 18 years. Since February 2007, you have been a Premium Member in Lagos, still going strong." "$ARTIFACT_DIR/audio/slide2.mp3"
[ ! -s "$ARTIFACT_DIR/audio/slide2.mp3" ] && { state "failed" "ElevenLabs failed for slide 2"; exit 1; }
D2=$(dur_ms "$ARTIFACT_DIR/audio/slide2.mp3")
tg "🎙 Slide 2 ready: $D2 ms"

xi_tts "In 2025, your average monthly balance was 7.2 million naira. Total annual turnover was 19.5 million naira, with monthly lodgements averaging 1.85 million naira." "$ARTIFACT_DIR/audio/slide3.mp3"
[ ! -s "$ARTIFACT_DIR/audio/slide3.mp3" ] && { state "failed" "ElevenLabs failed for slide 3"; exit 1; }
D3=$(dur_ms "$ARTIFACT_DIR/audio/slide3.mp3")
tg "🎙 Slide 3 ready: $D3 ms"

xi_tts "What if your 7.2 million naira earned while you slept? With the GT Money Market Fund at 22 percent per annum, you could earn 1.59 million naira every year, automatically, with no lock-up." "$ARTIFACT_DIR/audio/slide4.mp3"
[ ! -s "$ARTIFACT_DIR/audio/slide4.mp3" ] && { state "failed" "ElevenLabs failed for slide 4"; exit 1; }
D4=$(dur_ms "$ARTIFACT_DIR/audio/slide4.mp3")
tg "🎙 Slide 4 ready: $D4 ms"

xi_tts "Grow your money today with the GT Money Market Fund. Daily returns credited. No lock-up period. Start from just 10,000 naira. Open on GTWorld or dial star 737 star 50 hash." "$ARTIFACT_DIR/audio/slide5.mp3"
[ ! -s "$ARTIFACT_DIR/audio/slide5.mp3" ] && { state "failed" "ElevenLabs failed for slide 5"; exit 1; }
D5=$(dur_ms "$ARTIFACT_DIR/audio/slide5.mp3")
tg "🎙 Slide 5 ready: $D5 ms"

# Write durations JSON for capture script
echo "[$D1,$D2,$D3,$D4,$D5]" > "$ARTIFACT_DIR/slide_durations.json"
tg "📐 Slide durations (ms): [$D1,$D2,$D3,$D4,$D5]"

# Write per-slide-duration puppeteer capture script
# Optimization: only shoot animation frames (first ANIM_MS), then copy last frame for remainder
cat > "$ARTIFACT_DIR/capture.js" << 'CAPEOF'
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const HTML = process.argv[2];
const OUTDIR = process.argv[3];
const FPS = parseInt(process.argv[4] || '30');
const DURATIONS = JSON.parse(process.argv[5] || '[3000,3000,3000,3000,3000]');
const ANIM_MS = 2000; // CSS animations all complete within 2s
const FRAME_MS = 1000 / FPS;
async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--window-size=1280,720'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  let gf = 0;
  for (let slide = 1; slide <= DURATIONS.length; slide++) {
    const slideMs = DURATIONS[slide - 1];
    const totalFrames = Math.ceil(slideMs / FRAME_MS);
    const animFrames = Math.min(Math.ceil(ANIM_MS / FRAME_MS), totalFrames);
    const url = 'file://' + path.resolve(HTML) + '?slide=' + slide;
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(function(r) { setTimeout(r, 200); });
    // Capture animation portion via puppeteer
    var lastPath = '';
    for (let f = 0; f < animFrames; f++) {
      const ms = f * FRAME_MS;
      await page.evaluate(function(ms) {
        document.querySelectorAll('.slide.active').forEach(function(s) {
          s.getAnimations({subtree:true}).forEach(function(a) { try { a.currentTime = ms; } catch(e) {} });
        });
      }, ms);
      lastPath = path.join(OUTDIR, 'frame_' + String(gf).padStart(5,'0') + '.png');
      await page.screenshot({ path: lastPath, clip: {x:0,y:0,width:1280,height:720} });
      gf++;
    }
    // Hold last frame for remainder (fast file copy, no puppeteer)
    const holdFrames = totalFrames - animFrames;
    for (let h = 0; h < holdFrames; h++) {
      const dest = path.join(OUTDIR, 'frame_' + String(gf).padStart(5,'0') + '.png');
      fs.copyFileSync(lastPath, dest);
      gf++;
    }
    console.log('Slide ' + slide + ': ' + animFrames + ' shot + ' + holdFrames + ' held = ' + totalFrames + ' frames (' + slideMs + 'ms)');
  }
  await browser.close();
  console.log('Total frames: ' + gf);
}
main().catch(function(e) { console.error(e); process.exit(1); });
CAPEOF

# Capture frames with variable per-slide durations
state "capturing_frames" "puppeteer rendering with per-slide audio timing"
tg "🎬 *$(hostname)* capturing frames (variable durations)..."
rm -f "$ARTIFACT_DIR/frames"/frame_*.png
DURATIONS_JSON=$(cat "$ARTIFACT_DIR/slide_durations.json")
CHROMIUM_PATH="$CHROMIUM" node "$ARTIFACT_DIR/capture.js" \\
  "$ARTIFACT_DIR/gtbank-index.html" "$ARTIFACT_DIR/frames" 30 "$DURATIONS_JSON"

FRAME_COUNT=$(ls "$ARTIFACT_DIR/frames"/frame_*.png 2>/dev/null | wc -l)
[ "$FRAME_COUNT" -lt 50 ] && { state "failed" "Only $FRAME_COUNT frames captured"; exit 1; }
tg "📸 $FRAME_COUNT frames captured"

# Build audio track: slide narration + 1s silence per slide = exact slide duration
state "mixing_audio" "concatenating narrations with 1s silence padding"
tg "🎵 *$(hostname)* mixing audio..."

# Create 1-second silence MP3
ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 1.0 -q:a 9 -acodec libmp3lame \\
  "$ARTIFACT_DIR/audio/silence1s.mp3" 2>/dev/null

# Build concat list (unrolled — no loop variable)
CONCAT_LIST="$ARTIFACT_DIR/audio/concat_list.txt"
cat > "$CONCAT_LIST" << LISTEOF
file '$ARTIFACT_DIR/audio/slide1.mp3'
file '$ARTIFACT_DIR/audio/silence1s.mp3'
file '$ARTIFACT_DIR/audio/slide2.mp3'
file '$ARTIFACT_DIR/audio/silence1s.mp3'
file '$ARTIFACT_DIR/audio/slide3.mp3'
file '$ARTIFACT_DIR/audio/silence1s.mp3'
file '$ARTIFACT_DIR/audio/slide4.mp3'
file '$ARTIFACT_DIR/audio/silence1s.mp3'
file '$ARTIFACT_DIR/audio/slide5.mp3'
file '$ARTIFACT_DIR/audio/silence1s.mp3'
LISTEOF

ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" -c:a aac -b:a 192k \\
  "$ARTIFACT_DIR/audio/combined.aac" 2>&1 | tail -3

# Encode final video + audio
state "encoding_video" "ffmpeg H.264 + AAC encode"
tg "🎞 *$(hostname)* encoding $FRAME_COUNT frames + audio → MP4..."
ffmpeg -y -framerate 30 -i "$ARTIFACT_DIR/frames/frame_%05d.png" \\
  -i "$ARTIFACT_DIR/audio/combined.aac" \\
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p \\
  -c:a copy \\
  -movflags +faststart \\
  -shortest \\
  "$OUT_VIDEO" 2>&1 | tail -5

SIZE=$(du -h "$OUT_VIDEO" | cut -f1)
state "done" "MP4 ready: $OUT_VIDEO ($SIZE)"
tg "✅ *GTBank Wrapped 2025 + Audio* render complete on \`$(hostname)\`
📁 \`$OUT_VIDEO\`
🎞 $FRAME_COUNT frames + ElevenLabs voice → MP4 ($SIZE)"
`;

      return {
        plan_summary: `Render GTBank Wrapped 2025 HTML slides to MP4 with ElevenLabs audio on ${worker.id}`,
        telegram_message: `📋 *Plan: GTBank Wrapped 2025 + Audio Render*\n\n🖥 *${worker.id}* → renderer\nSteps: install_deps → install_puppeteer → generating_audio → capturing_frames → mixing_audio → encoding_video\n\n🎙 Voice: ElevenLabs \`${voiceId}\`\nArtifact: \`${aDir}/output.mp4\``,
        artifact_dir: aDir + '/',
        worker_assignments: [{ worker_id: worker.id, role: 'renderer', script }],
      };
    }

    // ── Silent render (no audio) ─────────────────────────────────────────────
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
state "installing_puppeteer" "npm install puppeteer (with bundled Chrome)"
cd "$ARTIFACT_DIR"
[ ! -d node_modules/puppeteer ] && npm install --save puppeteer 2>&1 | tail -5
CHROMIUM=$(node -e "const p=require('puppeteer'); console.log(p.executablePath ? p.executablePath() : '')" 2>/dev/null || echo "")
[ -z "$CHROMIUM" ] && CHROMIUM=$(command -v google-chrome-stable || command -v chromium-browser || command -v chromium || echo "")
[ -z "$CHROMIUM" ] && { state "failed" "No usable Chrome binary found"; exit 1; }
echo "Using Chrome: $CHROMIUM"

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
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--window-size=1280,720'],
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  let gf = 0;
  for (let slide = 1; slide <= SLIDES; slide++) {
    const url = 'file://' + path.resolve(HTML) + '?slide=' + slide;
    await page.goto(url, { waitUntil: 'networkidle0' });
    await new Promise(function(r) { setTimeout(r, 200); });
    for (let f = 0; f < FRAMES_PER_SLIDE; f++) {
      const ms = f * FRAME_MS;
      await page.evaluate(function(ms) {
        document.querySelectorAll('.slide.active').forEach(function(s) {
          s.getAnimations({subtree:true}).forEach(function(a) { try { a.currentTime = ms; } catch(e) {} });
        });
      }, ms);
      const fname = 'frame_' + String(gf).padStart(5,'0') + '.png';
      await page.screenshot({ path: path.join(OUTDIR, fname), clip: {x:0,y:0,width:1280,height:720} });
      gf++;
    }
    console.log('Slide ' + slide + ': ' + FRAMES_PER_SLIDE + ' frames');
  }
  await browser.close();
  console.log('Total frames: ' + gf);
}
main().catch(function(e) { console.error(e); process.exit(1); });
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
      const nfsKeys = getNfsKeys();
      const keysInfo = Object.entries(nfsKeys)
        .map(([k, v]) => `  ${k}: ${v ? v.slice(0, 8) + '...' : '(not set)'}  (full value in /mnt/shared/keys.json)`)
        .join('\n') || '  (none configured)';

      const prompt = `You are the master orchestrator for a fleet of Ubuntu 22.04 worker VMs.

## TASK
ID: ${task.id}
Title: ${task.title || '(none)'}
Description: ${task.description || ''}
Type: ${task.type || 'general'}
Extra: ${JSON.stringify(task.extra || {})}

## AVAILABLE WORKERS
${workerInfo}

## API KEYS (stored at /mnt/shared/keys.json on NFS — readable by all workers)
${keysInfo}
Load keys at the TOP of any script that needs them:
  ELEVENLABS_KEY=$(python3 -c "import json; print(json.load(open('/mnt/shared/keys.json')).get('elevenlabs',''))")
  [ -z "$ELEVENLABS_KEY" ] && { report "failed" "ElevenLabs key missing from /mnt/shared/keys.json"; exit 1; }
STRICT RULES — violation = task failure:
  - NEVER generate fake/placeholder audio (no sine waves, no anullsrc, no silent MP3 placeholders)
  - NEVER use solid colour video as a fallback (no color=c=green, no lavfi colour sources)
  - If ElevenLabs API returns empty/error body, exit 1 immediately — do not continue
  - If frame screenshots are empty, exit 1 — do not encode a blank video
  - Workers signal readiness via sentinel files: touch ${artifactDir}/X_ready

## ENVIRONMENT
- OS: Ubuntu 22.04, bash, Node.js 22, npm, apt-get (run non-interactive)
- NFS at /mnt/shared/ on all nodes (read/write)
- Artifact dir for this task: ${artifactDir}/
- Each worker MUST write logs to its own file: ${artifactDir}/run-WORKERID.log
  (e.g. exec > >(tee -a "${artifactDir}/run-hw-worker-1.log") 2>&1)
- MASTER API: http://159.65.205.244:3000
- TG bot token: 8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8
- TG chat: -5166727984

## HOW WORKERS REPORT PROGRESS
(bash snippet for scripts)
# Report a state change (freeform snake_case):
curl -sX POST http://159.65.205.244:3000/task/${task.id}/state -H 'Content-Type: application/json' -d '{"to":"STATE_NAME","note":"human readable note"}'

# Send telegram:
curl -s "https://api.telegram.org/bot8202032261:AAFiptoYDpznIbnSvyjPrftsyteVMXcFUz8/sendMessage" -d chat_id=-5166727984 -d text="MESSAGE" -d parse_mode=Markdown

## YOUR JOB
1. Assign a DISTINCT role to EVERY available worker — all must run in parallel with real work.
   Use sentinel files (touch ARTIFACT_DIR/X_ready) so dependent workers can poll and wait.
   Example for "narrated HTML slides video" across 4 workers:
     Worker 1 (content_generator): create all HTML/CSS slides from scratch → touch ARTIFACT_DIR/slides_ready
     Worker 2 (audio_producer): load ELEVENLABS_KEY from /mnt/shared/keys.json → call API for each slide narration → save audio/slideN.mp3 → touch ARTIFACT_DIR/audio_ready. Exit 1 if key missing or any API call returns empty file.
     Worker 3 (renderer): poll until ARTIFACT_DIR/slides_ready exists (max 5min, sleep 10) → puppeteer screenshot each HTML slide into frames/frameNNNNN.png → touch ARTIFACT_DIR/frames_ready
     Worker 4 (encoder): poll until ARTIFACT_DIR/audio_ready AND ARTIFACT_DIR/frames_ready exist (max 10min) → ffmpeg combine frames+audio → output.mp4
2. For each worker write a COMPLETE, SELF-CONTAINED bash script that:
   - Starts with #!/bin/bash and set -e
   - GENERATES all required files from scratch — never use find to locate pre-existing files unless they are explicitly provided in the task's "extra" field
   - Reports descriptive states at every step via curl to the SUBTASK ID (passed as arg 1): e.g. installing_deps → generating → rendering → encoding → done
   - IMPORTANT: The TASK_ID for state reporting must be the subtask's own ID, passed as argument 1:
     TASK_ID="\${1}"
     report() { curl -sX POST http://159.65.205.244:3000/task/\$TASK_ID/state -H 'Content-Type: application/json' -d "{\\"to\\":\\"\$1\\",\\"note\\":\\"\$2\\"}" 2>/dev/null || true; }
   - Saves all output to ${artifactDir}/
   - Reports done (or failed with note) at the end
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
      "role": "generator",
      "script": "#!/bin/bash\\nset -e\\nTASK_ID=\\"\\${1}\\"\\n# full script that generates all files from scratch\\n..."
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

      // Store artifact_dir on parent so /task/:id/logs can find run.log
      await api(`/task/${task.id}/artifact`, { artifact_dir: aDir });
      await setState(task.id, 'assigning', plan.plan_summary);
      await tg(plan.telegram_message);

      for (const asgn of plan.worker_assignments || []) {
        const scriptPath = path.join(aDir, `worker-${asgn.worker_id}.sh`);
        const workerLog = `${aDir}/run-${asgn.worker_id}.log`;
        // Inject per-worker log tee after set -e, overriding any exec > already in script
        let script = asgn.script || '';
        // Remove any existing exec > tee injections (Claude might have added one)
        script = script.replace(/exec\s*>\s*>\(tee[^\n]*\)\s*2>&1\n?/g, '');
        const setELine = script.indexOf('set -e');
        const injectAfter = setELine >= 0 ? setELine + 'set -e'.length : script.indexOf('\n') + 1;
        const logInject = `\nmkdir -p "${aDir}"\nexec > >(tee -a "${workerLog}") 2>&1\necho "[$(date -u +%H:%M:%S)] Worker ${asgn.worker_id} starting role: ${asgn.role}"\n`;
        script = script.slice(0, injectAfter) + logInject + script.slice(injectAfter);
        fs.writeFileSync(scriptPath, script, { mode: 0o755 });
        console.log(`[orch] Script → ${scriptPath} (log: ${workerLog})`);

        await api('/task', {
          title: `${label} [${asgn.role}]`,
          type: task.type || 'script',
          description: asgn.role,
          script: scriptPath,
          parent_task: task.id,
          assigned_worker: asgn.worker_id,
          artifact_dir: aDir,
          worker_log: workerLog,
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
