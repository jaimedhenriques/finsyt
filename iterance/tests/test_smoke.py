#!/usr/bin/env python3
"""Smoke tests for all Iterance CLI commands.

Runs every command non-interactively via subprocess and asserts clean exit.
No external test framework -- stdlib only.
"""

import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

CLI = Path(__file__).resolve().parent.parent / "cli.py"
PYTHON = sys.executable
ITERANCE_DIR = Path.home() / ".iterance"
PID_FILE = ITERANCE_DIR / "watch.pid"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def run(args, stdin=None, timeout=15):
    """Run CLI with given args, return (returncode, stdout, stderr)."""
    result = subprocess.run(
        [PYTHON, str(CLI)] + args,
        input=stdin,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    return result.returncode, result.stdout, result.stderr


def assert_ok(rc, stdout, stderr, cmd_label, *, allow_rc1=False):
    ok = (rc == 0) or (allow_rc1 and rc == 1)
    if not ok:
        print(f"  FAIL  {cmd_label}")
        print(f"        rc={rc}")
        if stdout:
            print(f"        stdout: {stdout[:200]}")
        if stderr:
            print(f"        stderr: {stderr[:200]}")
        return False
    print(f"  ok    {cmd_label}")
    return True


def stop_any_session():
    """Kill any running background session."""
    if PID_FILE.exists():
        pids = [int(l) for l in PID_FILE.read_text().splitlines() if l.strip().isdigit()]
        for pid in pids:
            try:
                os.kill(pid, 15)
            except (ProcessLookupError, PermissionError):
                pass
        PID_FILE.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# tests
# ---------------------------------------------------------------------------

def test_howto():
    rc, out, err = run(["howto"])
    assert "ITERANCE" in out
    return assert_ok(rc, out, err, "howto")


def test_doctor():
    rc, out, err = run(["doctor"])
    # doctor exits 1 if checks fail, but on a working system it exits 0
    return assert_ok(rc, out, err, "doctor")


def test_trust():
    rc, out, err = run(["trust"])
    assert "Trust:" in out
    return assert_ok(rc, out, err, "trust")


def test_log_no_args():
    rc, out, err = run(["log"])
    # exits 0 whether there are entries or not
    return assert_ok(rc, out, err, "log (no args)")


def test_log_last():
    rc, out, err = run(["log", "--last", "5"])
    return assert_ok(rc, out, err, "log --last 5")


def test_log_summary():
    rc, out, err = run(["log", "--summary"])
    return assert_ok(rc, out, err, "log --summary")


def test_log_files():
    rc, out, err = run(["log", "--files"])
    return assert_ok(rc, out, err, "log --files")


def test_log_bad_date():
    rc, out, err = run(["log", "--date", "1900-01-01"])
    # Should say "No ledger for..." and exit 0
    return assert_ok(rc, out, err, "log --date (missing)")


def test_status_idle():
    stop_any_session()
    rc, out, err = run(["status"])
    assert "idle" in out
    return assert_ok(rc, out, err, "status (idle)")


def test_watch_missing_dir():
    rc, out, err = run(["watch", "/nonexistent_dir_iterance_test"])
    # Should exit 1 with an error message
    assert rc == 1
    assert "not found" in err or "not found" in out
    print("  ok    watch (missing dir exits 1)")
    return True


def test_watch_no_args():
    rc, out, err = run(["watch"])
    assert rc == 1
    print("  ok    watch (no args exits 1)")
    return True


def test_watch_background_and_stop():
    stop_any_session()
    with tempfile.TemporaryDirectory() as tmpdir:
        rc, out, err = run(["watch", tmpdir, "--background"])
        if not assert_ok(rc, out, err, "watch --background"):
            return False

        time.sleep(1)

        rc2, out2, err2 = run(["status"])
        if not assert_ok(rc2, out2, err2, "status (active)"):
            stop_any_session()
            return False

        if "active" not in out2:
            print(f"  FAIL  status should show [active], got: {out2!r}")
            stop_any_session()
            return False

        rc3, out3, err3 = run(["stop"])
        return assert_ok(rc3, out3, err3, "stop")


def test_report():
    rc, out, err = run(["report"])
    return assert_ok(rc, out, err, "report")


def test_reflect():
    rc, out, err = run(["reflect"])
    assert rc == 0
    return assert_ok(rc, out, err, "reflect")


def test_override_quit_immediately():
    # Send 'q' to stage 1 -- should exit cleanly
    rc, out, err = run(["override"], stdin="q\n")
    return assert_ok(rc, out, err, "override (q to quit)")


def test_override_blank_quit():
    # Send empty line to stage 1 -- should exit cleanly
    rc, out, err = run(["override"], stdin="\n")
    return assert_ok(rc, out, err, "override (blank to quit)")


def test_override_inspect_then_quit():
    # Inspect entry 1, then q at confirmation -- should exit cleanly
    rc, out, err = run(["override"], stdin="1\nq\n")
    return assert_ok(rc, out, err, "override (inspect then q)")


def test_override_inspect_then_back():
    # Inspect entry 1, then n to go back, then q to quit
    rc, out, err = run(["override"], stdin="1\nn\nq\n")
    return assert_ok(rc, out, err, "override (inspect, back, quit)")


def test_json_ledger_output():
    """After a watch session, JSON ledger files must exist with correct structure."""
    import json as _json
    from pathlib import Path as _Path
    stop_any_session()
    with tempfile.TemporaryDirectory() as tmpdir:
        rc, out, err = run(["watch", tmpdir, "--background"])
        if not assert_ok(rc, out, err, "json_ledger: watch --background"):
            return False

        # Trigger a filesystem event.
        test_file = _Path(tmpdir) / "test_json_ledger.txt"
        test_file.write_text("hello")
        time.sleep(3)

        run(["stop"])

        ledger_dir = _Path.home() / ".iterance" / "ledger"
        json_files = sorted(ledger_dir.glob("*.json")) if ledger_dir.exists() else []
        if not json_files:
            print("  FAIL  json_ledger: no JSON files in ledger")
            return False

        required_keys = {"timestamp", "action", "path", "initiator", "session_id", "weight"}
        found_valid = False
        with open(json_files[-1]) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = _json.loads(line)
                    if required_keys.issubset(record.keys()):
                        found_valid = True
                        break
                except _json.JSONDecodeError:
                    continue

        if not found_valid:
            print("  FAIL  json_ledger: no record with all required fields found")
            return False

        print("  ok    json_ledger: JSON files present with correct structure")
        return True


def test_weighted_trust_score():
    """trust.json must contain weight_total and weight_overrides fields."""
    import json as _json
    from pathlib import Path as _Path
    trust_file = _Path.home() / ".iterance" / "trust.json"
    if not trust_file.exists():
        print("  ok    weighted_trust: trust.json not yet created (no entries)")
        return True
    try:
        data = _json.loads(trust_file.read_text())
    except _json.JSONDecodeError:
        print("  FAIL  weighted_trust: trust.json is malformed")
        return False
    for field in ("weight_total", "weight_overrides"):
        if field not in data:
            print(f"  FAIL  weighted_trust: trust.json missing '{field}'")
            return False
    if data["total"] > 0 and data["weight_total"] <= 0:
        print("  FAIL  weighted_trust: total > 0 but weight_total is 0")
        return False
    print("  ok    weighted_trust: trust.json has weight fields")
    return True


def test_webhook_listen_and_test():
    """Start listener in background, send test event, verify entry written, stop."""
    import json as _json
    import urllib.request as _req
    import urllib.error as _uerr
    from pathlib import Path as _Path

    ledger_dir = _Path.home() / ".iterance" / "ledger"

    # Count existing JSON lines before
    def _count_json_lines():
        if not ledger_dir.exists():
            return 0
        return sum(
            sum(1 for line in open(jf) if line.strip())
            for jf in ledger_dir.glob("*.json")
        )

    before = _count_json_lines()

    # Start listener in background
    rc, out, err = run(["listen", "--background"])
    if not assert_ok(rc, out, err, "webhook: listen --background"):
        return False

    time.sleep(1)   # let the server start

    # Send a test event
    rc2, out2, err2 = run(["webhook", "test"])
    if not assert_ok(rc2, out2, err2, "webhook: test POST"):
        return False

    time.sleep(0.5)

    after = _count_json_lines()
    if after <= before:
        print("  FAIL  webhook: no new JSON entry after test POST")
        return False

    print("  ok    webhook: listener accepted event and wrote ledger entry")

    # Kill the listener (find by port)
    import subprocess as _sp
    _sp.run(["fuser", "-k", "7734/tcp"], capture_output=True)
    return True


def test_exec_logs_entry():
    """iterance exec should run the command and log a shell entry."""
    import json as _json
    from pathlib import Path as _Path
    ledger_dir = _Path.home() / ".iterance" / "ledger"
    before_count = 0
    if ledger_dir.exists():
        for jf in ledger_dir.glob("*.json"):
            before_count += sum(1 for _ in open(jf))

    # Run a safe read-class command via exec
    rc, out, err = run(["exec", "echo", "iterance_exec_test"], timeout=10)
    if rc != 0:
        print(f"  FAIL  exec: rc={rc} stderr={err[:100]}")
        return False

    if ledger_dir.exists():
        after_count = sum(
            sum(1 for _ in open(jf)) for jf in ledger_dir.glob("*.json")
        )
        if after_count <= before_count:
            print("  FAIL  exec: no new JSON entry written")
            return False

    print("  ok    exec: command ran and ledger entry written")
    return True


def test_loop_detection():
    """Crystallizer must emit loop_detected after ≥3 same-action events on same path in 60s."""
    import json as _json
    from pathlib import Path as _Path
    stop_any_session()
    with tempfile.TemporaryDirectory() as tmpdir:
        rc, out, err = run(["watch", tmpdir, "--background"])
        if not assert_ok(rc, out, err, "loop_detection: watch --background"):
            return False

        # Write the same file 4 times rapidly to trigger loop detection.
        probe = _Path(tmpdir) / "loop_probe.txt"
        for i in range(4):
            probe.write_text(f"iteration {i}")
            time.sleep(0.2)

        time.sleep(3)
        run(["stop"])

        ledger_dir = _Path.home() / ".iterance" / "ledger"
        json_files = sorted(ledger_dir.glob("*.json")) if ledger_dir.exists() else []
        if not json_files:
            print("  FAIL  loop_detection: no JSON files")
            return False

        found_loop = False
        for jf in json_files:
            for line in jf.read_text().splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = _json.loads(line)
                    if rec.get("action") == "loop_detected":
                        found_loop = True
                        break
                except _json.JSONDecodeError:
                    continue
            if found_loop:
                break

        if not found_loop:
            print("  FAIL  loop_detection: no loop_detected entry found")
            return False

        print("  ok    loop_detection: loop_detected entry found")
        return True


def test_sessions():
    rc, out, err = run(["sessions"])
    # exits 0 whether there are sessions or not
    return assert_ok(rc, out, err, "sessions")


def test_unknown_command():
    rc, out, err = run(["notacommand"])
    assert rc == 1
    assert "Unknown command" in err or "Unknown command" in out
    print("  ok    unknown command exits 1")
    return True


def test_no_args():
    # No args should launch the TUI (not exit with error).
    # Verify it starts without immediately crashing, then kill it.
    import signal
    proc = subprocess.Popen(
        [PYTHON, str(CLI)],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(2)
    still_running = proc.poll() is None
    proc.send_signal(signal.SIGTERM)
    time.sleep(1)
    if proc.poll() is None:
        proc.kill()
    subprocess.run(["stty", "sane"], check=False)
    if not still_running:
        print("  FAIL  no args: TUI exited immediately.")
        return False
    print("  ok    no args (TUI launched, terminated cleanly)")
    return True


# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------

def main():
    tests = [
        test_howto,
        test_doctor,
        test_trust,
        test_log_no_args,
        test_log_last,
        test_log_summary,
        test_log_files,
        test_log_bad_date,
        test_status_idle,
        test_watch_missing_dir,
        test_watch_no_args,
        test_watch_background_and_stop,
        test_report,
        test_reflect,
        test_override_quit_immediately,
        test_override_blank_quit,
        test_override_inspect_then_quit,
        test_override_inspect_then_back,
        test_json_ledger_output,
        test_weighted_trust_score,
        test_webhook_listen_and_test,
        test_exec_logs_entry,
        test_loop_detection,
        test_sessions,
        test_unknown_command,
        test_no_args,
    ]

    print(f"\nIterance smoke tests ({len(tests)} total)\n")

    passed = 0
    failed = 0
    for t in tests:
        try:
            ok = t()
            if ok:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1

    print(f"\n{passed} passed, {failed} failed\n")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
