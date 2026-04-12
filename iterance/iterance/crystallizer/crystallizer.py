#!/usr/bin/env python3
"""The Crystallizer -- Component 2 of Iterance.

Reads JSON events from stdin (piped from watcher.py) and prints
human-readable ledger entries to stdout.
"""

import fnmatch
import json
import os
import select
import sys
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

IGNORE_FILE = Path.home() / ".iterance" / "ignore.conf"
LOOP_THRESHOLD  = 3     # same action + path ≥ N times …
LOOP_WINDOW_SEC = 60    # … within this many seconds = loop
IDLE_TIMEOUT    = int(os.environ.get("ITERANCE_IDLE_TIMEOUT", "300"))  # seconds

DEFAULT_IGNORE = """\
.git/
*.swp
*.tmp
*.lock
*.pyc
__pycache__/
node_modules/
.vscode/
.idea/
.DS_Store
"""


def load_ignore_patterns() -> list:
    if not IGNORE_FILE.exists():
        IGNORE_FILE.parent.mkdir(parents=True, exist_ok=True)
        IGNORE_FILE.write_text(DEFAULT_IGNORE)
    patterns = []
    for line in IGNORE_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            patterns.append(line)
    extra = os.environ.get("ITERANCE_EXTRA_IGNORE", "")
    if extra:
        for p in extra.split(","):
            p = p.strip()
            if p:
                patterns.append(p)
    return patterns


def should_skip(path: str, patterns: list) -> bool:
    if not path:
        return False
    if ".tmp." in path:
        return True
    basename = os.path.basename(path)
    for pat in patterns:
        if pat.endswith("/"):
            dir_name = pat.rstrip("/")
            if dir_name in set(Path(path).parts):
                return True
        else:
            if fnmatch.fnmatch(basename, pat):
                return True
            if fnmatch.fnmatch(path, pat):
                return True
    return False


def parse_timestamp(ts: str) -> str:
    dt = datetime.fromisoformat(ts).astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def crystallize(event: dict) -> str:
    event_type = event.get("event_type", "unknown")
    timestamp = parse_timestamp(event["timestamp"])
    path = event.get("path")
    sanctioned = event.get("sanctioned", False)

    if event_type == "watcher_died":
        return f"[{timestamp}]\nWATCHER STOPPED -- the observer exited unexpectedly. No further events will be recorded."

    initiated = "by user" if sanctioned else "autonomous"

    return (
        f"[{timestamp}]\n"
        f"ACTION     {event_type} {path}\n"
        f"INITIATED  {initiated}\n"
        f"OUTCOME    observed"
    )


def main():
    patterns = load_ignore_patterns()
    # path -> epoch time of last "created" event, for deduplication
    recent_creates: dict = {}
    # (action, path) -> list of monotonic timestamps in the current window
    loop_history: dict = defaultdict(list)
    # (action, path) -> set of window-start timestamps already reported
    loop_reported: set = set()

    while True:
        ready, _, _ = select.select([sys.stdin], [], [], IDLE_TIMEOUT)
        if not ready:
            # No event for IDLE_TIMEOUT seconds — emit session boundary
            boundary_uuid = str(uuid.uuid4())
            print(f"SESSION_BOUNDARY {boundary_uuid}", flush=True)
            continue
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        event_type = event.get("event_type")
        path = event.get("path") or ""

        if event_type != "watcher_died":
            if os.path.isdir(path):
                continue
            if should_skip(path, patterns):
                continue

        now = time.monotonic()

        # Deduplication: skip a modified event that fires within 1 second
        # of a created event on the same path (watchdog double-fire).
        if event_type == "created":
            recent_creates[path] = now
        elif event_type == "modified":
            create_time = recent_creates.get(path)
            if create_time is not None and (now - create_time) < 1.0:
                continue

        # Loop detection: same (action, path) ≥ LOOP_THRESHOLD times in LOOP_WINDOW_SEC
        if event_type not in ("watcher_died",):
            key = (event_type, path)
            times = loop_history[key]
            times.append(now)
            # Prune timestamps outside the window
            cutoff = now - LOOP_WINDOW_SEC
            times[:] = [t for t in times if t >= cutoff]
            if len(times) >= LOOP_THRESHOLD:
                # Emit a loop_detected entry once per window start boundary
                window_start = round(times[0], 1)
                report_key = (key, window_start)
                if report_key not in loop_reported:
                    loop_reported.add(report_key)
                    ts_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                    loop_entry = (
                        f"[{ts_str}]\n"
                        f"ACTION     loop_detected {path}\n"
                        f"INITIATED  autonomous\n"
                        f"OUTCOME    loop: {event_type} on {path} repeated "
                        f"{len(times)}x in {LOOP_WINDOW_SEC}s"
                    )
                    print(loop_entry)
                    print(flush=True)

        # Output entry followed immediately by a blank line so the ledger
        # flushes each entry as soon as it arrives rather than waiting for
        # the next event. This prevents the last entry in a session from
        # being lost when the pipeline is stopped.
        print(crystallize(event))
        print(flush=True)


if __name__ == "__main__":
    main()
