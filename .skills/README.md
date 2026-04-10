# Skills workspace

This folder contains skill source definitions and local synced copies used by agents.

## Files

- `sources.json`: canonical list of required skill repositories.
- `repos/`: local clones of skill repositories (created by `scripts/skills_sync.py`).

## Usage

1. Sync/update all sources:
   - `python3 scripts/skills_sync.py`
2. Search skill content before starting a task:
   - `python3 scripts/skills_search.py "query terms"`

## Policy

- Treat sources in `sources.json` as required references.
- Keep this folder in source control except for `repos/` (ignored by git).
