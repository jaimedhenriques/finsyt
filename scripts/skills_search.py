#!/usr/bin/env python3
"""Search synced skill repositories for relevant guidance."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / ".skills" / "sources.json"
SKILLS_REPOS = ROOT / ".skills" / "repos"


def load_sources() -> list[dict]:
    if not SOURCES_FILE.exists():
        raise FileNotFoundError(f"Missing sources file: {SOURCES_FILE}")
    data = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    return data.get("catalogs", [])


def slug_from_repo(url: str) -> str:
    name = url.rstrip("/").split("/")[-1]
    return re.sub(r"\.git$", "", name)


def run_rg(query: str, path: Path, limit: int) -> str:
    cmd = [
        "rg",
        "-n",
        "--hidden",
        "--glob",
        "!.git/",
        "--glob",
        "!**/node_modules/**",
        "--glob",
        "!**/dist/**",
        "--glob",
        "!**/build/**",
        query,
        str(path),
    ]
    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    output = (completed.stdout or "").strip()
    if not output:
        return ""
    lines = output.splitlines()
    if len(lines) > limit:
        lines = lines[:limit]
        lines.append(f"... truncated to {limit} lines")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Search across synced skill repositories."
    )
    parser.add_argument("query", help="Ripgrep pattern to search for")
    parser.add_argument(
        "--max-lines",
        type=int,
        default=60,
        help="Maximum total lines printed per repository",
    )
    args = parser.parse_args()

    sources = load_sources()
    if not SKILLS_REPOS.exists():
        print(
            "No synced repositories found. Run `python3 scripts/skills_sync.py` first."
        )
        return 1

    found_any = False
    for source in sources:
        repo_url = source["repo"]
        slug = slug_from_repo(repo_url)
        repo_dir = SKILLS_REPOS / slug
        if not repo_dir.exists():
            print(f"[skip] {source['name']} ({slug}) not synced")
            continue

        result = run_rg(args.query, repo_dir, args.max_lines)
        if result:
            found_any = True
            print(f"\n=== {source['name']} :: {repo_url} ===")
            print(result)

    if not found_any:
        print("No matches found.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
