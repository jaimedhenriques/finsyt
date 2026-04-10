# finsyt

This repository is configured to use curated "skills" sources as part of the default
execution workflow for coding, design, and product work.

## Required skills catalogs

The canonical source list lives in `.skills/sources.json` and currently includes:

- https://github.com/ComposioHQ/awesome-claude-skills
- https://github.com/anthropics/skills
- https://github.com/obra/superpowers
- https://github.com/coreyhaines31/marketingskills
- https://github.com/affaan-m/everything-claude-code
- https://github.com/addyosmani/agent-skills

## Workflow

1. Sync or update all skills repositories:

```bash
python3 scripts/skills_sync.py
```

2. Run preflight before each new task:

```bash
python3 scripts/skills_preflight.py
```

3. Search skills before implementation:

```bash
python3 scripts/skills_search.py "your query"
```

Examples:

```bash
python3 scripts/skills_search.py "design system"
python3 scripts/skills_search.py "testing strategy"
python3 scripts/skills_search.py "seo"
python3 scripts/skills_preflight.py --query "api design"
```

## Repo structure

- `.skills/sources.json` — required skills catalog registry
- `.skills/repos/` — local clones of skill sources (ignored in git)
- `scripts/skills_sync.py` — sync/update skill repositories
- `scripts/skills_preflight.py` — validate required sources before tasks
- `scripts/skills_search.py` — search across synced skills

## Operating policy

- Treat `sources.json` as the required default source set.
- Run `skills_preflight.py` before starting implementation work.
- Keep new automation and process updates aligned with this skill-first workflow.