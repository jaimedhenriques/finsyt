#!/usr/bin/env python3
"""Sync required skill repositories into .skills/repos."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT / ".skills" / "sources.json"
REPOS_DIR = ROOT / ".skills" / "repos"


def _slug_from_repo_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    return path.split("/")[-1]


def _run(cmd: list[str], cwd: Path | None = None) -> None:
    subprocess.run(cmd, cwd=cwd, check=True)


def main() -> int:
    if not SOURCES_FILE.exists():
        print(f"Missing source config: {SOURCES_FILE}", file=sys.stderr)
        return 1

    REPOS_DIR.mkdir(parents=True, exist_ok=True)

    data = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    catalogs = data.get("catalogs", [])
    if not catalogs:
        print("No catalogs found in .skills/sources.json", file=sys.stderr)
        return 1

    for catalog in catalogs:
        name = catalog.get("name", "unknown")
        repo = catalog.get("repo")
        if not repo:
            print(f"Skipping {name}: missing repo URL")
            continue

        slug = _slug_from_repo_url(repo)
        destination = REPOS_DIR / slug
        if destination.exists():
            print(f"[update] {name} -> {destination}")
            _run(["git", "-C", str(destination), "pull", "--ff-only"])
        else:
            print(f"[clone]  {name} -> {destination}")
            _run(["git", "clone", repo, str(destination)])

    print("\nSkill sources synced successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
