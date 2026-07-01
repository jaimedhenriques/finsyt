---
name: e2e cold-compile flakiness (platform Playwright)
description: Why the platform Playwright suite flakes with ERR_ABORTED and the accepted fix pattern.
---

# Platform e2e cold-compile flakiness

The platform is a Next.js **dev** server during e2e. Heavy routes
(`/app/valuations`, `/app/valuations/[symbol]`, `/app/company/[symbol]`,
`/app/matrix`, `/app/research`, `/app/peers`, deck generation) cold-compile
for 10–15s under full-suite load. A raw `page.goto(...)` on such a route can
hit `net::ERR_ABORTED; maybe frame was detached?` and blow the test timeout.
This is an environment/dev-server artifact, **not** a product bug.

## The accepted fix (three layers, all required)

1. **`gotoWithRetry(page, path)`** (`tests/platform/_nav.ts`) — retries nav
   up to 3x (30s/attempt) on `ERR_ABORTED`/timeout. **Every spec that
   navigates a heavy route must use it instead of raw `page.goto`.** A raw
   goto on any heavy route is a latent flake vector — that is what moved the
   flake from contextual-ask/recent-decks to valuations once those were
   fixed but valuations still used raw goto.
2. **`prewarmHeavyRoutes()`** in `tests/global-setup.ts` — sequentially
   fetches the heavy pages/POSTs once before the suite so the first real
   test doesn't pay the cold-compile cost. This alone cut a green-but-flaky
   6.6m run to a clean 3.9m run.
3. **`retries: process.env.CI ? 2 : 1`** in `playwright.config.ts` — last
   line of defence; keep it low so it doesn't mask real product bugs.

**Why:** Playwright exits 0 on flaky-passed, so the workflow can be "green"
while still flaking. To make heavy-route specs pass *first attempt*, route
their navigations through `gotoWithRetry` AND keep them in the prewarm list —
don't rely on retries.

**How to apply:** When adding/auditing a platform spec, grep for
`page.goto` in `tests/platform/`. Auth-flow specs (`sign-in`, `open-mode`,
`demo-sign-in`) navigate light routes and inspect the nav response, so they
keep raw goto. Everything hitting an `/app/*` data route uses
`gotoWithRetry` and should be added to the prewarm list.
