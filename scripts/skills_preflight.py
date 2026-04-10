#!/usr/bin/env python3
"""Pre-task validation for required skill sources."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / ".skills" / "sources.json"
REPOS_DIR = ROOT / ".skills" / "repos"


def _slug(repo_url: str) -> str:
    name = repo_url.rstrip("/").split("/")[-1]
    return name[:-4] if name.endswith(".git") else name


def _load_catalogs() -> list[dict]:
    if not SOURCES_FILE.exists():
        raise FileNotFoundError(f"Missing {SOURCES_FILE}")
    return json.loads(SOURCES_FILE.read_text(encoding="utf-8")).get("catalogs", [])


def _run_search(query: str, max_lines: int) -> int:
    cmd = [
        "python3",
        str(ROOT / "scripts" / "skills_search.py"),
        query,
        "--max-lines",
        str(max_lines),
    ]
    return subprocess.run(cmd, cwd=ROOT, check=False).returncode


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate required skills are synced before a task."
    )
    parser.add_argument(
        "--query",
        default="",
        help="Optional search query to run after validation.",
    )
    parser.add_argument(
        "--max-lines",
        type=int,
        default=40,
        help="Maximum lines per repository when query is provided.",
    )
    args = parser.parse_args()

    catalogs = _load_catalogs()
    missing: list[str] = []

    for catalog in catalogs:
        repo = catalog.get("repo", "")
        name = catalog.get("name", "unknown")
        destination = REPOS_DIR / _slug(repo)
        if not destination.exists():
            missing.append(f"{name} ({repo})")

    if missing:
        print("Preflight failed: required skills are not synced.", file=sys.stderr)
        for item in missing:
            print(f"- {item}", file=sys.stderr)
        print("\nRun: python3 scripts/skills_sync.py", file=sys.stderr)
        return 1

    print("Preflight OK: all required skill repositories are synced.")
    print("Policy: run skill search before implementation tasks.")

    if args.query.strip():
        print(f"\nRunning skill search for: {args.query}\n")
        return _run_search(args.query, args.max_lines)
    return 0


if __name__ == "__main__":
    sys.exit(main())
