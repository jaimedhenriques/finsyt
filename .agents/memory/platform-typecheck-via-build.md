---
name: Platform typecheck via next build
description: How the Finsyt platform artifact is actually typechecked, and why raw tsc is misleading.
---

The `@workspace/platform` package defines no `typecheck` npm script. The root
`pnpm run typecheck` runs `tsc --build` for libs then `pnpm -r ... --if-present run typecheck`
for leaf artifacts — so platform is silently skipped there. The api-server,
marketing, mockup-sandbox, and scripts packages DO have typecheck scripts and run.

**The canonical typecheck for platform is `next build`** (the `build` workflow:
`pnpm run typecheck && pnpm run test && ... && pnpm run build:artifacts`). A green
`[platform] === ok` line in the build log means platform TS compiled.

**Why:** running `npx tsc -p tsconfig.json --noEmit` from `artifacts/platform`
includes the `lib/__tests__/**` files (which use `.ts` import extensions —
TS5097 — and `node:test` patterns) plus stale `.next/types`, producing a wall of
pre-existing errors that are NOT build-blocking. Don't trust raw `tsc -p` output
for this package; trust the `build` workflow instead.

**How to apply:** to validate platform changes, run/check the `build` workflow (or
`pnpm --filter @workspace/platform run build` with PORT/BASE_PATH wired), not
`pnpm --filter @workspace/platform run typecheck` (doesn't exist) or bare `tsc -p`.
