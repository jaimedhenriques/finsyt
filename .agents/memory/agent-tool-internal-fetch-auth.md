---
name: Agent tools calling protected internal routes
description: When an agent tool fetches a platform /api/* route server-side, protecting that route requires forwarding the caller's auth in the tool.
---

The platform's agent tools (in `app/api/agent/ask/route.ts`) call internal
`/api/*` routes server-side via `safeFetch(\`\${base}/api/...\`)`. These
server-side calls carry NO user cookies by default.

**Rule:** If you add an internal `/api/*` route to `isProtectedApiRoute`
(middleware.ts) AND an agent tool calls that route, you MUST forward the
caller's auth in that tool — pass `{ headers: fwd }` on every `safeFetch`.
`fwd` (the forwarded auth headers derived from the incoming request) is already
handed to every tool's `run()` at the call site; thread it through the tool's
signature like the peer tools and `get_macro_series` do.

**Why:** Without this, the agent's server-side call to the now-protected route
returns 401 in non-OPEN_MODE (i.e. real prod). It "works" in OPEN_MODE demo
because middleware is bypassed there, so the breakage is invisible locally.

**How to apply:** Whenever you protect a route that the agent consumes, grep the
agent route for the tool that calls it and add `fwd` forwarding in the same
change. Public `/api/v1/*` wrappers are unaffected — they invoke handlers
in-process (`callInternalGet`), not over HTTP, so middleware never gates them.
