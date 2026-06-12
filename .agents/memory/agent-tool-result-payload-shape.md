---
name: agent-tool-result-payload shape is locked
description: Why new fields on /api/agent/ask tool_result frames must go on the SSE frame, not the payload helper.
---

# buildAgentToolResultPayload output shape is asserted exactly

`lib/__tests__/agent-tool-result-payload.test.ts` asserts the EXACT key set
returned by `buildAgentToolResultPayload` (id, name, ok, provider, raw,
responseMs, summary). Adding a key to that helper's return breaks the test.

**Why:** the payload is a stable contract consumed by multiple surfaces; the
test guards against silent shape drift.

**How to apply:** when the research agent route (`app/api/agent/ask/route.ts`)
needs to send extra per-result data to the client (e.g. a stable global
citation index `citeIndex`), attach it to the emitted SSE frame in the
`send('tool_result', { ...payload, citeIndex })` wrapper — never inside
`buildAgentToolResultPayload`. The client (`app/app/research/page.tsx`) reads
the extra field straight off the parsed SSE `data`. Same rule for the
data-sources trace shape guarded by `data-sources-trace.test.ts`.
