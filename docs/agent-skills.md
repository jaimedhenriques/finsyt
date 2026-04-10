# Agent Skills Setup and Usage

This repository uses [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) as a standard execution framework for coding tasks.

## Install or update

Run from the repository root:

```bash
./scripts/install-agent-skills.sh
./scripts/sync-cursor-skills.sh
```

What this does:
- Clones/updates `agent-skills` into `.agent-skills/`
- Syncs key `SKILL.md` files into `.cursor/rules/agent-skills/`
- Keeps `.cursor/rules/00-agent-skills-instructions.mdc` as the always-on policy

## Daily usage

For every task, follow this sequence:
1. **Define/Plan** using spec and incremental implementation guidance
2. **Build** with TDD and clear API boundaries
3. **Verify/Review** with debugging, code quality, and security gates

## Refresh guidance

When upstream skills update:

```bash
./scripts/install-agent-skills.sh
./scripts/sync-cursor-skills.sh
```

