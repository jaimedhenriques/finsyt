---
name: artifacts/platform is not typechecked by CI
description: The platform package's TS is never validated by the validation pipeline; bare tsc -p surfaces a large pre-existing error backlog.
---

# artifacts/platform TypeScript is not gated by CI

The root `typecheck` workflow runs `pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck`, but **`artifacts/platform` has no `typecheck` script**, so `--if-present` silently skips it. The `build` workflow runs `next build`, but `artifacts/platform/next.config.ts` sets `typescript: { ignoreBuildErrors: true }`. Net effect: **platform TypeScript errors never fail any validation workflow.**

**Why this matters:** a green `build`/`typecheck`/`lint`/`test` run does NOT mean platform TS is clean. Running `npx tsc -p tsconfig.json --noEmit` inside `artifacts/platform` surfaces a backlog of pre-existing errors that have nothing to do with your change (e.g. `app/api/agent/ask/route.ts` memo-assembler `e.data`/`e.bytes` possibly-undefined, alerts page status `Badge` using non-`BadgeTone` values like `neg`/`pos`/`neutral`, several `lib/__tests__/*.test.ts` using `.ts` import extensions → TS5097, stale `.next/types/**` route export errors).

**How to apply:** after editing platform code, run bare `npx tsc -p tsconfig.json --noEmit` from `artifacts/platform` and **filter the output to only the files you touched** — do not try to drive the whole platform to zero errors (that is a large pre-existing backlog, out of scope). The platform tsconfig `include` pulls in `.next/types/**` and all `lib/__tests__/**`, so ignore stale `.next/types` route errors and pre-existing test-file errors. Trust this filtered bare-tsc check over the CI workflows for platform type safety, since CI does not check it at all.
