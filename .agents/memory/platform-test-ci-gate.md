---
name: Platform test:ci gate runs a named allowlist, not the full glob
description: Why a new platform lib/__tests__ test can pass locally yet never run in the validation gate
---

The root `test` validation does NOT run every test in the repo. It is
`pnpm -r --filter "./scripts" --if-present run test && pnpm --filter @workspace/platform run test:ci`.

- `@workspace/platform`'s `test` script runs the full `lib/__tests__/**/*.test.ts`
  glob, but `test:ci` runs an explicit **named allowlist of files** (kept small to
  avoid DB-dependent suites). The validation gate calls `test:ci`, not `test`.
- `lib/db` (and other libs) have their own `test` scripts that the root `test`
  gate does **not** invoke at all.

**Why:** the gate is deliberately narrow so it stays fast and DB-free.

**How to apply:** when you add a regression test that must actually run in the
validation gate, append its file to the platform `test:ci` allowlist — dropping a
file into `lib/__tests__/` alone is not enough. Keep gate tests DB-free (the dev
DB is often unreachable). lib-level tests (e.g. `lib/db/src/__tests__`) only run
via that package's own `test` script, so treat them as manually/locally run
guards, not gate-enforced.
