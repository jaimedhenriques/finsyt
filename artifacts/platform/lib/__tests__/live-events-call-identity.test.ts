import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BUCKET_MIN,
  callKey,
  liveSelection,
  type LiveCall,
} from '../live-events-pure'

// These tests pin the contract that the live-event source produces a STABLE
// `callKey` for the entire lifetime of a single physical call. The previous
// implementation derived `startedAt` from `now - phase*N`, which made it
// drift every poll and caused the live-highlights engine to treat every tick
// as a brand-new call — duplicating runs, pins and notifications. The fixed
// implementation anchors `startedAt` to the 5-minute wall-clock bucket the
// call first appeared in, so polling across multiple minutes — and across the
// 5-minute bucket boundary inside the call's lifetime — produces a single
// identity per call.

const dayAnchorMs = Date.UTC(2026, 4, 1, 12, 0, 0) // bucket-aligned

function pickFor(now: Date): LiveCall {
  const live = liveSelection(now)
  assert.ok(live.length > 0, 'expected at least one live call')
  return live[0]
}

test('callKey is stable across many polls within a single bucket', () => {
  const t0 = new Date(dayAnchorMs)
  const baseline = pickFor(t0)
  const baselineKey = callKey(baseline)
  // Poll every 5 seconds for the entire 5-minute bucket: the same physical
  // call must keep the same callKey and startedAt.
  for (let s = 0; s < BUCKET_MIN * 60; s += 5) {
    const now = new Date(dayAnchorMs + s * 1000)
    const live = liveSelection(now).find((c) => c.symbol === baseline.symbol)
    if (!live) continue
    assert.equal(live.startedAt, baseline.startedAt, `startedAt drifted at +${s}s`)
    assert.equal(callKey(live), baselineKey, `callKey drifted at +${s}s`)
  }
})

test('callKey is stable across the 5-min bucket boundary for a multi-bucket call', () => {
  // Find a call that is alive at t0 AND survives at least one bucket boundary
  // (i.e. at +5min the same symbol still appears in the selection).
  const t0 = new Date(dayAnchorMs)
  const t1 = new Date(dayAnchorMs + BUCKET_MIN * 60_000)
  const tMid = new Date(dayAnchorMs + 90_000) // 1m30s in
  const tBoundary = new Date(dayAnchorMs + BUCKET_MIN * 60_000 - 1) // last ms of bucket
  const tJustAfter = new Date(dayAnchorMs + BUCKET_MIN * 60_000 + 1) // first ms of next

  const t0Calls = liveSelection(t0)
  const t1Calls = liveSelection(t1)
  const survivors = t0Calls.filter((a) =>
    t1Calls.some((b) => b.symbol === a.symbol && b.event === a.event),
  )
  assert.ok(
    survivors.length > 0,
    'expected at least one call to survive past one 5-minute bucket boundary',
  )
  for (const a of survivors) {
    const b = t1Calls.find((x) => x.symbol === a.symbol && x.event === a.event)!
    const at0Mid = liveSelection(tMid).find(
      (x) => x.symbol === a.symbol && x.event === a.event,
    )!
    const atBoundary = liveSelection(tBoundary).find(
      (x) => x.symbol === a.symbol && x.event === a.event,
    )!
    const atJustAfter = liveSelection(tJustAfter).find(
      (x) => x.symbol === a.symbol && x.event === a.event,
    )
    assert.equal(callKey(a), callKey(b), `callKey changed across bucket boundary for ${a.symbol}`)
    assert.equal(callKey(a), callKey(at0Mid), `callKey changed mid-bucket for ${a.symbol}`)
    assert.equal(callKey(a), callKey(atBoundary), `callKey changed at end-of-bucket for ${a.symbol}`)
    if (atJustAfter) {
      assert.equal(
        callKey(a),
        callKey(atJustAfter),
        `callKey changed crossing bucket boundary for ${a.symbol}`,
      )
    }
  }
})

test('startedAt is anchored to the 5-min wall-clock bucket', () => {
  const live = liveSelection(new Date(dayAnchorMs + 13_000))
  for (const c of live) {
    const startedMs = new Date(c.startedAt).getTime()
    assert.equal(
      startedMs % (BUCKET_MIN * 60_000),
      0,
      `startedAt for ${c.symbol} is not bucket-aligned`,
    )
  }
})

test('back-to-back calls of the same ticker get distinct callKeys', () => {
  // Different bucket buckets must produce different keys for the same symbol.
  const a: LiveCall = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    event: 'Q1 2026 Earnings Call',
    startedAt: new Date(dayAnchorMs).toISOString(),
    listeners: 1,
  }
  const b: LiveCall = {
    ...a,
    startedAt: new Date(dayAnchorMs + BUCKET_MIN * 60_000).toISOString(),
  }
  assert.notEqual(callKey(a), callKey(b))
})
