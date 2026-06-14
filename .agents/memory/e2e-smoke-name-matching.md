---
name: e2e smoke tests match by accessible name / visible copy
description: Why product UI renames silently break tests/platform/*.spec.ts
---

Playwright smoke specs under `tests/platform/` assert on **accessible names and
visible text** (e.g. `getByRole('dialog', { name: /.../ })`,
`getByRole('button', { name: /.../ })`). They do not key off test-ids.

**Rule:** any UI copy rename must update the matching spec regex in lockstep, or
the spec times out with a confusing "element not visible" that looks like a
product bug but is a stale string.

**Why:** the chat assistant was renamed Copilot → "Finsyt Agent" (the Ask drawer
title is "Finsyt Agent") and the company-page export button reads "Export to
pitch deck" — both diverged from older spec regexes and caused recurring e2e
red that was mistaken for environmental flake.

**How to apply:** when changing user-facing labels/headings/button text, grep
`tests/platform/` for the old string and update the regex. When an e2e failure
is an "X not visible" timeout, first confirm the current UI copy before assuming
a real regression — run the single spec against the live (warm) dev server.
