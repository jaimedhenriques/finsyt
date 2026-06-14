/**
 * Unit tests for `buildFollowups` — the Research page's guided follow-up
 * suggestion builder.
 *
 * `buildFollowups` is purely functional: given the tool steps that ran and
 * the citation set the agent returned, it produces up to 4 de-duplicated
 * question suggestions.  These specs lock the tool-set → suggestion mapping,
 * the most-cited-ticker resolution, the fallback subject noun, the cap/dedupe
 * logic, and the always-present critical-thinking tail item.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildFollowups, type TimelineStep, type CitationLike } from '../research-followups.ts'

// ── Helpers ──────────────────────────────────────────────────────────────────

function okTool(name: string, id = name): Extract<TimelineStep, { kind: 'tool' }> {
  return { kind: 'tool', id, name, label: name, status: 'ok' }
}

function errTool(name: string, id = name): Extract<TimelineStep, { kind: 'tool' }> {
  return { kind: 'tool', id, name, label: name, status: 'err' }
}

function pendingTool(name: string, id = name): Extract<TimelineStep, { kind: 'tool' }> {
  return { kind: 'tool', id, name, label: name, status: 'pending' }
}

function phase(p: 'plan' | 'tools' | 'synthesise'): Extract<TimelineStep, { kind: 'phase' }> {
  return { kind: 'phase', phase: p, label: p }
}

function cites(ticker: string, n = 1): CitationLike[] {
  return Array.from({ length: n }, () => ({ ticker }))
}

// ── Baseline ─────────────────────────────────────────────────────────────────

test('buildFollowups — no tools, no citations → single critical-thinking item with generic subject', () => {
  const result = buildFollowups([], [])
  assert.equal(result.length, 1)
  assert.ok(result[0].includes('this company'), `expected generic subject, got: "${result[0]}"`)
})

test('buildFollowups — always appends the critical-thinking item', () => {
  const result = buildFollowups([okTool('get_news')], cites('NVDA'))
  assert.ok(
    result.some(s => s.startsWith('What could go wrong')),
    `critical-thinking item missing in: ${JSON.stringify(result)}`,
  )
})

// ── Tool → suggestion mapping ─────────────────────────────────────────────────

test('buildFollowups — get_financials → revenue/margins and valuation suggestions', () => {
  const result = buildFollowups([okTool('get_financials')], cites('MSFT'))
  assert.ok(result.some(s => s.includes("revenue and margins")), 'missing financials suggestion')
  assert.ok(result.some(s => s.includes('valuation compare')), 'missing peer valuation suggestion')
})

test('buildFollowups — get_quote without get_financials → valuation suggestion only', () => {
  const result = buildFollowups([okTool('get_quote')], cites('AAPL'))
  assert.ok(result.some(s => s.includes('valuation compare')), 'missing peer valuation suggestion')
  assert.ok(!result.some(s => s.includes('revenue and margins')), 'unexpected financials suggestion')
})

test('buildFollowups — get_filings → risk factors suggestion', () => {
  const result = buildFollowups([okTool('get_filings')], cites('AAPL'))
  assert.ok(result.some(s => s.includes('risk factors')), 'missing risk factors suggestion')
})

test('buildFollowups — get_transcripts → forward guidance suggestion', () => {
  const result = buildFollowups([okTool('get_transcripts')], cites('NVDA'))
  assert.ok(result.some(s => s.includes('forward guidance')), 'missing guidance suggestion')
})

test('buildFollowups — get_estimates → sell-side consensus suggestion', () => {
  const result = buildFollowups([okTool('get_estimates')], cites('META'))
  assert.ok(result.some(s => s.includes('sell-side consensus')), 'missing estimates suggestion')
})

test('buildFollowups — get_news → news summary suggestion', () => {
  const result = buildFollowups([okTool('get_news')], cites('NVDA'))
  assert.ok(result.some(s => s.includes('news from the past week')), 'missing news suggestion')
})

test('buildFollowups — get_macro → macro backdrop suggestion', () => {
  const result = buildFollowups([okTool('get_macro')], cites('NVDA'))
  assert.ok(result.some(s => s.includes('macro backdrop')), 'missing macro suggestion')
})

// ── Status filtering ──────────────────────────────────────────────────────────

test('buildFollowups — only ok tools contribute; pending and err are ignored', () => {
  const steps: TimelineStep[] = [
    okTool('get_news'),
    errTool('get_filings'),
    pendingTool('get_estimates'),
  ]
  const result = buildFollowups(steps, cites('NVDA'))
  assert.ok(result.some(s => s.includes('news')), 'ok tool should contribute')
  assert.ok(!result.some(s => s.includes('risk factors')), 'err tool must not contribute')
  assert.ok(!result.some(s => s.includes('sell-side consensus')), 'pending tool must not contribute')
})

test('buildFollowups — phase steps are ignored (only tool steps count)', () => {
  const steps: TimelineStep[] = [
    phase('plan'),
    phase('tools'),
    okTool('get_news'),
    phase('synthesise'),
  ]
  const result = buildFollowups(steps, cites('NVDA'))
  assert.ok(result.some(s => s.includes('news')), 'ok tool step should still contribute')
})

// ── Ticker resolution ─────────────────────────────────────────────────────────

test('buildFollowups — uses the most-cited ticker as the subject', () => {
  const citations: CitationLike[] = [
    ...cites('NVDA', 3),
    ...cites('AAPL', 1),
  ]
  const result = buildFollowups([okTool('get_news')], citations)
  assert.ok(result.some(s => s.includes('NVDA')), 'most-cited ticker NVDA should appear')
  assert.ok(!result.some(s => s.includes('AAPL')), 'non-dominant ticker should not appear')
})

test('buildFollowups — falls back to "this company" when no ticker present', () => {
  const noCites: CitationLike[] = [{ ticker: undefined }, {}]
  const result = buildFollowups([okTool('get_financials')], noCites)
  assert.ok(result.some(s => s.includes('this company')), 'fallback subject missing')
})

test('buildFollowups — single ticker in citations used as subject', () => {
  const result = buildFollowups([okTool('get_filings')], cites('TSLA'))
  assert.ok(result.some(s => s.includes('TSLA')), 'ticker should appear in suggestions')
})

// ── De-duplication and cap ────────────────────────────────────────────────────

test('buildFollowups — result is capped at 4 items', () => {
  // All tools ok → would produce up to 8 suggestions before capping.
  const allTools = [
    'get_financials', 'get_quote', 'get_filings',
    'get_transcripts', 'get_estimates', 'get_news', 'get_macro',
  ].map(n => okTool(n))
  const result = buildFollowups(allTools, cites('NVDA'))
  assert.ok(result.length <= 4, `expected ≤4 items, got ${result.length}`)
})

test('buildFollowups — result contains no duplicate strings', () => {
  // get_financials triggers both "revenue/margins" and "valuation" suggestions;
  // get_quote triggers "valuation" too — deduplication must prevent two copies.
  const steps = [okTool('get_financials'), okTool('get_quote')]
  const result = buildFollowups(steps, cites('NVDA'))
  const unique = new Set(result)
  assert.equal(unique.size, result.length, `duplicates found: ${JSON.stringify(result)}`)
})

test('buildFollowups — returns a plain Array, not a Set', () => {
  const result = buildFollowups([okTool('get_news')], cites('NVDA'))
  assert.ok(Array.isArray(result), 'result must be an array')
})

test('buildFollowups — empty steps with citations still returns critical-thinking item', () => {
  const result = buildFollowups([], cites('TSLA', 5))
  assert.equal(result.length, 1)
  assert.ok(result[0].includes('TSLA'), 'ticker should appear even with no tool steps')
})
