#!/usr/bin/env python3
"""Webhook listener for Iterance.

Listens on localhost:7734 for incoming JSON payloads and writes ledger
entries. Supports a generic JSON schema plus an OpenClaw log adapter.

Payload schemas accepted:

  Generic:
    { "action": "modified", "path": "/tmp/foo.txt", "initiator": "agent" }

  OpenClaw adapter (log lines forwarded as text):
    { "source": "openclaw", "log": "<log line>" }
    where log line matches: TIMESTAMP LEVEL [COMPONENT] ACTION path
    e.g.: 2026-04-10T17:00:00Z INFO [agent] modified /workspace/foo.py
"""

import json
import signal
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from iterance.common import (
    ACTION_WEIGHTS,
    write_ledger_entry_direct,
)

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 7734
_SESSION_ID = __import__("uuid").uuid4().__str__()

# OpenClaw action keyword mapping
_OPENCLAW_ACTION_MAP = {
    "created":  "created",
    "modified": "modified",
    "deleted":  "deleted",
    "moved":    "moved",
    "read":     "shell_read",
    "executed": "shell_exec",
}


def _parse_openclaw_log(log_line: str) -> dict | None:
    """Parse an OpenClaw-format log line.

    Expected format (space-separated):
      TIMESTAMP LEVEL [COMPONENT] ACTION path
    Returns dict with keys: action, path, initiator
    """
    parts = log_line.strip().split()
    if len(parts) < 5:
        return None
    # parts[0]=ts, parts[1]=level, parts[2]=[component], parts[3]=action, parts[4]=path
    action_raw = parts[3].lower() if len(parts) > 3 else "unknown"
    path = parts[4] if len(parts) > 4 else ""
    action = _OPENCLAW_ACTION_MAP.get(action_raw, "shell_exec")
    initiator = "agent"
    return {"action": action, "path": path, "initiator": initiator}


def _process_payload(payload: dict) -> tuple[bool, str]:
    """Parse payload, write ledger entry. Returns (ok, message)."""
    source = payload.get("source", "webhook")

    if source == "openclaw":
        log_line = payload.get("log", "")
        parsed = _parse_openclaw_log(log_line)
        if not parsed:
            return False, f"Could not parse OpenClaw log line: {log_line!r}"
        action = parsed["action"]
        path = parsed["path"]
        initiator = parsed["initiator"]
    else:
        action = payload.get("action", "shell_exec")
        path = payload.get("path", "")
        initiator = payload.get("initiator", "agent")

    if action not in ACTION_WEIGHTS:
        valid = ", ".join(sorted(ACTION_WEIGHTS.keys()))
        return False, f"unknown action type: '{action}'. Valid types: {valid}"

    write_ledger_entry_direct(action, path, initiator=initiator, session_id=_SESSION_ID)
    return True, f"logged: {action} {path}"


class _WebhookHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):   # silence default access log
        pass

    def do_GET(self):
        if self.path == "/health":
            self._respond(200, {"status": "ok", "port": LISTEN_PORT})
        else:
            self._respond(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body)
        except json.JSONDecodeError as e:
            self._respond(400, {"error": f"invalid JSON: {e}"})
            return
        ok, msg = _process_payload(payload)
        if ok:
            self._respond(200, {"ok": True, "message": msg})
        else:
            self._respond(422, {"ok": False, "error": msg})

    def _respond(self, code: int, data: dict) -> None:
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)


def serve_forever():
    server = HTTPServer((LISTEN_HOST, LISTEN_PORT), _WebhookHandler)
    signal.signal(signal.SIGTERM, lambda s, f: server.shutdown())
    signal.signal(signal.SIGINT, lambda s, f: server.shutdown())
    print(f"[Iterance webhook] listening on {LISTEN_HOST}:{LISTEN_PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    serve_forever()
