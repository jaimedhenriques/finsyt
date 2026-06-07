/**
 * Tests for the premium-connector credential-validation pipe.
 *
 * Two routes share this pipe:
 *
 *   - `POST /api/connectors/connections`            (inline validation
 *     on create) — runs `runValidationCall` immediately after insert and
 *     uses the result to set `status = active | error`.
 *   - `POST /api/connectors/connections/[id]/test`  (manual test button)
 *     — picks a strategy via `selectTestStrategy` and, when the catalog
 *     entry ships a `validateOperation`, also calls `runValidationCall`.
 *
 * Both code paths converge on `lib/connectors/validation.ts`. The tests
 * here exercise that helper directly with a stub executor (the executor
 * is the only side-effecting boundary above `fetch`), which is equivalent
 * to mocking `fetch` for the validation flow without having to spin up
 * Postgres / Clerk / Next route handling for every assertion.
 *
 * Coverage:
 *   (a) `mergeCredentialDefaults` applies catalog defaults under user creds
 *       (user wins, defaults populated when user omits them).
 *   (b) Successful `validateOperation` → outcome.ok=true, detail names the op.
 *   (c) Failed `validateOperation` (HTTP 401) → outcome.ok=false with the
 *       friendly translation from `describeValidationFailure`.
 *   (d) `selectTestStrategy` returns `validate` whenever the catalog entry
 *       has a `validateOperation`, so the test endpoint short-circuits the
 *       blunt base-URL ping for premium tiles. MCP and ping fall-throughs
 *       are also pinned.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  mergeCredentialDefaults,
  runValidationCall,
  selectTestStrategy,
  type ConnectionExecutor,
} from '../connectors/validation.ts'
import type { ExecuteInput, ExecuteResult } from '../connectors/executor.ts'

// ── Helpers ────────────────────────────────────────────────────────────────

interface StubExecutorOptions {
  /** Override the fixed result returned for every call. */
  result?: Partial<ExecuteResult>
}

interface StubExecutor {
  fn: ConnectionExecutor
  calls: ExecuteInput[]
}

/**
 * Build a stub executor that records every invocation and returns a
 * configurable result. Equivalent to mocking `fetch`: the executor's
 * only real boundary is the upstream HTTP call and the DB-backed
 * `loadConnection` / `recordEvent` writes — both irrelevant to the
 * validation-pipe behaviour we are pinning here.
 */
function makeStubExecutor(opts: StubExecutorOptions = {}): StubExecutor {
  const calls: ExecuteInput[] = []
  const fn = (async (input: ExecuteInput): Promise<ExecuteResult> => {
    calls.push(input)
    return {
      ok: true,
      status: 200,
      data: { ok: true },
      latencyMs: 12,
      ...opts.result,
    }
  }) as ConnectionExecutor
  return { fn, calls }
}

// ── (a) mergeCredentialDefaults ────────────────────────────────────────────

test('(a) mergeCredentialDefaults: catalog defaults populate missing fields', () => {
  // CapIQ ships `header_name: "Apikey"` as a server-only default. The user
  // only types in their `api_key`; the merged bag must carry both so
  // `applyAuth` knows which header to set the key under.
  const merged = mergeCredentialDefaults(
    { header_name: 'Apikey' },
    { api_key: 'sk_live_xyz' },
  )
  assert.deepEqual(merged, { header_name: 'Apikey', api_key: 'sk_live_xyz' })
})

test('(a) mergeCredentialDefaults: user-supplied values win over defaults', () => {
  // If a sophisticated user explicitly overrides a default (e.g. a customer
  // whose CapIQ tenant ships keys under `X-API-Key` instead of `Apikey`),
  // their value must take precedence. This is the contract the route
  // documents in the comment above the merge call.
  const merged = mergeCredentialDefaults(
    { header_name: 'Apikey' },
    { header_name: 'X-API-Key', api_key: 'sk_live_xyz' },
  )
  assert.equal(merged.header_name, 'X-API-Key')
  assert.equal(merged.api_key, 'sk_live_xyz')
})

test('(a) mergeCredentialDefaults: empty / nullish inputs are tolerated', () => {
  assert.deepEqual(mergeCredentialDefaults(undefined, undefined), {})
  assert.deepEqual(mergeCredentialDefaults(null, null), {})
  assert.deepEqual(mergeCredentialDefaults({}, { foo: 'bar' }), { foo: 'bar' })
  assert.deepEqual(mergeCredentialDefaults({ foo: 'def' }, undefined), { foo: 'def' })
  // The returned object must be a fresh copy — mutating it should not leak
  // back into the catalog row.
  const defaults = { header_name: 'Apikey' }
  const merged = mergeCredentialDefaults(defaults, { api_key: 'k' })
  merged.header_name = 'mutated'
  assert.equal(defaults.header_name, 'Apikey', 'caller mutation must not alias the catalog')
})

// ── (b) Successful validation ──────────────────────────────────────────────

test('(b) runValidationCall: successful executor result → ok=true and status=active copy', async () => {
  // Mirrors the FactSet symbology lookup happy path: upstream returns 200
  // and the route uses `outcome.ok` to set `status = active`.
  const executor = makeStubExecutor({ result: { ok: true, status: 200, latencyMs: 42 } })
  const outcome = await runValidationCall({
    orgId: 'org_1',
    connectionId: 'conn_1',
    operation: 'symbology_lookup',
    params: { ids: 'AAPL-US' },
    actorId: 'user_1',
    executor: executor.fn,
  })

  assert.equal(outcome.ok, true)
  assert.equal(outcome.status, 200)
  assert.equal(outcome.latencyMs, 42)
  assert.equal(outcome.error, undefined, 'success must not carry an error message')
  assert.match(outcome.detail, /Validated via symbology_lookup/)
  assert.match(outcome.detail, /HTTP 200/)

  // The executor must be called exactly once with bypassCache=true so a
  // recently-cached success cannot mask a now-revoked credential.
  assert.equal(executor.calls.length, 1)
  const call = executor.calls[0]
  assert.equal(call.orgId, 'org_1')
  assert.equal(call.connectionId, 'conn_1')
  assert.equal(call.operation, 'symbology_lookup')
  assert.deepEqual(call.params, { ids: 'AAPL-US' })
  assert.equal(call.bypassCache, true)
  assert.equal(call.actorId, 'user_1')
})

test('(b) runValidationCall: missing params/actorId default to {} and null', async () => {
  // The Bloomberg DL `catalogs_list` validate path ships no `validateParams`,
  // so the route passes `entry.validateParams ?? {}`. Pin that the helper
  // tolerates the omission and still bypasses the cache.
  const executor = makeStubExecutor({ result: { ok: true, status: 200, latencyMs: 5 } })
  await runValidationCall({
    orgId: 'org',
    connectionId: 'conn',
    operation: 'catalogs_list',
    executor: executor.fn,
  })
  const call = executor.calls[0]
  assert.deepEqual(call.params, {})
  assert.equal(call.actorId, null)
  assert.equal(call.bypassCache, true)
})

// ── (c) Failed validation ──────────────────────────────────────────────────

test('(c) runValidationCall: HTTP 401 → ok=false with friendly credential-rejection copy', async () => {
  // Mirrors the "user pasted a stale FactSet API key" path. The executor
  // returns `{ok:false, status:401, error:"Upstream returned 401"}` and the
  // route uses `outcome.error` as the user-visible message. We assert the
  // friendly translation rather than the raw upstream string so a regression
  // that exposes "Upstream returned 401" instead of the helpful copy is
  // caught immediately.
  const executor = makeStubExecutor({
    result: {
      ok: false,
      status: 401,
      error: 'Upstream returned 401',
      latencyMs: 31,
    },
  })
  const outcome = await runValidationCall({
    orgId: 'org_1',
    connectionId: 'conn_1',
    operation: 'symbology_lookup',
    params: { ids: 'AAPL-US' },
    executor: executor.fn,
  })

  assert.equal(outcome.ok, false)
  assert.equal(outcome.status, 401)
  assert.equal(outcome.latencyMs, 31)
  assert.ok(outcome.error, 'failure must carry a user-facing error string')
  assert.equal(outcome.detail, outcome.error, 'detail and error stay in sync on failure')
  assert.match(outcome.error!, /Credentials were rejected/)
  assert.match(outcome.error!, /HTTP 401/)
})

test('(c) runValidationCall: HTTP 403 also reads as credential-rejection', async () => {
  // Some upstreams (e.g. CapIQ when the entitlement is missing for the
  // requested package) return 403 instead of 401. The friendly copy lumps
  // both into the same "double-check the values you pasted and entitlements"
  // bucket — pin that here so we don't accidentally split them apart.
  const executor = makeStubExecutor({
    result: { ok: false, status: 403, error: 'Upstream returned 403', latencyMs: 7 },
  })
  const outcome = await runValidationCall({
    orgId: 'o', connectionId: 'c', operation: 'reference_quote', executor: executor.fn,
  })
  assert.equal(outcome.ok, false)
  assert.match(outcome.error!, /Credentials were rejected/)
  assert.match(outcome.error!, /HTTP 403/)
})

test('(c) runValidationCall: network failure (status=0) → "could not reach" copy', async () => {
  // SSRF / DNS / TLS failures surface as `status: 0` from the executor.
  // The friendly copy points the user at provider reachability instead of
  // blaming their credentials — pin that mapping here.
  const executor = makeStubExecutor({
    result: { ok: false, status: 0, error: 'Fetch failed: ECONNREFUSED', latencyMs: 0 },
  })
  const outcome = await runValidationCall({
    orgId: 'o', connectionId: 'c', operation: 'symbology_lookup', executor: executor.fn,
  })
  assert.equal(outcome.ok, false)
  assert.match(outcome.error!, /Could not reach the provider/)
})

// ── (d) Test endpoint strategy selection ───────────────────────────────────

test('(d) selectTestStrategy: REST connection + catalog with validateOperation → "validate"', () => {
  // This is the exact decision the test endpoint makes for every premium
  // tile (FactSet, CapIQ, Refinitiv, Bloomberg, PitchBook). A regression
  // here would silently revert those tiles to the meaningless base-URL
  // ping, which always looks "reachable" because their roots reject
  // unauthenticated GETs.
  const strategy = selectTestStrategy(
    { kind: 'rest' },
    {
      validateOperation: 'symbology_lookup',
      validateParams: { ids: 'AAPL-US' },
    },
  )
  assert.deepEqual(strategy, {
    kind: 'validate',
    operation: 'symbology_lookup',
    params: { ids: 'AAPL-US' },
  })
})

test('(d) selectTestStrategy: REST + catalog without validateOperation → "ping"', () => {
  // The community tiles (FRED, FMP, …) don't ship a validateOperation;
  // they fall through to the base-URL ping which is fine because their
  // roots return a 200/302 even without a key.
  const strategy = selectTestStrategy({ kind: 'rest' }, { /* no validateOperation */ })
  assert.deepEqual(strategy, { kind: 'ping' })
})

test('(d) selectTestStrategy: REST + no catalog entry at all → "ping"', () => {
  // Custom (org-defined) connectors have no catalog row — we still want a
  // working test path so admins can sanity-check the URL.
  assert.deepEqual(selectTestStrategy({ kind: 'rest' }, null), { kind: 'ping' })
  assert.deepEqual(selectTestStrategy({ kind: 'rest' }, undefined), { kind: 'ping' })
})

test('(d) selectTestStrategy: validateParams default to {} when the catalog omits them', () => {
  // Bloomberg DL's `catalogs_list` ships no params; the route forwards
  // `entry.validateParams ?? {}` and the strategy must do the same.
  const strategy = selectTestStrategy({ kind: 'rest' }, { validateOperation: 'catalogs_list' })
  assert.deepEqual(strategy, { kind: 'validate', operation: 'catalogs_list', params: {} })
})

test('(d) selectTestStrategy: MCP connection always picks "mcp" regardless of catalog', () => {
  // MCP connections have no REST validateOperation concept — the test
  // endpoint must hit `mcpInitialize` even if a future catalog entry
  // somehow declared a validateOperation alongside an mcpUrl.
  assert.deepEqual(
    selectTestStrategy({ kind: 'mcp' }, { validateOperation: 'symbology_lookup' }),
    { kind: 'mcp' },
  )
  assert.deepEqual(selectTestStrategy({ kind: 'mcp' }, null), { kind: 'mcp' })
})

// ── End-to-end shape: test endpoint flow uses runValidationCall ────────────

test('(d) test-endpoint flow: validate strategy + runValidationCall pin "Validated via …" detail', async () => {
  // Replays the exact sequence the test endpoint performs for a premium
  // tile: pick the strategy from the catalog, then ask runValidationCall
  // for the outcome. The route assigns `detail = outcome.detail` straight
  // into the JSON response, so this also pins the `detail` copy.
  const catalog = {
    validateOperation: 'reference_quote',
    validateParams: { symbol: 'NasdaqGS:AAPL' },
  }
  const strategy = selectTestStrategy({ kind: 'rest' }, catalog)
  assert.equal(strategy.kind, 'validate', 'precondition: strategy must be validate')
  if (strategy.kind !== 'validate') return // type narrow for TS

  const executor = makeStubExecutor({ result: { ok: true, status: 200, latencyMs: 19 } })
  const outcome = await runValidationCall({
    orgId: 'org_1',
    connectionId: 'conn_1',
    operation: strategy.operation,
    params: strategy.params,
    actorId: 'user_1',
    executor: executor.fn,
  })

  assert.equal(outcome.ok, true)
  assert.equal(outcome.detail, 'Validated via reference_quote (HTTP 200)')
  // And the executor was invoked with the catalog-supplied stub params,
  // proving the test endpoint will not 4xx for a missing path placeholder.
  assert.deepEqual(executor.calls[0].params, { symbol: 'NasdaqGS:AAPL' })
})
