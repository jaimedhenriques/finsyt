---
name: node:test + tsx top-level await
description: Why unit tests under tsx must import their target module inside before(), not at top level
---

# node:test unit tests run under tsx's cjs transform — no top-level await

The platform `test` / `test:ci` scripts run `node --experimental-test-module-mocks
--import tsx --test <glob>`. tsx transforms each test to the **cjs** output format,
and esbuild rejects top-level `await` there:

```
ERROR: Top-level await is currently not supported with the "cjs" output format
```

**Rule:** in a `node:test` file you must register `mock.module(...)` calls at the top
level, but do the `await import('../target.ts')` of the module under test **inside a
`before()` hook**, assigning to a `let` declared at module scope. Top-level
`const x = await import(...)` will not transform.

**Why:** the module under test (e.g. `lib/workflows/scheduler.ts`) pulls in
`server-only`, `@workspace/db`, and heavy executor deps at import time, so it must be
imported *after* the mocks are registered — and that import can't be top-level await.
Mirror `lib/__tests__/live-highlights-persistence.test.ts`, which uses the same
`before()` + `mock.module` shape.

**How to run a single file** (tsx resolves relative to the package, so run from the
package dir, not the repo root):
`pnpm --filter @workspace/platform exec node --experimental-test-module-mocks --import tsx --test "lib/__tests__/<file>.test.ts"`
Running it from the workspace root fails with `Cannot find package 'tsx'`.
