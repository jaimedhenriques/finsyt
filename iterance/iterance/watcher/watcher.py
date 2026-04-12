#!/usr/bin/env python3
"""The Watcher -- Component 1 of Iterance.

Observes a target directory from outside and prints normalized filesystem
events to stdout. One event per line, JSON formatted.
"""

import json
import signal
import sys
import time
from datetime import datetime, timezone

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer


class WatcherHandler(FileSystemEventHandler):
    def _emit(self, event_type: str, path: str) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": event_type,
            "path": path,
            "sanctioned": False,
        }
        print(json.dumps(record), flush=True)

    def on_created(self, event):
        self._emit("created", event.src_path)

    def on_modified(self, event):
        self._emit("modified", event.src_path)

    def on_deleted(self, event):
        self._emit("deleted", event.src_path)

    def on_moved(self, event):
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": "moved",
            "path": event.src_path,
            "dest": event.dest_path,
            "sanctioned": False,
        }
        print(json.dumps(record), flush=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: watcher.py <target_directory>", file=sys.stderr)
        sys.exit(1)

    target = sys.argv[1]
    observer = Observer()
    observer.schedule(WatcherHandler(), path=target, recursive=True)
    observer.start()

    def _emit_stopped_and_exit(signum, frame):
        print(json.dumps({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": "watcher_died",
            "path": None,
            "sanctioned": False,
        }), flush=True)
        observer.stop()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _emit_stopped_and_exit)

    try:
        while observer.is_alive():
            time.sleep(1)
    except KeyboardInterrupt:
        print(json.dumps({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event_type": "watcher_died",
            "path": None,
            "sanctioned": False,
        }), flush=True)
        observer.stop()
    else:
        print(json.dumps({"timestamp": datetime.now(timezone.utc).isoformat(), "event_type": "watcher_died", "path": None, "sanctioned": False}), flush=True)

    observer.join()


if __name__ == "__main__":
    main()
