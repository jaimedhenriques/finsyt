#!/usr/bin/env python3
"""The Ledger -- Component 3 of Iterance.

Reads crystallized entries from stdin (piped from crystallizer.py),
stores them in ~/.iterance/ledger/ as daily markdown files with
parallel JSON records, and maintains a git-backed history with
weighted trust scores.
"""

import json
import subprocess
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from iterance.common import (
    LEDGER_DIR,
    TRUST_FILE,
    ENTRY_HEADER,
    ACTION_WEIGHTS,
    save_trust,
    load_trust,
)

# One UUID per watcher process — all events in this session share it.
SESSION_ID    = str(uuid.uuid4())
SESSION_START = time.time()
SESSION_COUNT = 0   # non-stop actions recorded this session


def init_repo() -> None:
    LEDGER_DIR.mkdir(parents=True, exist_ok=True)
    if not (LEDGER_DIR / ".git").exists():
        subprocess.run(["git", "init"], cwd=LEDGER_DIR, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "Iterance"], cwd=LEDGER_DIR, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "iterance@local"], cwd=LEDGER_DIR, check=True, capture_output=True)


def count_entries() -> tuple:
    """Return (total_count, weight_total) by scanning all markdown files."""
    total = 0
    weight_total = 0.0
    for md_file in LEDGER_DIR.glob("*.md"):
        for line in md_file.read_text().splitlines():
            if ENTRY_HEADER.match(line):
                total += 1
            elif line.startswith("ACTION "):
                parts = line.split(None, 2)
                if len(parts) >= 2:
                    weight_total += ACTION_WEIGHTS.get(parts[1], 1.0)
    return total, weight_total


def update_trust(total: int, weight_total: float) -> None:
    trust = load_trust()
    save_trust(total, trust["overrides"], weight_total, trust.get("weight_overrides", 0.0))


def append_and_commit(entry_text: str, date_str: str, action_label: str,
                      action_type: str, path: str, initiator: str,
                      timestamp_str: str, density: float = None) -> None:
    # --- markdown ---
    md_file = LEDGER_DIR / f"{date_str}.md"
    with open(md_file, "a") as f:
        if md_file.stat().st_size > 0:
            f.write("\n")
        f.write(entry_text + "\n")

    # --- JSON (NDJSON, one record per line) ---
    weight = ACTION_WEIGHTS.get(action_type, 0.0) if action_type == "watcher_stopped" \
        else ACTION_WEIGHTS.get(action_type, 1.0)
    json_entry = {
        "timestamp": timestamp_str.replace(" ", "T"),
        "action": action_type,
        "path": path or None,
        "initiator": initiator,
        "session_id": SESSION_ID,
        "weight": weight,
    }
    if density is not None:
        json_entry["density"] = round(density, 4)
    json_file = LEDGER_DIR / f"{date_str}.json"
    with open(json_file, "a") as f:
        f.write(json.dumps(json_entry) + "\n")

    # --- git commit (both files together) ---
    subprocess.run(
        ["git", "add", md_file.name, json_file.name],
        cwd=LEDGER_DIR, check=True, capture_output=True,
    )
    subprocess.run(
        ["git", "commit", "-m", action_label],
        cwd=LEDGER_DIR, check=True, capture_output=True,
    )


def parse_entry(lines: list) -> tuple | None:
    """Return (date_str, action_label, action_type, path, initiator, timestamp_str, entry_text)."""
    if not lines:
        return None
    header = lines[0].strip()
    m = ENTRY_HEADER.match(header)
    if not m:
        return None

    timestamp_str = m.group(1)          # "YYYY-MM-DD HH:MM:SS"
    date_str = timestamp_str[:10]        # "YYYY-MM-DD"
    entry_text = "\n".join(lines)
    action_type = "unknown"
    path = ""
    initiator = "agent"

    if len(lines) >= 2:
        second = lines[1]
        if second.startswith("ACTION"):
            parts = second.split(None, 2)
            action_type = parts[1] if len(parts) >= 2 else "unknown"
            path = parts[2] if len(parts) >= 3 else ""
            action_label = f"{action_type} {path}".strip() if path else action_type
        elif "WATCHER STOPPED" in second:
            action_type = "watcher_stopped"
            action_label = "watcher stopped"
        else:
            action_label = "unknown event"
    else:
        action_label = "unknown event"

    for line in lines[1:]:
        if line.startswith("INITIATED"):
            parts = line.split(None, 1)
            initiated_str = parts[1] if len(parts) > 1 else ""
            initiator = "user" if "by user" in initiated_str else "agent"
            break

    return date_str, action_label, action_type, path, initiator, timestamp_str, entry_text


def process(buffer: list) -> None:
    global SESSION_COUNT
    result = parse_entry(buffer)
    if not result:
        return
    date_str, action_label, action_type, path, initiator, timestamp_str, entry_text = result

    density = None
    if action_type == "watcher_stopped":
        elapsed_min = max(0.001, (time.time() - SESSION_START) / 60.0)
        density = SESSION_COUNT / elapsed_min
    else:
        SESSION_COUNT += 1

    append_and_commit(entry_text, date_str, action_label, action_type, path, initiator,
                      timestamp_str, density=density)
    total, weight_total = count_entries()
    update_trust(total, weight_total)
    print(f"[LEDGER] committed: {action_label}", flush=True)


def main():
    global SESSION_ID
    init_repo()
    buffer = []
    for line in sys.stdin:
        stripped = line.rstrip("\n")
        if stripped.startswith("SESSION_BOUNDARY "):
            # Flush pending buffer before rotating
            if buffer:
                process(buffer)
                buffer = []
            parts = stripped.split()
            if len(parts) == 2:
                SESSION_ID = parts[1]
            continue
        if stripped == "":
            if buffer:
                process(buffer)
                buffer = []
        else:
            buffer.append(stripped)
    if buffer:
        process(buffer)


if __name__ == "__main__":
    main()
