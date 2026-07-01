/**
 * Unit tests for `computeNextRunAt` (workflow scheduler cron math).
 *
 * Focus: the monthly day-of-month clamp. The naive `setUTCMonth(+1)` rolls
 * Jan 31 into March 3 because Feb has no 31st; the corrected logic clamps the
 * anchor day to the target month's last day so the cadence never skips a month.
 * Weekly/day-time and daily today-vs-tomorrow paths are pinned too.
 *
 * `computeNextRunAt` is a pure function, but `scheduler.ts` pulls in
 * `server-only`, `@workspace/db`, and the heavy `./executor` chain at import
 * time. We stub all three via the experimental module-mock API (wired into
 * `pnpm test` through package.json) so the test stays hermetic — no DB, no
 * pptx/storage deps, no network.
 */

import { test, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { WorkflowSchedule } from '@workspace/db'

mock.module('server-only', { namedExports: {} })
mock.module('@workspace/db', { namedExports: { db: {}, workflowsTable: {} } })

const EXECUTOR_URL = new URL('../workflows/executor.ts', import.meta.url).href
mock.module(EXECUTOR_URL, { namedExports: { runWorkflow: async () => ({}) } })

// Imported in `before()` (not top-level) — tsx's cjs transform forbids
// top-level await, and the import must happen after the mocks are registered.
let computeNextRunAt: (schedule: WorkflowSchedule, from?: Date) => Date

before(async () => {
  ;({ computeNextRunAt } = await import('../workflows/scheduler.ts'))
})

const iso = (d: Date) => d.toISOString()

// ── Monthly clamp ───────────────────────────────────────────────────────────

test('monthly: Jan 31 advances to Feb 28 (non-leap), not March', () => {
  const s: WorkflowSchedule = { frequency: 'Monthly', time: '08:00' }
  const next = computeNextRunAt(s, new Date('2025-01-31T10:00:00Z'))
  assert.equal(iso(next), '2025-02-28T08:00:00.000Z')
})

test('monthly: Jan 31 advances to Feb 29 in a leap year', () => {
  const s: WorkflowSchedule = { frequency: 'Monthly', time: '08:00' }
  const next = computeNextRunAt(s, new Date('2028-01-31T10:00:00Z'))
  assert.equal(iso(next), '2028-02-29T08:00:00.000Z')
})

test('monthly: Dec 31 rolls over to Jan 31 of the next year', () => {
  const s: WorkflowSchedule = { frequency: 'Monthly', time: '08:00' }
  const next = computeNextRunAt(s, new Date('2025-12-31T10:00:00Z'))
  assert.equal(iso(next), '2026-01-31T08:00:00.000Z')
})

test('monthly: same-month occurrence when the time is still ahead', () => {
  const s: WorkflowSchedule = { frequency: 'Monthly', time: '09:00' }
  const next = computeNextRunAt(s, new Date('2025-01-15T06:00:00Z'))
  assert.equal(iso(next), '2025-01-15T09:00:00.000Z')
})

test('monthly: re-anchoring advances exactly one month each time (Jan 31 → Feb 28 → Mar 28)', () => {
  const s: WorkflowSchedule = { frequency: 'Monthly', time: '08:00' }
  const first = computeNextRunAt(s, new Date('2025-01-31T10:00:00Z'))
  assert.equal(iso(first), '2025-02-28T08:00:00.000Z')
  const second = computeNextRunAt(s, first)
  assert.equal(iso(second), '2025-03-28T08:00:00.000Z')
})

// ── Weekly ──────────────────────────────────────────────────────────────────

test('weekly: picks the next matching weekday at HH:MM', () => {
  // 2025-06-09 is a Monday; the next Wednesday is 2025-06-11.
  const s: WorkflowSchedule = { frequency: 'Weekly', day: 'Wed', time: '09:00' }
  const next = computeNextRunAt(s, new Date('2025-06-09T12:00:00Z'))
  assert.equal(iso(next), '2025-06-11T09:00:00.000Z')
  assert.equal(next.getUTCDay(), 3)
})

test('weekly: same weekday with the time already passed rolls a full week', () => {
  // 2025-06-11 is a Wednesday at 10:00; the 09:00 slot has passed → +7 days.
  const s: WorkflowSchedule = { frequency: 'Weekly', day: 'Wed', time: '09:00' }
  const next = computeNextRunAt(s, new Date('2025-06-11T10:00:00Z'))
  assert.equal(iso(next), '2025-06-18T09:00:00.000Z')
})

// ── Daily ───────────────────────────────────────────────────────────────────

test('daily: returns today when the time is still ahead', () => {
  const s: WorkflowSchedule = { frequency: 'Daily', time: '09:00' }
  const next = computeNextRunAt(s, new Date('2025-06-09T06:00:00Z'))
  assert.equal(iso(next), '2025-06-09T09:00:00.000Z')
})

test('daily: rolls to tomorrow when the time has passed', () => {
  const s: WorkflowSchedule = { frequency: 'Daily', time: '09:00' }
  const next = computeNextRunAt(s, new Date('2025-06-09T10:00:00Z'))
  assert.equal(iso(next), '2025-06-10T09:00:00.000Z')
})
