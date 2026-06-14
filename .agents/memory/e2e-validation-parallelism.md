---
name: e2e smoke flakes under parallel validation
description: Why platform e2e smoke specs flake only in the validation pipeline (not in isolation) and the durable fix.
---

# e2e smoke flakes under parallel validation

The `mark_task_complete` validation pipeline runs its commands **concurrently**,
not sequentially: the overall run duration ≈ the e2e command duration, which
means `pnpm --filter @workspace/tests run test` (Playwright smoke specs against
the live Next.js **dev** server) runs at the same time as `build`, `typecheck`,
`lint`, and unit `test`.

**Consequence:** the dev server is CPU-starved during validation, so routes
that compile on-demand (heaviest: `/app/valuations/[symbol]`, `/app/matrix`)
take far longer than in an isolated interactive run. Symptoms seen:
`net::ERR_ABORTED; maybe frame was detached?` on `page.goto`, navigation
timeouts at the per-test 60s cap, and `toBeVisible` assertions exceeding their
45s timeout. These are **environmental**, not product bugs — the same specs
pass in seconds when run alone against a warm server.

**Durable fix:** `retries: 1` in `tests/playwright.config.ts`. A Playwright
retry only re-runs *failed* tests; the failed first attempt warms Next.js's
in-memory route compile cache (the dev server keeps compiling in the
background even after the client aborts), so the retry hits an already-compiled
fast route and passes. A genuine regression still fails both attempts, so this
does not mask real failures.

**Why:** prefer hardening navigation/retry over weakening assertions or
loosening timeouts blindly. Don't "fix" these by deleting/skipping the specs.

**How to apply:** if a platform smoke spec fails *only* in the validation run
with a timeout/abort but passes in isolation (`cd tests && SKIP_SEED_DEMO=1
pnpm exec playwright test platform/<spec>`), it's this contention issue — keep
`retries: 1` and, for the heaviest pages, a `gotoWithRetry` navigation helper
that retries on `ERR_ABORTED`/frame-detached. Also: the demo seed in
`global-setup.ts` talks to Clerk over the network — a transient `fetch failed`
must not throw (it would abort the whole suite); retry + warn-and-continue.
