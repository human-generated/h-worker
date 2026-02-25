#!/usr/bin/env python3
"""
nanoclaw manager — FastAPI HTTP server on port 9200
Manages the nanoclaw openclaw gateway agent pool on each worker.
"""
import os, json, time, subprocess, signal, shutil, socket
from pathlib import Path
from typing import Optional
import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
import uvicorn

app = FastAPI(title="nanoclaw-manager")

OPENCLAW_BASE = Path("/opt/nanoclaw/agents")
ZEROCLAW_BIN  = "/usr/local/bin/zeroclaw"
PORT_BASE     = 42617
MAX_AGENTS    = 100
WORKER_ID     = os.environ.get("WORKER_ID", socket.gethostname())

# Prometheus counters (simple in-memory)
_prom = {
    "validations_pass": 0,
    "validations_fail": 0,
    "validation_durations": [],
}

def _agent_dirs():
    OPENCLAW_BASE.mkdir(parents=True, exist_ok=True)
    return sorted([d for d in OPENCLAW_BASE.iterdir() if d.is_dir() and d.name.startswith("nano-")])

def _port_from_dir(d: Path) -> int:
    return int(d.name.split("-")[1])

def _pid_for_port(port: int) -> Optional[int]:
    pid_file = OPENCLAW_BASE / f"nano-{port}" / "gateway.pid"
    if pid_file.exists():
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, 0)  # check alive
            return pid
        except (ValueError, ProcessLookupError, PermissionError):
            return None
    # fallback: search by cmdline
    try:
        out = subprocess.check_output(
            ["pgrep", "-f", f"openclaw gateway --port {port}"],
            stderr=subprocess.DEVNULL
        ).decode().strip()
        if out:
            return int(out.split()[0])
    except Exception:
        pass
    return None

def _current_task(port: int) -> Optional[str]:
    """Try to read current task from state dir."""
    state_dir = OPENCLAW_BASE / f"nano-{port}"
    for fname in ["current_task.txt", "task.txt"]:
        f = state_dir / fname
        if f.exists():
            try:
                return f.read_text().strip()
            except Exception:
                pass
    return None

def _agent_info(port: int) -> dict:
    pid = _pid_for_port(port)
    return {
        "port": port,
        "pid": pid,
        "state": "running" if pid else "stopped",
        "current_task": _current_task(port),
        "state_dir": str(OPENCLAW_BASE / f"nano-{port}"),
        "token": f"nanoclaw-{port}",
    }

def _next_free_port() -> int:
    used = set()
    for d in _agent_dirs():
        used.add(_port_from_dir(d))
    for i in range(MAX_AGENTS):
        p = PORT_BASE + i
        if p not in used:
            return p
    raise RuntimeError("All agent slots used")

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "worker": WORKER_ID}

@app.get("/agents")
def list_agents():
    agents = []
    for d in _agent_dirs():
        port = _port_from_dir(d)
        agents.append(_agent_info(port))
    return {"agents": agents, "total": len(agents), "worker": WORKER_ID}

@app.post("/agents")
def spawn_agent():
    current = len(_agent_dirs())
    if current >= MAX_AGENTS:
        raise HTTPException(status_code=429, detail="Agent pool full (max 100)")
    port = _next_free_port()
    state_dir = OPENCLAW_BASE / f"nano-{port}"
    state_dir.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [ZEROCLAW_BIN, "daemon", "--port", str(port)],
        capture_output=True, text=True, timeout=15
    )
    if result.returncode != 0 and "already running" not in result.stdout:
        raise HTTPException(status_code=500, detail=f"zeroclaw failed: {result.stderr or result.stdout}")
    return {"ok": True, "agent": _agent_info(port)}

@app.delete("/agents/{port}")
def stop_agent(port: int):
    result = subprocess.run(
        [ZEROCLAW_BIN, "stop", "--port", str(port)],
        capture_output=True, text=True, timeout=10
    )
    state_dir = OPENCLAW_BASE / f"nano-{port}"
    if state_dir.exists():
        pid_file = state_dir / "gateway.pid"
        pid_file.unlink(missing_ok=True)
    return {"ok": True, "output": result.stdout.strip()}

@app.post("/agents/{port}/validate")
async def validate_agent(port: int, request: Request):
    """Pre-flight validation for a task step."""
    t0 = time.time()
    body = await request.json()
    task_id  = body.get("task_id", "")
    step     = body.get("step", "")
    inputs   = body.get("inputs", [])
    req_keys = body.get("required_keys", [])
    prev_sentinels = body.get("prev_sentinels", [])

    checks = []

    # 1. Agent is running
    pid = _pid_for_port(port)
    checks.append({
        "name": "agent_running",
        "pass": pid is not None,
        "detail": f"pid={pid}" if pid else "agent not running"
    })

    # 2. Required input files exist and non-empty
    for inp in inputs:
        p = Path(inp)
        exists = p.exists() and p.stat().st_size > 0
        checks.append({
            "name": f"input_file:{inp}",
            "pass": exists,
            "detail": f"size={p.stat().st_size}" if p.exists() else "missing"
        })

    # 3. Required keys present in /mnt/shared/keys.json
    if req_keys:
        keys_file = Path("/mnt/shared/keys.json")
        loaded_keys = {}
        if keys_file.exists():
            try:
                loaded_keys = json.loads(keys_file.read_text())
            except Exception:
                pass
        for k in req_keys:
            present = k in loaded_keys and bool(loaded_keys[k])
            checks.append({
                "name": f"key:{k}",
                "pass": present,
                "detail": "present" if present else "missing or empty"
            })

    # 4. Disk space >500MB free on /mnt/shared
    try:
        st = shutil.disk_usage("/mnt/shared")
        free_mb = st.free // (1024 * 1024)
        checks.append({
            "name": "disk_space",
            "pass": free_mb > 500,
            "detail": f"{free_mb}MB free on /mnt/shared"
        })
    except Exception as e:
        checks.append({"name": "disk_space", "pass": False, "detail": str(e)})

    # 5. Previous step sentinel files exist
    for sentinel in prev_sentinels:
        p = Path(sentinel)
        checks.append({
            "name": f"sentinel:{sentinel}",
            "pass": p.exists(),
            "detail": "present" if p.exists() else "missing"
        })

    ok = all(c["pass"] for c in checks)
    duration_ms = int((time.time() - t0) * 1000)

    # Update Prometheus counters
    if ok:
        _prom["validations_pass"] += 1
    else:
        _prom["validations_fail"] += 1
    _prom["validation_durations"].append(time.time() - t0)
    # Keep last 1000 only
    if len(_prom["validation_durations"]) > 1000:
        _prom["validation_durations"] = _prom["validation_durations"][-1000:]

    return {"ok": ok, "checks": checks, "duration_ms": duration_ms, "task_id": task_id, "step": step}

@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    agents = []
    for d in _agent_dirs():
        port = _port_from_dir(d)
        agents.append(_agent_info(port))

    total   = len(agents)
    active  = sum(1 for a in agents if a["state"] == "running")
    val_pass = _prom["validations_pass"]
    val_fail = _prom["validations_fail"]
    durations = _prom["validation_durations"]

    # Histogram buckets for validation duration
    buckets = [0.01, 0.05, 0.1, 0.5, 1.0, 5.0, float("inf")]
    bucket_counts = []
    for b in buckets:
        count = sum(1 for d in durations if d <= b)
        bucket_counts.append(count)

    lines = []
    lines.append(f'# HELP nanoclaw_agents_total Total nano agents configured')
    lines.append(f'# TYPE nanoclaw_agents_total gauge')
    lines.append(f'nanoclaw_agents_total{{worker="{WORKER_ID}"}} {total}')

    lines.append(f'# HELP nanoclaw_agents_active Active (running) nano agents')
    lines.append(f'# TYPE nanoclaw_agents_active gauge')
    lines.append(f'nanoclaw_agents_active{{worker="{WORKER_ID}"}} {active}')

    lines.append(f'# HELP nanoclaw_validations_total Total pre-flight validations run')
    lines.append(f'# TYPE nanoclaw_validations_total counter')
    lines.append(f'nanoclaw_validations_total{{worker="{WORKER_ID}",result="pass"}} {val_pass}')
    lines.append(f'nanoclaw_validations_total{{worker="{WORKER_ID}",result="fail"}} {val_fail}')

    lines.append(f'# HELP nanoclaw_validation_duration_seconds Validation duration histogram')
    lines.append(f'# TYPE nanoclaw_validation_duration_seconds histogram')
    sum_dur = sum(durations)
    bucket_labels = ["0.01","0.05","0.1","0.5","1.0","5.0","+Inf"]
    for label, count in zip(bucket_labels, bucket_counts):
        lines.append(f'nanoclaw_validation_duration_seconds_bucket{{worker="{WORKER_ID}",le="{label}"}} {count}')
    lines.append(f'nanoclaw_validation_duration_seconds_sum{{worker="{WORKER_ID}"}} {sum_dur:.6f}')
    lines.append(f'nanoclaw_validation_duration_seconds_count{{worker="{WORKER_ID}"}} {len(durations)}')

    # hw_task_info — read from shared state
    try:
        state = json.loads(Path("/mnt/shared/hw_state.json").read_text())
        for task in state.get("tasks", [])[-50:]:  # last 50 tasks
            tid = task.get("id","").replace('"','')
            status = task.get("status","").replace('"','')
            worker = task.get("worker","").replace('"','')
            lines.append(f'hw_task_info{{task_id="{tid}",status="{status}",worker="{worker}"}} 1')
    except Exception:
        pass

    # hw_artifact_size_bytes — scan artifact dirs
    artifact_base = Path("/mnt/shared/artifacts")
    if artifact_base.exists():
        for task_dir in list(artifact_base.iterdir())[:20]:
            if not task_dir.is_dir():
                continue
            tid = task_dir.name
            for f in task_dir.iterdir():
                if f.is_file():
                    art = f.name.replace('"','')
                    lines.append(f'hw_artifact_size_bytes{{task_id="{tid}",artifact="{art}"}} {f.stat().st_size}')

    return "\n".join(lines) + "\n"

if __name__ == "__main__":
    import sys
    port = int(os.environ.get("MANAGER_PORT", 9200))
    print(f"nanoclaw-manager starting on :{port} worker={WORKER_ID}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
