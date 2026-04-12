#!/usr/bin/env python3
"""Iterance CLI -- unified entry point for all Iterance commands.

Usage:
  iterance watch <directory>
  iterance report
  iterance reflect
  iterance log [--date YYYY-MM-DD]
  iterance trust
  iterance override
  iterance doctor
  iterance howto
"""

import json
import os
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SESSION_GAP_SECONDS = 5 * 60   # 5-minute silence = new logical session

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iterance.common import (
    LEDGER_DIR,
    TRUST_FILE,
    load_trust,
    save_trust,
    load_entries_from_file,
    classify_shell_cmd,
    write_ledger_entry_direct,
)

SCRIPTS = Path(__file__).parent
PYTHON = sys.executable
ITERANCE_DIR = Path.home() / ".iterance"
PID_FILE = ITERANCE_DIR / "watch.pid"
DIR_FILE = ITERANCE_DIR / "watch.dir"
START_FILE = ITERANCE_DIR / "watch.start"
COUNT_FILE = ITERANCE_DIR / "watch.count0"


# ---------------------------------------------------------------------------
# watch
# ---------------------------------------------------------------------------

def cmd_watch(args):
    background = False
    ignore_patterns = []
    remaining = []
    i = 0
    while i < len(args):
        if args[i] == "--background":
            background = True
            i += 1
        elif args[i] == "--ignore" and i + 1 < len(args):
            ignore_patterns.append(args[i + 1])
            i += 2
        else:
            remaining.append(args[i])
            i += 1

    if not remaining:
        print("Usage: iterance watch <directory>", file=sys.stderr)
        sys.exit(1)

    target = str(Path(remaining[0]).resolve())
    if not Path(target).exists():
        print(f"Error: directory not found: {target}", file=sys.stderr)
        sys.exit(1)

    watcher = SCRIPTS / "watcher" / "watcher.py"
    crystallizer = SCRIPTS / "crystallizer" / "crystallizer.py"
    ledger = SCRIPTS / "ledger" / "ledger.py"

    env = os.environ.copy()
    if ignore_patterns:
        env["ITERANCE_EXTRA_IGNORE"] = ",".join(ignore_patterns)

    devnull = subprocess.DEVNULL if background else None
    session = background  # start_new_session detaches from terminal

    p1 = subprocess.Popen(
        [PYTHON, str(watcher), target],
        stdout=subprocess.PIPE,
        stderr=devnull,
        start_new_session=session,
        env=env,
    )
    p2 = subprocess.Popen(
        [PYTHON, str(crystallizer)],
        stdin=p1.stdout,
        stdout=subprocess.PIPE,
        stderr=devnull,
        start_new_session=session,
        env=env,
    )
    p1.stdout.close()
    p3 = subprocess.Popen(
        [PYTHON, str(ledger)],
        stdin=p2.stdout,
        stdout=devnull,
        stderr=devnull,
        start_new_session=session,
        env=env,
    )
    p2.stdout.close()

    if background:
        ITERANCE_DIR.mkdir(parents=True, exist_ok=True)
        # First line = ledger PID (primary); remaining = watcher, crystallizer
        PID_FILE.write_text(f"{p3.pid}\n{p1.pid}\n{p2.pid}\n")
        DIR_FILE.write_text(target)
        START_FILE.write_text(str(datetime.now(timezone.utc).timestamp()))
        COUNT_FILE.write_text(str(load_trust()["total"]))
        print(f"[Iterance] watching {target} in background. Run iterance stop to end.")
        return

    try:
        while True:
            time.sleep(2)
            if p1.poll() is not None:
                print("[Iterance] watcher stopped unexpectedly. Run iterance watch again.")
                for p in (p2, p3):
                    try:
                        p.terminate()
                    except Exception:
                        pass
                break
    except KeyboardInterrupt:
        for p in (p1, p2, p3):
            try:
                p.terminate()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------

def cmd_report(_args):
    subprocess.run([PYTHON, str(SCRIPTS / "witness" / "witness.py")])


# ---------------------------------------------------------------------------
# reflect
# ---------------------------------------------------------------------------

def cmd_reflect(_args):
    subprocess.run([PYTHON, str(SCRIPTS / "reflector" / "reflector.py")])


# ---------------------------------------------------------------------------
# log
# ---------------------------------------------------------------------------

def cmd_log(args):
    date_str = None
    last_n = None
    since_seconds = None
    show_files = False
    show_summary = False

    i = 0
    while i < len(args):
        if args[i] == "--date" and i + 1 < len(args):
            date_str = args[i + 1]
            i += 2
        elif args[i] == "--last" and i + 1 < len(args):
            try:
                last_n = int(args[i + 1])
            except ValueError:
                print(f"  Invalid --last value: {args[i + 1]}", file=sys.stderr)
                sys.exit(1)
            i += 2
        elif args[i] == "--since" and i + 1 < len(args):
            val = args[i + 1]
            try:
                if val.endswith("m"):
                    since_seconds = int(val[:-1]) * 60
                elif val.endswith("h"):
                    since_seconds = int(val[:-1]) * 3600
                else:
                    raise ValueError
            except ValueError:
                print(f"  Invalid --since value: {val} (use Xm or Xh)", file=sys.stderr)
                sys.exit(1)
            i += 2
        elif args[i] == "--files":
            show_files = True
            i += 1
        elif args[i] == "--summary":
            show_summary = True
            i += 1
        else:
            i += 1

    if date_str:
        md_file = LEDGER_DIR / f"{date_str}.md"
        if not md_file.exists():
            print(f"  No ledger for {date_str}.")
            return
    else:
        candidates = sorted(LEDGER_DIR.glob("*.md")) if LEDGER_DIR.exists() else []
        if not candidates:
            print("  No ledger entries found.")
            return
        md_file = candidates[-1]
        date_str = md_file.stem

    entries = load_entries_from_file(md_file)
    entries = [e for e in entries if ".tmp" not in (e.get("path") or "")]
    if not entries:
        print(f"  No entries for {date_str}.")
        return

    # --since filter
    if since_seconds is not None:
        cutoff = datetime.now().timestamp() - since_seconds
        entries = [
            e for e in entries
            if (_parse_timestamp_to_seconds(e["timestamp"]) or 0) >= cutoff
        ]

    # --last or default 20
    if last_n is not None:
        entries = entries[-last_n:]
    elif since_seconds is None and not show_files and not show_summary:
        entries = entries[-20:]

    # --files mode
    if show_files:
        paths = sorted(set(e["path"] for e in entries if not e["watcher_died"] and e["path"]))
        for p in paths:
            print(p)
        return

    # --summary mode
    if show_summary:
        counts = Counter(e["action"] for e in entries if not e["watcher_died"] and e["action"])
        for action, count in sorted(counts.items()):
            print(f"  {action}: {count}")
        return

    # default display
    normal_count = sum(1 for e in entries if not e["watcher_died"])
    print(f"  {date_str}  ({normal_count} entries)")
    print()
    for e in entries:
        if e["watcher_died"]:
            print(f"  {e['timestamp']}  WATCHER STOPPED")
        else:
            print(f"  {e['timestamp']}  {e['action']}  {e['path']}")


# ---------------------------------------------------------------------------
# trust
# ---------------------------------------------------------------------------

def cmd_trust(_args):
    trust = load_trust()
    score_pct = int(trust["score"] * 100)
    total = trust["total"]
    overrides = trust["overrides"]
    print(f"  Trust: {score_pct}%  ·  {total} action{'s' if total != 1 else ''}  ·  {overrides} override{'s' if overrides != 1 else ''}")


# ---------------------------------------------------------------------------
# override
# ---------------------------------------------------------------------------

def _find_most_recent_entries():
    """Return (md_file, entries) for the most recent ledger file with entries."""
    if not LEDGER_DIR.exists():
        return None, []
    candidates = sorted(LEDGER_DIR.glob("*.md"))
    for md_file in reversed(candidates):
        entries = load_entries_from_file(md_file)
        normal = [e for e in entries if not e["watcher_died"]]
        if normal:
            return md_file, normal
    return None, []


def _mark_override_in_file(md_file: Path, entry: dict) -> bool:
    """Insert [OVERRIDE] line into the entry block matching entry['timestamp']."""
    text = md_file.read_text()
    lines = text.splitlines()

    target_header = f"[{entry['timestamp']}]"
    result = []
    i = 0
    found = False

    while i < len(lines):
        result.append(lines[i])
        if lines[i] == target_header and not found:
            # Collect the rest of this entry block
            i += 1
            while i < len(lines) and lines[i] != "":
                result.append(lines[i])
                i += 1
            result.append("[OVERRIDE] marked by user")
            found = True
            continue
        i += 1

    if not found:
        return False

    md_file.write_text("\n".join(result) + "\n")
    return True


def _mark_override_in_json(md_file: Path, entry: dict) -> bool:
    """Set sanctioned=true on the JSON record matching entry['timestamp']."""
    json_file = md_file.with_suffix(".json")
    if not json_file.exists():
        return False
    target_ts = entry["timestamp"].replace(" ", "T")
    lines = json_file.read_text().splitlines()
    new_lines = []
    found = False
    for line in lines:
        stripped = line.strip()
        if not stripped:
            new_lines.append(line)
            continue
        try:
            rec = json.loads(stripped)
            if not found and rec.get("timestamp") == target_ts and not rec.get("sanctioned"):
                rec["sanctioned"] = True
                new_lines.append(json.dumps(rec))
                found = True
            else:
                new_lines.append(line)
        except json.JSONDecodeError:
            new_lines.append(line)
    if found:
        content = "\n".join(new_lines)
        if not content.endswith("\n"):
            content += "\n"
        json_file.write_text(content)
    return found


def _truncate_path(path, maxlen=55):
    if path and len(path) > maxlen:
        return "..." + path[-(maxlen - 3):]
    return path or ""


def _parse_timestamp_to_seconds(ts):
    """Return the entry timestamp as a float (epoch seconds) for proximity math."""
    try:
        from datetime import datetime
        return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").timestamp()
    except Exception:
        return None


def _build_context(all_entries, target_entry, window=60):
    """Return entries within `window` seconds of target, labeled before/after."""
    t0 = _parse_timestamp_to_seconds(target_entry["timestamp"])
    if t0 is None:
        return []
    context = []
    for e in all_entries:
        if e is target_entry or e["watcher_died"]:
            continue
        t = _parse_timestamp_to_seconds(e["timestamp"])
        if t is None:
            continue
        diff = t - t0
        if -window <= diff <= window and diff != 0:
            label = "before" if diff < 0 else "after "
            context.append((label, abs(diff), e))
    context.sort(key=lambda x: x[1])
    return context[:3]


def _get_entry_weight_from_json(md_file: Path, entry: dict) -> float:
    """Look up the weight of a ledger entry from the parallel JSON file."""
    json_file = md_file.with_suffix(".json")
    if not json_file.exists():
        return 1.0
    target_ts = entry["timestamp"].replace(" ", "T")
    try:
        with open(json_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                    if record.get("timestamp") == target_ts:
                        return float(record.get("weight", 1.0))
                except (json.JSONDecodeError, ValueError):
                    continue
    except OSError:
        pass
    return 1.0


def cmd_override(_args):
    md_file, entries = _find_most_recent_entries()
    if not entries:
        print("No entries to override.")
        return

    last10 = entries[-10:]
    PANEL = "─" * 44

    while True:
        # ── STAGE 1: list ──────────────────────────────
        print()
        print("  Recent agent actions -- enter a number to inspect, q to quit")
        print()
        for idx, e in enumerate(last10, start=1):
            display_path = _truncate_path(e["path"])
            print(f"  {idx:2}.  {e['timestamp']}  {e['action']:<8}  {display_path}")
        print()

        try:
            raw = input("  Inspect entry number [1-{}/q]: ".format(len(last10))).strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if not raw or raw.lower() == "q":
            return

        try:
            choice = int(raw)
        except ValueError:
            print("  Invalid selection.")
            continue

        if choice < 1 or choice > len(last10):
            print("  Invalid selection.")
            continue

        entry = last10[choice - 1]

        # ── STAGE 2: inspection panel ──────────────────
        trust = load_trust()
        score_pct = int(trust["score"] * 100)
        context = _build_context(entries, entry)

        print()
        print(f"  {PANEL}")
        print(f"  WHEN       {entry['timestamp']}")
        print(f"  ACTION     {entry['action']}")
        print(f"  PATH       {entry['path'] or ''}")
        print(f"  INITIATED  {entry['initiated'] or 'unknown'}")
        print(f"  {PANEL}")
        if context:
            for label, _diff, ce in context:
                print(f"  {label}  {ce['timestamp']}  {ce['action']}  {_truncate_path(ce['path'])}")
        else:
            print("  CONTEXT    no nearby actions within 60 seconds")
        print(f"  {PANEL}")
        print(f"  CURRENT TRUST  {score_pct}%  ·  {trust['total']} action{'s' if trust['total'] != 1 else ''}  ·  {trust['overrides']} override{'s' if trust['overrides'] != 1 else ''}")
        print(f"  {PANEL}")
        print()

        try:
            confirm = input("  Mark as override? y=yes, n=back to list, q=quit [y/n/q]: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print()
            return

        if confirm == "q":
            return

        if confirm == "y":
            if not _mark_override_in_file(md_file, entry):
                print("  Could not locate entry in file.")
                return

            _mark_override_in_json(md_file, entry)

            json_name = md_file.with_suffix(".json").name
            subprocess.run(
                ["git", "add", md_file.name, json_name],
                cwd=LEDGER_DIR,
                capture_output=True,
            )
            subprocess.run(
                ["git", "commit", "-m", f"override marked: {entry['timestamp']}"],
                cwd=LEDGER_DIR,
                capture_output=True,
            )

            new_overrides = trust["overrides"] + 1
            override_weight = _get_entry_weight_from_json(md_file, entry)
            new_weight_overrides = trust.get("weight_overrides", 0.0) + override_weight
            save_trust(trust["total"], new_overrides,
                       trust.get("weight_total", float(trust["total"])),
                       new_weight_overrides)
            new_score = int(load_trust()["score"] * 100)

            print(f"  Marked as override: {entry['action']} {entry['path'] or ''}")
            print(f"  Trust updated: {new_score}%  ·  {new_overrides} override{'s' if new_overrides != 1 else ''}")
            return
        # n or blank: loop back to Stage 1


# ---------------------------------------------------------------------------
# sessions
# ---------------------------------------------------------------------------

def _load_all_json_entries() -> list:
    """Return all JSON ledger entries sorted by timestamp (oldest first)."""
    if not LEDGER_DIR.exists():
        return []
    entries = []
    for jf in sorted(LEDGER_DIR.glob("*.json")):
        try:
            for line in jf.read_text().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    if "timestamp" in rec:
                        entries.append(rec)
                except json.JSONDecodeError:
                    continue
        except OSError:
            continue
    entries.sort(key=lambda r: r["timestamp"])
    return entries


def _group_into_sessions(entries: list) -> list:
    """Split entries into logical sessions.

    A new session starts when:
      - the session_id UUID changes, OR
      - more than SESSION_GAP_SECONDS elapsed since the previous entry.

    Returns a list of dicts:
      { session_id, start, end, count, entries }
    """
    if not entries:
        return []

    sessions = []
    cur_session_id = entries[0].get("session_id")
    cur_entries = [entries[0]]

    def _ts(rec):
        try:
            return datetime.strptime(rec["timestamp"], "%Y-%m-%dT%H:%M:%S").timestamp()
        except Exception:
            return 0.0

    for rec in entries[1:]:
        sid = rec.get("session_id")
        gap = _ts(rec) - _ts(cur_entries[-1])
        if sid != cur_session_id or gap > SESSION_GAP_SECONDS:
            sessions.append({
                "session_id": cur_session_id,
                "start": cur_entries[0]["timestamp"],
                "end": cur_entries[-1]["timestamp"],
                "count": len(cur_entries),
                "entries": cur_entries,
            })
            cur_session_id = sid
            cur_entries = [rec]
        else:
            cur_entries.append(rec)

    sessions.append({
        "session_id": cur_session_id,
        "start": cur_entries[0]["timestamp"],
        "end": cur_entries[-1]["timestamp"],
        "count": len(cur_entries),
        "entries": cur_entries,
    })
    return sessions


def cmd_sessions(_args):
    entries = _load_all_json_entries()
    if not entries:
        print("  No session data found.")
        return

    sessions = _group_into_sessions(entries)

    def _ts(iso_str):
        try:
            return datetime.strptime(iso_str, "%Y-%m-%dT%H:%M:%S").timestamp()
        except Exception:
            return 0.0

    print(f"  {len(sessions)} session{'s' if len(sessions) != 1 else ''} found\n")
    for i, s in enumerate(sessions, start=1):
        start_ts = _ts(s["start"])
        end_ts = _ts(s["end"])
        duration_s = max(0, end_ts - start_ts)
        if duration_s < 60:
            dur_str = f"{int(duration_s)}s"
        elif duration_s < 3600:
            dur_str = f"{int(duration_s / 60)}m"
        else:
            h, m = int(duration_s / 3600), int((duration_s % 3600) / 60)
            dur_str = f"{h}h {m}m"

        sid_short = (s["session_id"] or "")[:8]
        actions = Counter(r.get("action") for r in s["entries"] if r.get("action"))
        top = ", ".join(f"{a}={n}" for a, n in actions.most_common(3))
        print(f"  [{i:3}]  {s['start']}  →  {s['end']}")
        print(f"         id={sid_short}  ·  {s['count']} actions  ·  {dur_str}")
        if top:
            print(f"         {top}")
        print()


# ---------------------------------------------------------------------------
# reset
# ---------------------------------------------------------------------------

def cmd_reset(_args):
    print("This will delete all ledger data, trust score, and session files.")
    try:
        confirm = input("Type YES to confirm: ").strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return

    if confirm != "YES":
        print("  Reset cancelled.")
        return

    import shutil

    # Stop any active watch session before deleting files it may be writing to.
    if PID_FILE.exists():
        pids = [int(line) for line in PID_FILE.read_text().splitlines() if line.strip().isdigit()]
        for pid in pids:
            try:
                os.kill(pid, 15)  # SIGTERM
            except (ProcessLookupError, PermissionError):
                pass
        print("  Stopped active watch session.")

    deleted = []

    if LEDGER_DIR.exists():
        shutil.rmtree(LEDGER_DIR)
        deleted.append(str(LEDGER_DIR))

    for f in (TRUST_FILE, PID_FILE, DIR_FILE, START_FILE, COUNT_FILE):
        if f.exists():
            f.unlink()
            deleted.append(str(f))

    if deleted:
        for path in deleted:
            print(f"  deleted: {path}")
    else:
        print("  Nothing to delete.")


# ---------------------------------------------------------------------------
# stop
# ---------------------------------------------------------------------------

def cmd_stop(_args):
    if not PID_FILE.exists():
        print("  No active watch session.")
        return

    pids = [int(line) for line in PID_FILE.read_text().splitlines() if line.strip().isdigit()]

    # Only send SIGTERM to the watcher (PID index 1: ledger, watcher, crystallizer).
    # The watcher emits a watcher_died event on SIGTERM so density is recorded,
    # then the crystallizer and ledger drain the pipeline and exit naturally.
    watcher_pid = pids[1] if len(pids) > 1 else (pids[0] if pids else None)
    killed = 0
    if watcher_pid is not None:
        try:
            os.kill(watcher_pid, 15)  # SIGTERM
            killed += 1
        except ProcessLookupError:
            pass
        except PermissionError:
            print(f"  Permission denied killing PID {watcher_pid}.")

    PID_FILE.unlink(missing_ok=True)
    for f in (DIR_FILE, START_FILE, COUNT_FILE):
        f.unlink(missing_ok=True)

    if killed:
        print(f"  Watch session stopped.")
    else:
        print("  Watch session was already stopped.")


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------

def cmd_status(_args):
    if not PID_FILE.exists():
        print("  [idle] no active watch session")
        return

    pids = [int(line) for line in PID_FILE.read_text().splitlines() if line.strip().isdigit()]

    alive = []
    for pid in pids:
        try:
            os.kill(pid, 0)
            alive.append(pid)
        except (ProcessLookupError, PermissionError):
            pass

    if not alive:
        print("  [idle] Previous session ended (system restarted). No active watch session.")
        PID_FILE.unlink(missing_ok=True)
        for f in (DIR_FILE, START_FILE, COUNT_FILE):
            f.unlink(missing_ok=True)
        return

    watch_dir = DIR_FILE.read_text().strip() if DIR_FILE.exists() else "unknown"

    time_str = "unknown"
    if START_FILE.exists():
        try:
            elapsed = datetime.now(timezone.utc).timestamp() - float(START_FILE.read_text().strip())
            if elapsed < 60:
                time_str = f"{int(elapsed)}s"
            elif elapsed < 3600:
                time_str = f"{int(elapsed / 60)}m"
            else:
                h, m = int(elapsed / 3600), int((elapsed % 3600) / 60)
                time_str = f"{h}h {m}m"
        except (ValueError, OSError):
            pass

    count_str = "unknown"
    if COUNT_FILE.exists():
        try:
            best_total = 0
            for attempt in range(3):
                if attempt > 0:
                    time.sleep(0.5)
                best_total = max(best_total, load_trust()["total"])
            entries_since = max(0, best_total - int(COUNT_FILE.read_text().strip()))
            count_str = str(entries_since)
        except (ValueError, OSError):
            pass

    # Live density: entries this session / elapsed minutes
    density_str = ""
    if COUNT_FILE.exists() and START_FILE.exists():
        try:
            elapsed_s = datetime.now(timezone.utc).timestamp() - float(START_FILE.read_text().strip())
            entries_now = max(0, load_trust()["total"] - int(COUNT_FILE.read_text().strip()))
            elapsed_min = max(0.001, elapsed_s / 60.0)
            density = entries_now / elapsed_min
            density_str = f"  ·  {density:.1f} actions/min"
        except (ValueError, OSError):
            pass

    print(f"  [active] watching {watch_dir}")
    print(f"  started {time_str} ago  ·  {count_str} entries recorded this session{density_str}")


# ---------------------------------------------------------------------------
# doctor
# ---------------------------------------------------------------------------

def cmd_doctor(_args):
    import shutil
    _json = json

    ok = True

    # Python version
    major, minor = sys.version_info[:2]
    if major >= 3 and minor >= 8:
        print(f"  [ok] Python {major}.{minor}")
    else:
        print(f"  [FAIL] Python {major}.{minor} -- 3.8+ required")
        ok = False

    # watchdog
    try:
        import watchdog  # noqa: F401
        from importlib.metadata import version as _pkg_version, PackageNotFoundError
        try:
            _wv = _pkg_version("watchdog")
            print(f"  [ok] watchdog installed ({_wv})")
        except PackageNotFoundError:
            print("  [ok] watchdog installed")
    except ImportError:
        print("  [FAIL] watchdog not installed -- run: pip install watchdog")
        ok = False

    # git
    if shutil.which("git"):
        _git_ver = subprocess.run(["git", "--version"], capture_output=True, text=True).stdout.strip()
        print(f"  [ok] git available ({_git_ver})")
    else:
        print("  [FAIL] git not found -- install git")
        ok = False

    # ledger dir
    if LEDGER_DIR.exists():
        print(f"  [ok] ledger dir exists: {LEDGER_DIR}")
    else:
        print(f"  [warn] ledger dir not yet created: {LEDGER_DIR}")

    # git repo in ledger
    git_dir = LEDGER_DIR / ".git"
    if git_dir.exists():
        print("  [ok] ledger is a git repo")
    elif LEDGER_DIR.exists():
        print("  [warn] ledger dir exists but not a git repo -- will be initialized on first watch")

    # write permissions
    import os as _os
    _write_ok = True
    if LEDGER_DIR.exists() and not _os.access(LEDGER_DIR, _os.W_OK):
        _write_ok = False
    if TRUST_FILE.exists() and not _os.access(TRUST_FILE, _os.W_OK):
        _write_ok = False
    if not LEDGER_DIR.exists() and not _os.access(LEDGER_DIR.parent, _os.W_OK):
        _write_ok = False
    if _write_ok:
        print("  [ok] ledger write permissions verified")
    else:
        print("  [FAIL] cannot write to ledger directory")
        ok = False

    # trust.json
    if TRUST_FILE.exists():
        try:
            data = _json.loads(TRUST_FILE.read_text())
            _ = data["score"], data["total"], data["overrides"]
            print("  [ok] trust.json valid")
            _score_pct = int(data["score"] * 100)
            _total = data["total"]
            _overrides = data["overrides"]
            print(f"  [ok] trust score: {_score_pct}%  ·  {_total} action{'s' if _total != 1 else ''}  ·  {_overrides} override{'s' if _overrides != 1 else ''}")
            if "weight_total" in data:
                print(f"  [ok] weighted trust: weight_total={data['weight_total']:.2f}  weight_overrides={data.get('weight_overrides', 0.0):.2f}")
        except Exception:
            print("  [FAIL] trust.json exists but is malformed")
            ok = False
    else:
        print("  [info] trust.json not yet created")

    # JSON ledger files
    if LEDGER_DIR.exists():
        _md_stems = {f.stem for f in LEDGER_DIR.glob("*.md")}
        _json_stems = {f.stem for f in LEDGER_DIR.glob("*.json")}
        _missing = _md_stems - _json_stems
        if _missing:
            print(f"  [warn] {len(_missing)} ledger date(s) have markdown but no JSON (pre-v0.2 entries)")
        elif _json_stems:
            print(f"  [ok] JSON ledger files present ({len(_json_stems)} date{'s' if len(_json_stems) != 1 else ''})")
        else:
            print("  [info] JSON ledger files will be created on next watch session")

    print()
    if ok:
        print("  All systems go.")
    else:
        print("  Some checks failed. Run iterance howto for help.")
        sys.exit(1)


WEBHOOK_PORT = 7734
WEBHOOK_HOST = "127.0.0.1"


# ---------------------------------------------------------------------------
# listen (webhook server)
# ---------------------------------------------------------------------------

def cmd_listen(args):
    background = "--background" in args
    webhook_script = SCRIPTS / "webhook" / "webhook.py"

    if background:
        p = subprocess.Popen(
            [PYTHON, str(webhook_script)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        print(f"[Iterance] webhook listener started in background (PID {p.pid},"
              f" port {WEBHOOK_PORT}).")
        return

    subprocess.run([PYTHON, str(webhook_script)])


# ---------------------------------------------------------------------------
# webhook (sub-commands: test)
# ---------------------------------------------------------------------------

def cmd_webhook(args):
    import urllib.request
    import urllib.error

    sub = args[0] if args else "test"

    if sub == "test":
        payload = {"action": "modified", "path": "/tmp/iterance_webhook_test",
                   "initiator": "agent"}
        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            f"http://{WEBHOOK_HOST}:{WEBHOOK_PORT}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read())
                print(f"  [ok] webhook test: {data.get('message', data)}")
        except urllib.error.URLError as e:
            print(f"  [FAIL] webhook test: could not reach listener — {e}")
            print(f"         Start it first with: iterance listen --background")
            sys.exit(1)
    else:
        print(f"Unknown webhook sub-command: {sub}", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# exec (shell command interceptor)
# ---------------------------------------------------------------------------

def cmd_exec(args):
    if not args:
        print("Usage: iterance exec <command> [args...]", file=sys.stderr)
        sys.exit(1)

    cmd_str = " ".join(args)
    action_type = classify_shell_cmd(cmd_str)
    try:
        write_ledger_entry_direct(action_type, cmd_str, initiator="user")
    except Exception:
        pass   # never block the user's command due to ledger errors

    # Replace the current process with the target command.
    os.execvp(args[0], args)


# ---------------------------------------------------------------------------
# watch-history (background shell history monitor)
# ---------------------------------------------------------------------------

_SHELL_HISTORY_FILES = [
    Path.home() / ".bash_history",
    Path.home() / ".zsh_history",
]
_HISTORY_POLL_INTERVAL = 5   # seconds


def _poll_history(history_file: Path) -> None:
    """Tail history_file, logging new lines as shell entries. Runs until SIGTERM."""
    import signal as _signal

    _running = True

    def _stop(s, f):
        nonlocal _running
        _running = False

    _signal.signal(_signal.SIGTERM, _stop)
    _signal.signal(_signal.SIGINT, _stop)

    # Start reading from the current end of the file so we only pick up new commands.
    offset = history_file.stat().st_size if history_file.exists() else 0
    session_id = __import__("uuid").uuid4().__str__()

    while _running:
        time.sleep(_HISTORY_POLL_INTERVAL)
        if not history_file.exists():
            continue
        try:
            size = history_file.stat().st_size
            if size <= offset:
                if size < offset:   # file was truncated/rotated
                    offset = 0
                continue
            with open(history_file, "rb") as f:
                f.seek(offset)
                new_bytes = f.read()
            offset = size
            new_lines = new_bytes.decode("utf-8", errors="replace").splitlines()
            for line in new_lines:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                # zsh extended history format: ": timestamp:elapsed;cmd"
                if line.startswith(": ") and ";" in line:
                    line = line.split(";", 1)[1]
                if not line:
                    continue
                action_type = classify_shell_cmd(line)
                try:
                    write_ledger_entry_direct(action_type, line,
                                              initiator="user", session_id=session_id)
                except Exception:
                    pass
        except OSError:
            continue


def cmd_watch_history(args):
    background = "--background" in args

    history_files = [f for f in _SHELL_HISTORY_FILES if f.exists()]
    if not history_files:
        print("No shell history files found (checked ~/.bash_history, ~/.zsh_history).",
              file=sys.stderr)
        sys.exit(1)

    # Only poll the first found history file (prefer bash, then zsh)
    target = history_files[0]

    if background:
        p = subprocess.Popen(
            [PYTHON, "-c",
             f"import sys; sys.path.insert(0, {str(Path(__file__).resolve().parent.parent)!r});"
             f"from iterance.cli import _poll_history; from pathlib import Path;"
             f"_poll_history(Path({str(target)!r}))"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
        print(f"[Iterance] watching shell history {target} in background (PID {p.pid}).")
        return

    _poll_history(target)


# ---------------------------------------------------------------------------
# howto
# ---------------------------------------------------------------------------

HOWTO = """\
  ITERANCE -- behavioral witness for AI agents

  COMMANDS

    watch <dir>           Watch a directory. Every filesystem event the agent
                          makes is recorded to the ledger. Run this while your
                          agent is working.

    report                Print a summary of today's activity: actions recorded,
                          last action, trust score, and a plain-English summary.

    reflect               Write ~/.iterance/ITERANCE_SELF.md -- a plain-English
                          summary of the agent's full behavioral history.
                          Include this file in the agent's context.

    log                   Print entries from the most recent ledger file.
    log --date YYYY-MM-DD Print entries from a specific date.

    trust                 Print the current trust score, total actions,
                          and override count.

    sessions              List all recorded watch sessions, grouped by UUID
                          and 5-minute silence boundaries. Shows start/end
                          time, duration, and action breakdown per session.

    exec <cmd>            Run a shell command and log it to the ledger.
                          Destructive commands (rm, dd …) get weight 2.0,
                          network commands 1.5, reads 0.3, others 1.0.

    watch-history         Monitor ~/.bash_history or ~/.zsh_history for new
                          shell commands and log them automatically.
                          Use --background to detach.

    listen                Start the webhook listener on localhost:7734.
                          Accepts JSON POST requests and writes ledger entries.
                          Supports OpenClaw log adapter format.
                          Use --background to detach.

    webhook test          Send a test POST to the running webhook listener
                          to verify it is accepting events.

    override              Mark an entry as an override -- an action the agent
                          took that you did not sanction. Lowers trust score.

    reset                 Delete all ledger data, trust score, and session
                          files. Preserves ignore.conf. Prompts for YES.

    stop                  Kill the background watch session started with
                          iterance watch --background.

    status                Show whether a watch session is active. If running,
                          prints directory, elapsed time, and entry count for
                          this session.

    doctor                Check that all dependencies are in place and the
                          ledger is properly initialized.

    howto                 Print this help screen.

  QUICK START

    1. Run:   iterance watch /path/to/your/agent/workspace
    2. Start your agent in another terminal.
    3. When done:  iterance report
"""


def cmd_howto(_args):
    print(HOWTO)


# ---------------------------------------------------------------------------
# dispatch
# ---------------------------------------------------------------------------

COMMANDS = {
    "watch": cmd_watch,
    "report": cmd_report,
    "reflect": cmd_reflect,
    "log": cmd_log,
    "trust": cmd_trust,
    "override": cmd_override,
    "sessions": cmd_sessions,
    "exec": cmd_exec,
    "watch-history": cmd_watch_history,
    "listen": cmd_listen,
    "webhook": cmd_webhook,
    "reset": cmd_reset,
    "stop": cmd_stop,
    "status": cmd_status,
    "doctor": cmd_doctor,
    "howto": cmd_howto,
}


def main():
    args = sys.argv[1:]
    if not args:
        from iterance.tui import run_tui
        run_tui()
        return
    if args[0] not in COMMANDS:
        print(f"Unknown command: {args[0]}", file=sys.stderr)
        print("Run 'iterance howto' for usage.", file=sys.stderr)
        sys.exit(1)
    COMMANDS[args[0]](args[1:])


if __name__ == "__main__":
    main()
