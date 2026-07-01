---
name: Optional @workspace/db imports
description: How to use the database from a module that may load without a DB configured
---

# Making @workspace/db optional in a module

`@workspace/db` throws at **module-evaluation time** if `DATABASE_URL` is unset
(see the top-level guard in `lib/db/src/index.ts`). A static `import` therefore
makes the importing module unloadable in any context without a DB (unit tests,
single-instance/no-DB fallback paths).

**Rule:** when a module must work both with and without a database, lazy
`await import("@workspace/db")` inside a function and `.catch()` the import so a
missing/broken DB degrades gracefully instead of crashing the module.

**Why:** the Excel op-bridge (`artifacts/platform/lib/excel-addin/op-bridge.ts`)
needs a Postgres shared store for multi-instance correctness but must still run
as a pure in-memory singleton in tests / no-DB envs. It flips an internal
`dbActive` flag off on the first failure to stop retrying.

**How to apply:** drizzle operators (`eq`, `and`, `lt`, …) come from
`drizzle-orm`, NOT from `@workspace/db` — import them from `drizzle-orm`
(also lazily if you want the whole module to stay DB-optional).

## Shared-store coordination must be order-safe (resolve-before-register)

When a producer (resolveOp) and a waiter (waitForOp) coordinate through a shared
DB row and can run on different instances, the result can arrive BEFORE the
waiter inserts its row. Make it order-safe:

- Resolver: **UPSERT** the resolved row (insert-or-update), never update-only.
  An update-only resolve is silently lost if the pending row doesn't exist yet.
- Waiter registration: insert with **onConflictDoNothing**, never reset the row
  to pending — that would clobber a result already recorded. Then poll (and do
  one immediate fetch right after registering) to pick up an already-resolved row.

**Why:** the Excel op-bridge originally used update-only resolve + register-resets-
to-pending, which lost cross-instance results that landed before the waiter and
re-stalled the build to timeout — the exact bug the shared store was meant to fix.
