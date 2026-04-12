#!/usr/bin/env python3
"""Shared constants and utilities for Iterance components."""

import json
import re
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path


LEDGER_DIR = Path.home() / ".iterance" / "ledger"
TRUST_FILE = Path.home() / ".iterance" / "trust.json"
ENTRY_HEADER = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]$")

# Action weights for trust score — more destructive actions carry more weight.
ACTION_WEIGHTS = {
    "created":          0.8,
    "modified":         1.0,
    "deleted":          1.5,
    "moved":            1.2,
    "loop_detected":    0.0,   # diagnostic only
    "shell_destructive": 2.0,  # rm, dd, shred, mkfs …
    "shell_network":    1.5,   # curl, wget, ssh, git push …
    "shell_read":       0.3,   # cat, grep, ls …
    "shell_exec":       1.0,   # everything else
}

# Shell command classification
_DESTRUCTIVE_CMDS = frozenset({
    "rm", "rmdir", "shred", "dd", "mkfs", "format", "fdisk", "parted",
    "wipefs", "truncate", "mv",  # mv can destroy files by overwrite
})
_NETWORK_CMDS = frozenset({
    "curl", "wget", "ssh", "scp", "rsync", "nc", "netcat", "ftp", "sftp",
    "git",  # git push / git clone etc.
    "npm", "pip", "docker", "kubectl", "aws", "gcloud",
})
_READ_CMDS = frozenset({
    "cat", "less", "more", "head", "tail", "grep", "find", "ls", "ll",
    "rg", "ag", "awk", "sed", "sort", "uniq", "wc", "diff",
})


def classify_shell_cmd(cmd: str) -> str:
    """Return the shell action type for a command string."""
    if not cmd:
        return "shell_exec"
    # Strip leading env assignments and sudo
    parts = cmd.strip().split()
    # skip leading env=... tokens
    while parts and "=" in parts[0] and parts[0][0].isalpha():
        parts = parts[1:]
    if not parts:
        return "shell_exec"
    # strip sudo/env wrappers
    while parts and parts[0] in ("sudo", "env", "nice", "nohup", "time", "xargs"):
        parts = parts[1:]
    if not parts:
        return "shell_exec"
    base = parts[0].lower()
    # strip path prefix (e.g. /usr/bin/rm -> rm)
    base = base.rsplit("/", 1)[-1]

    if base in _DESTRUCTIVE_CMDS:
        return "shell_destructive"
    if base in _NETWORK_CMDS:
        # Refine: git fetch/pull/status are reads; only destructive/network verbs count
        if base == "git" and len(parts) > 1 and parts[1] in ("status", "log", "diff",
                                                               "show", "blame", "fetch"):
            return "shell_read"
        return "shell_network"
    if base in _READ_CMDS:
        return "shell_read"
    return "shell_exec"


def _ensure_ledger_git() -> None:
    """Initialize ledger git repo if not already done."""
    LEDGER_DIR.mkdir(parents=True, exist_ok=True)
    if not (LEDGER_DIR / ".git").exists():
        subprocess.run(["git", "init"], cwd=LEDGER_DIR, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "Iterance"],
                       cwd=LEDGER_DIR, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "iterance@local"],
                       cwd=LEDGER_DIR, check=True, capture_output=True)


def write_ledger_entry_direct(action_type: str, path: str, initiator: str = "user",
                               session_id: str = None) -> None:
    """Write a single entry directly to the ledger (markdown + JSON + git commit).

    Used by shell command interceptors that bypass the watcher pipeline.
    """
    _ensure_ledger_git()
    if session_id is None:
        session_id = str(uuid.uuid4())

    now = datetime.now(timezone.utc)
    ts_str = now.strftime("%Y-%m-%d %H:%M:%S")
    iso_str = now.strftime("%Y-%m-%dT%H:%M:%S")
    date_str = now.strftime("%Y-%m-%d")
    weight = ACTION_WEIGHTS.get(action_type, 1.0)
    action_label = f"{action_type} {path}".strip()

    # Markdown entry
    md_text = (
        f"[{ts_str}]\n"
        f"ACTION     {action_type} {path}\n"
        f"INITIATED  {initiator}\n"
        f"OUTCOME    observed"
    )
    md_file = LEDGER_DIR / f"{date_str}.md"
    with open(md_file, "a") as f:
        if md_file.stat().st_size > 0:
            f.write("\n")
        f.write(md_text + "\n")

    # JSON entry
    json_entry = {
        "timestamp": iso_str,
        "action": action_type,
        "path": path or None,
        "initiator": initiator,
        "session_id": session_id,
        "weight": weight,
    }
    json_file = LEDGER_DIR / f"{date_str}.json"
    with open(json_file, "a") as f:
        f.write(json.dumps(json_entry) + "\n")

    # Git commit
    subprocess.run(["git", "add", md_file.name, json_file.name],
                   cwd=LEDGER_DIR, check=True, capture_output=True)
    subprocess.run(["git", "commit", "-m", action_label],
                   cwd=LEDGER_DIR, check=True, capture_output=True)

    # Update trust
    total = 0
    weight_total = 0.0
    for mf in LEDGER_DIR.glob("*.md"):
        for line in mf.read_text().splitlines():
            if ENTRY_HEADER.match(line):
                total += 1
            elif line.startswith("ACTION "):
                parts = line.split(None, 2)
                if len(parts) >= 2:
                    weight_total += ACTION_WEIGHTS.get(parts[1], 1.0)
    trust = load_trust()
    save_trust(total, trust["overrides"], weight_total, trust.get("weight_overrides", 0.0))


def load_trust() -> dict:
    if TRUST_FILE.exists():
        try:
            data = json.loads(TRUST_FILE.read_text())
            data.setdefault("weight_total", 0.0)
            data.setdefault("weight_overrides", 0.0)
            return data
        except (json.JSONDecodeError, OSError):
            pass
    return {"score": 1.0, "total": 0, "overrides": 0, "weight_total": 0.0, "weight_overrides": 0.0}


def save_trust(total: int, overrides: int,
               weight_total: float = None, weight_overrides: float = None) -> None:
    # Preserve existing weight fields when callers don't supply them.
    if weight_total is None or weight_overrides is None:
        existing: dict = {}
        if TRUST_FILE.exists():
            try:
                existing = json.loads(TRUST_FILE.read_text())
            except Exception:
                pass
        if weight_total is None:
            weight_total = existing.get("weight_total", 0.0)
        if weight_overrides is None:
            weight_overrides = existing.get("weight_overrides", 0.0)

    if weight_total > 0:
        score = max(0.0, 1.0 - (weight_overrides / weight_total))
    elif total > 0:
        score = (total - overrides) / total
    else:
        score = 1.0

    TRUST_FILE.parent.mkdir(parents=True, exist_ok=True)
    TRUST_FILE.write_text(
        json.dumps({
            "score": score,
            "total": total,
            "overrides": overrides,
            "weight_total": round(weight_total, 4),
            "weight_overrides": round(weight_overrides, 4),
        }, indent=2) + "\n"
    )


def parse_entry_lines(lines: list) -> dict | None:
    if not lines:
        return None
    m = ENTRY_HEADER.match(lines[0])
    if not m:
        return None

    entry = {
        "timestamp": m.group(1),
        "date": m.group(1)[:10],
        "action": None,
        "path": None,
        "initiated": None,
        "watcher_died": False,
    }

    for line in lines[1:]:
        if line.startswith("ACTION"):
            parts = line.split(None, 2)
            entry["action"] = parts[1] if len(parts) > 1 else "unknown"
            entry["path"] = parts[2] if len(parts) > 2 else ""
        elif line.startswith("INITIATED"):
            parts = line.split(None, 1)
            entry["initiated"] = parts[1] if len(parts) > 1 else ""
        elif "WATCHER STOPPED" in line:
            entry["watcher_died"] = True

    return entry


def load_entries_from_file(md_file: Path) -> list:
    entries = []
    current = []
    for line in md_file.read_text().splitlines():
        if line == "" and current:
            parsed = parse_entry_lines(current)
            if parsed:
                entries.append(parsed)
            current = []
        else:
            current.append(line)
    if current:
        parsed = parse_entry_lines(current)
        if parsed:
            entries.append(parsed)
    return entries
