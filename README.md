# finsyt

Finsyt is an AI-powered financial research and intelligence platform.

## UX + Design Skills Hub

This repository is configured to use external agent skill packs and a project-level
`DESIGN.md` so coding agents produce consistent, high-quality frontend work.

### Install skill packs

```bash
bash scripts/install-design-skills.sh
```

This installs:

- `addyosmani/agent-skills` (engineering skill packs)
- `VoltAgent/awesome-design-md` (curated DESIGN.md systems)

under `.skills/`.

### Select a design system baseline

```bash
bash scripts/select-design-system.sh linear
```

This copies the selected system into the project root as `DESIGN.md`.

Current default profile for Finsyt:

- Institutional finance clarity
- Light surfaces with blue accents
- Dense but readable data UI
- Enterprise-first hierarchy and accessibility

### Daily workflow for agent-driven frontend work

1. Install/refresh skills (`install-design-skills.sh`).
2. Select or refresh `DESIGN.md` (`select-design-system.sh`).
3. Follow `docs/FRONTEND_EXECUTION_PLAYBOOK.md`.
4. Implement frontend changes with explicit references to `DESIGN.md`.
5. Run QA checks (a11y, responsive, performance, SEO metadata).