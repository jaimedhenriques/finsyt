---
name: API-server prefix-less router.use auth leak
description: Why api-server admin/account HMAC routes can 401 despite a valid signature, and the ordering rule that prevents it.
---

The Express api-server has two distinct auth mechanisms:
- **HMAC-signed identity headers** (`req.actor`, set by `actorContext()`, enforced by `requireActor`/`requireOwner`) — used by the audit / retention / account routes, called server-to-server from the platform via `lib/audit-client.ts`.
- **Clerk session cookies** (`requireAuth`) — used by the research / me / team routes.

**The trap:** `me.ts` and `team.ts` apply their Clerk check with a **prefix-less** `router.use(requireAuth, ...)`. When a sub-router is mounted prefix-less (`router.use(meRouter)`), *every* request that reaches it runs that `router.use` middleware — not just the router's own `/me*` / `/team*` paths. So if `meRouter`/`teamRouter` are mounted *before* the HMAC-actor routers, a valid signed request to `/api/admin/audit/*`, `/api/admin/retention`, or `/api/account/*` gets 401'd by the Clerk gate before it ever reaches its `requireActor`/`requireOwner`.

**Symptom that wasted time:** the HMAC signature verifies fine (`sigOk: true`), `actorContext` sets `req.actor` and calls `next()`, yet the route still returns 401 — because the 401 comes from a *different* middleware (the prefix-less Clerk gate) earlier in the chain, and `requireOwner` is never even entered.

**Rule:** in `artifacts/api-server/src/routes/index.ts`, mount the HMAC-actor routers (`auditRouter`, `retentionRouter`, `accountRouter`) **before** the Clerk-gated routers (`meRouter`, `teamRouter`). Routes don't overlap (`/admin/*`, `/account/*` vs `/me*`, `/team*`), so the actor routes match and respond before the Clerk gate runs.

**Why:** this is the actual root cause of "Express api-server 401s on api-server-backed routes." It is *not* a secret/signature problem — `INTERNAL_AUTH_SECRET` must still be present in the environment (it lives in both dev and prod, and platform + api-server must share the identical value), but a correct secret alone does not fix it.

**How to apply / proper fix:** the ordering workaround is fragile. The clean fix is to scope `meRouter`/`teamRouter` to their path prefixes (mount under `/me` and `/team`, or apply auth per-route) so mount order stops mattering. Tracked as a follow-up.
