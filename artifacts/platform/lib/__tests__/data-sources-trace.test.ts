/**
 * Unit tests for `traceFromToolResult` — the SSE-frame → footer-row mapper
 * that powers the "Data sources used" footer on the Research page, the
 * AI Analysis tab, and the Matrix cell drawer.
 *
 * These tests pin down the role-mapping waterfall (primary / fallback /
 * citation) and the fallback paths the function uses to recover a
 * provider key when the agent route only emits a `source` string in the
 * raw payload (legacy events).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  traceFromToolResult,
  roleForTool,
  providerKeyFromSource,
  connectorHubHref,
  dedupeTrace,
  type ProviderTrace,
} from '../data-sources-trace.ts'

// ─── roleForTool ────────────────────────────────────────────────────────────

test('roleForTool: citation tools always return citation regardless of provider', () => {
  assert.equal(roleForTool('get_news', 'fmp'), 'citation')
  assert.equal(roleForTool('get_filings', null), 'citation')
  assert.equal(roleForTool('get_transcripts', 'yahoo'), 'citation')
})

test('roleForTool: primary-shaped tool with a primary-tier provider stays primary', () => {
  // FMP is tier=primary in PROVIDER_META.
  assert.equal(roleForTool('get_quote', 'fmp'), 'primary')
  assert.equal(roleForTool('get_financials', 'fmp'), 'primary')
})

test('roleForTool: primary-shaped tool with a fallback-tier provider returns fallback', () => {
  // Yahoo, Alpha Vantage, Marketstack are tier=fallback in PROVIDER_META.
  assert.equal(roleForTool('get_quote', 'yahoo'), 'fallback')
  assert.equal(roleForTool('get_quote', 'alphav'), 'fallback')
  assert.equal(roleForTool('get_quote', 'marketstack'), 'fallback')
})

test('roleForTool: primary-shaped tool with no provider falls back to primary', () => {
  // No provider info → assume primary so we don't mislead users.
  assert.equal(roleForTool('get_quote', null), 'primary')
})

test('roleForTool: unknown tool defaults to primary', () => {
  assert.equal(roleForTool('mystery_tool', null), 'primary')
  assert.equal(roleForTool('mystery_tool', 'yahoo'), 'primary')
})

// ─── providerKeyFromSource ──────────────────────────────────────────────────

test('providerKeyFromSource: maps common source strings to provider keys', () => {
  assert.equal(providerKeyFromSource('FMP / EODHD'), 'fmp')
  assert.equal(providerKeyFromSource('Yahoo Finance'), 'yahoo')
  assert.equal(providerKeyFromSource('SEC EDGAR'), 'sec')
  assert.equal(providerKeyFromSource('FRED'), 'fred')
  assert.equal(providerKeyFromSource('Polygon.io'), 'massive')
})

test('providerKeyFromSource: returns null for unknown / empty input', () => {
  assert.equal(providerKeyFromSource(undefined), null)
  assert.equal(providerKeyFromSource(''), null)
  assert.equal(providerKeyFromSource('Some Brand New Provider'), null)
})

// ─── connectorHubHref ───────────────────────────────────────────────────────

test('connectorHubHref: returns the hub root when no provider key is given', () => {
  assert.equal(connectorHubHref(null), '/app/connectors')
  assert.equal(connectorHubHref(undefined), '/app/connectors')
})

test('connectorHubHref: deep-links to the provider row when given a key', () => {
  assert.equal(connectorHubHref('fmp'), '/app/connectors?provider=fmp')
  assert.equal(connectorHubHref('yahoo'), '/app/connectors?provider=yahoo')
})

// ─── traceFromToolResult ────────────────────────────────────────────────────

test('traceFromToolResult: maps a get_quote with FMP provider as primary', () => {
  const trace = traceFromToolResult({
    id: 'q-1',
    name: 'get_quote',
    ok: true,
    provider: 'FMP / EODHD',
    responseMs: 240,
  })
  assert.ok(trace, 'expected trace')
  assert.equal(trace!.role, 'primary')
  assert.equal(trace!.provider, 'fmp')
  assert.equal(trace!.label, 'Financial Modeling Prep')
  assert.equal(trace!.tool, 'get_quote')
  assert.equal(trace!.responseMs, 240)
  assert.equal(trace!.connectorHubHref, '/app/connectors?provider=fmp')
  // Primary rows must not advertise a citation count.
  assert.equal(trace!.citationCount, undefined)
})

test('traceFromToolResult: maps a get_quote with Yahoo provider as fallback', () => {
  const trace = traceFromToolResult({
    id: 'q-2',
    name: 'get_quote',
    ok: true,
    provider: 'Yahoo Finance',
    responseMs: 800,
  })
  assert.ok(trace)
  assert.equal(trace!.role, 'fallback')
  assert.equal(trace!.provider, 'yahoo')
  assert.equal(trace!.label, 'Yahoo Finance (RapidAPI)')
  assert.equal(trace!.connectorHubHref, '/app/connectors?provider=yahoo')
})

test('traceFromToolResult: maps get_news/get_filings/get_transcripts as citations', () => {
  for (const name of ['get_news', 'get_filings', 'get_transcripts']) {
    const trace = traceFromToolResult({
      id: `c-${name}`,
      name,
      ok: true,
      provider: 'SEC EDGAR',
      responseMs: 120,
    }, 3)
    assert.ok(trace, `expected trace for ${name}`)
    assert.equal(trace!.role, 'citation', `${name} should be citation`)
    assert.equal(trace!.citationCount, 3, `${name} should preserve citation count`)
  }
})

test('traceFromToolResult: citation count defaults from ok flag when not provided', () => {
  const ok = traceFromToolResult({ id: 'n-1', name: 'get_news', ok: true, provider: 'FMP' })
  const fail = traceFromToolResult({ id: 'n-2', name: 'get_news', ok: false, provider: 'FMP' })
  assert.equal(ok!.citationCount, 1)
  assert.equal(fail!.citationCount, 0)
})

test('traceFromToolResult: falls back to parsing raw.source when provider hint is missing', () => {
  // Legacy SSE frames only carried `raw` (a JSON-stringified payload). The
  // mapper must still recover the provider key so the Connector Hub link
  // points to the right row.
  const trace = traceFromToolResult({
    id: 'q-legacy',
    name: 'get_quote',
    ok: true,
    raw: JSON.stringify({ source: 'Yahoo Finance', last: 123 }),
    responseMs: 410,
  })
  assert.ok(trace)
  assert.equal(trace!.provider, 'yahoo')
  assert.equal(trace!.role, 'fallback')
})

test('traceFromToolResult: tolerates malformed raw JSON without throwing', () => {
  const trace = traceFromToolResult({
    id: 'q-bad',
    name: 'get_quote',
    ok: true,
    raw: '{not valid json',
    responseMs: 50,
  })
  assert.ok(trace, 'should still produce a trace')
  assert.equal(trace!.provider, undefined)
  assert.equal(trace!.role, 'primary')
})

test('traceFromToolResult: uses TOOL_LABEL_FALLBACK when no provider label is available', () => {
  const trace = traceFromToolResult({
    id: 'q-noprov',
    name: 'get_estimates',
    ok: true,
  })
  assert.ok(trace)
  // Should derive the friendly label from the tool name, not `event.name`.
  assert.equal(trace!.label, 'Sell-side estimates')
  assert.equal(trace!.role, 'primary')
  assert.equal(trace!.connectorHubHref, '/app/connectors')
})

test('traceFromToolResult: returns null when name is missing', () => {
  // Defensive: agent should never emit a nameless tool_result, but if it
  // does we must not insert a junk row.
  assert.equal(traceFromToolResult({ id: 'x', ok: true } as any), null)
  assert.equal(traceFromToolResult({} as any), null)
})

test('traceFromToolResult: omits responseMs when not a number', () => {
  const trace = traceFromToolResult({
    id: 'q-3',
    name: 'get_quote',
    ok: true,
    provider: 'FMP',
    responseMs: undefined,
  })
  assert.equal(trace!.responseMs, undefined)
})

// ─── dedupeTrace ────────────────────────────────────────────────────────────

test('dedupeTrace: collapses repeated tool+provider rows and sums citation counts', () => {
  const a: ProviderTrace = {
    id: '1', tool: 'get_news', provider: 'fmp', label: 'FMP', role: 'citation',
    responseMs: 100, citationCount: 2, connectorHubHref: '/app/connectors?provider=fmp',
  }
  const b: ProviderTrace = {
    id: '2', tool: 'get_news', provider: 'fmp', label: 'FMP', role: 'citation',
    responseMs: 250, citationCount: 3, connectorHubHref: '/app/connectors?provider=fmp',
  }
  const c: ProviderTrace = {
    id: '3', tool: 'get_quote', provider: 'fmp', label: 'FMP', role: 'primary',
    responseMs: 90, connectorHubHref: '/app/connectors?provider=fmp',
  }
  const out = dedupeTrace([a, b, c])
  assert.equal(out.length, 2, 'two unique tool/provider buckets')
  const news = out.find(r => r.tool === 'get_news')!
  assert.equal(news.responseMs, 250, 'worst-case latency wins')
  assert.equal(news.citationCount, 5, 'citation counts are summed')
  const quote = out.find(r => r.tool === 'get_quote')!
  assert.equal(quote.responseMs, 90)
})
