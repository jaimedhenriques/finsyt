/**
 * Unit tests for the pure deliverable-verification engine and the house-style
 * apply helpers it depends on. No DB / network — every input is constructed
 * in-memory.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { verifyDeck, verifyMatrix } from '../deliverable-verification'
import {
  DEFAULT_HOUSE_STYLE,
  normalizeHouseStyleConfig,
  reformatNumberToHouseStyle,
  formatNumberWithHouseStyle,
  parseFormattedNumber,
  applyHouseStyleToBrand,
  applyTerminology,
  findBannedTerms,
  defaultHouseStyle,
  type HouseStyle,
} from '../house-style'
import type { DeckTemplate } from '../deck-service'
import type { MatrixExportData } from '../matrix-pptx'

function hs(overrides: Partial<HouseStyle['config']> = {}, enabled = true): HouseStyle {
  return {
    enabled,
    config: normalizeHouseStyleConfig({ ...DEFAULT_HOUSE_STYLE, ...overrides }),
    updatedByUserId: 'u1',
    updatedAt: new Date().toISOString(),
  }
}

function baseDeck(sections: DeckTemplate['sections']): DeckTemplate {
  return {
    templateId: 'banker-pitch',
    context: {
      brand: {} as DeckTemplate['context']['brand'],
      cover: { title: 'Test Deck', asOf: '2026-06-27' } as DeckTemplate['context']['cover'],
      asOf: '2026-06-27',
      footerLine: 'Finsyt',
      dataSources: [],
      globalCitations: [],
    },
    sections,
  }
}

// ── parseFormattedNumber ─────────────────────────────────────────────────────

test('parseFormattedNumber handles currency, percent, multiple, parentheses', () => {
  assert.deepEqual(parseFormattedNumber('$1,234.5'), { value: 1234.5, currency: '$', percent: false, multiple: false, suffix: '' })
  assert.deepEqual(parseFormattedNumber('12.3%'), { value: 12.3, currency: null, percent: true, multiple: false, suffix: '' })
  assert.deepEqual(parseFormattedNumber('(7.2)'), { value: -7.2, currency: null, percent: false, multiple: false, suffix: '' })
  assert.deepEqual(parseFormattedNumber('24.0x'), { value: 24, currency: null, percent: false, multiple: true, suffix: '' })
  assert.equal(parseFormattedNumber('not a number'), null)
  assert.equal(parseFormattedNumber(''), null)
})

// ── formatNumberWithHouseStyle ───────────────────────────────────────────────

test('formatNumberWithHouseStyle honours decimals, separators, negative style', () => {
  const nf = DEFAULT_HOUSE_STYLE.numberFormat
  assert.equal(formatNumberWithHouseStyle(1234.567, nf, { currency: '$' }), '$1,234.6')
  assert.equal(formatNumberWithHouseStyle(-7.25, nf, { multiple: true }), '(7.3x)')
  const minus = { ...nf, negativeStyle: 'minus' as const }
  assert.equal(formatNumberWithHouseStyle(-7.25, minus, { multiple: true }), '-7.3x')
  const noSep = { ...nf, thousandsSeparator: false }
  assert.equal(formatNumberWithHouseStyle(1234.5, noSep), '1234.5')
})

// ── reformatNumberToHouseStyle (the safe auto-fix) ───────────────────────────

test('reformatNumberToHouseStyle returns a fix only when value deviates', () => {
  const nf = DEFAULT_HOUSE_STYLE.numberFormat // 1 decimal, thousands sep, ()
  assert.equal(reformatNumberToHouseStyle('$1234.50', nf), '$1,234.5')
  assert.equal(reformatNumberToHouseStyle('-7.25x', nf), '(7.3x)')
  // Already compliant → null (no change).
  assert.equal(reformatNumberToHouseStyle('$1,234.5', nf), null)
  // Not a number → null.
  assert.equal(reformatNumberToHouseStyle('Strong buy', nf), null)
})

// ── applyHouseStyleToBrand ───────────────────────────────────────────────────

test('applyHouseStyleToBrand overrides only configured colors and respects enabled', () => {
  const brand = { navy: 'AAAAAA', ink: 'BBBBBB', accent: 'CCCCCC', positive: 'DDDDDD', negative: 'EEEEEE', surface: '111111' }
  const styled = applyHouseStyleToBrand(brand, hs({ brand: { ...DEFAULT_HOUSE_STYLE.brand, navy: '123456' } }))
  assert.equal(styled.navy, '123456')
  assert.equal(styled.surface, '111111') // untouched derived token
  // Disabled house style → no change.
  assert.deepEqual(applyHouseStyleToBrand(brand, hs({}, false)), brand)
  assert.deepEqual(applyHouseStyleToBrand(brand, null), brand)
})

// ── terminology / banned terms ───────────────────────────────────────────────

test('applyTerminology replaces whole words and preserves capitalisation', () => {
  const rules = [{ from: 'customer', to: 'client' }]
  assert.equal(applyTerminology('The customer and the Customer base', rules), 'The client and the Client base')
  // No partial-word replacement.
  assert.equal(applyTerminology('customers', rules), 'customers')
})

test('findBannedTerms detects whole-word, case-insensitive', () => {
  assert.deepEqual(findBannedTerms('This is a guaranteed return', ['guaranteed']), ['guaranteed'])
  assert.deepEqual(findBannedTerms('nothing here', ['guaranteed']), [])
})

// ── normalizeHouseStyleConfig (validation) ───────────────────────────────────

test('normalizeHouseStyleConfig coerces hostile input to a valid config', () => {
  const c = normalizeHouseStyleConfig({
    brand: { navy: '#zzzzzz', accent: '00ff00' },
    numberFormat: { decimals: 99, negativeStyle: 'minus' },
    terminology: [{ from: 'x', to: 'y' }, { from: '', to: 'z' }],
    bannedTerms: ['a', 'a', 'b'],
    reusablePrompts: 'nope',
  })
  assert.equal(c.brand.navy, DEFAULT_HOUSE_STYLE.brand.navy) // invalid hex falls back
  assert.equal(c.brand.accent, '00FF00')
  assert.equal(c.numberFormat.decimals, 6) // clamped to max
  assert.equal(c.numberFormat.negativeStyle, 'minus')
  assert.equal(c.terminology.length, 1) // empty `from` dropped
  assert.deepEqual(c.bannedTerms, ['a', 'b']) // deduped
  assert.deepEqual(c.reusablePrompts, [])
})

// ── verifyDeck ───────────────────────────────────────────────────────────────

test('verifyDeck flags missing citations on data slides', () => {
  const deck = baseDeck([
    { type: 'kpi-table', data: { title: 'KPIs', metrics: [{ label: 'Revenue', value: '$1,000.0' }] } },
  ])
  const report = verifyDeck(deck)
  assert.equal(report.deliverable, 'deck')
  const cite = report.issues.find((i) => i.category === 'missing-citation')
  assert.ok(cite, 'expected a missing-citation issue')
  assert.equal(cite!.severity, 'warning')
  assert.equal(cite!.location.slideIndex, 2)
})

test('verifyDeck passes citation check when a citation is present', () => {
  const deck = baseDeck([
    {
      type: 'kpi-table',
      data: { title: 'KPIs', metrics: [{ label: 'Revenue', value: '$1,000.0' }] },
      citations: [{ label: 'FMP', url: 'https://example.com' }],
    },
  ])
  const report = verifyDeck(deck)
  assert.equal(report.issues.filter((i) => i.category === 'missing-citation').length, 0)
})

test('verifyDeck detects cross-slide numeric inconsistency', () => {
  const deck = baseDeck([
    { type: 'kpi-table', data: { title: 'A', metrics: [{ label: 'Revenue', value: '$1,000.0' }] }, citations: [{ label: 'x' }] },
    { type: 'kpi-table', data: { title: 'B', metrics: [{ label: 'Revenue', value: '$1,200.0' }] }, citations: [{ label: 'x' }] },
  ])
  const report = verifyDeck(deck)
  const incons = report.issues.find((i) => i.category === 'numeric-inconsistency')
  assert.ok(incons, 'expected numeric inconsistency')
  assert.equal(incons!.severity, 'error')
  assert.equal(report.passed, false)
})

test('verifyDeck detects chart-vs-data series length mismatch', () => {
  const deck = baseDeck([
    {
      type: 'chart',
      data: { title: 'Rev', chartType: 'bar', xLabels: ['Q1', 'Q2', 'Q3'], series: [{ name: 'Revenue', values: [1, 2] }] },
      citations: [{ label: 'x' }],
    },
  ])
  const report = verifyDeck(deck)
  const mismatch = report.issues.find((i) => i.category === 'chart-data-mismatch')
  assert.ok(mismatch)
  assert.equal(mismatch!.severity, 'error')
})

test('verifyDeck offers auto-fixable house-style number format issues', () => {
  const deck = baseDeck([
    { type: 'kpi-table', data: { title: 'A', metrics: [{ label: 'Revenue', value: '$1234.50' }] }, citations: [{ label: 'x' }] },
  ])
  const report = verifyDeck(deck, { houseStyle: hs() })
  const fmt = report.issues.find((i) => i.category === 'house-style')
  assert.ok(fmt)
  assert.equal(fmt!.autoFixable, true)
  assert.equal(fmt!.autoFix?.replacement, '$1,234.5')
  assert.ok(report.summary.autoFixable >= 1)
})

test('verifyDeck applies no house-style checks when disabled', () => {
  const deck = baseDeck([
    { type: 'kpi-table', data: { title: 'A', metrics: [{ label: 'Revenue', value: '$1234.50' }] }, citations: [{ label: 'x' }] },
  ])
  const report = verifyDeck(deck, { houseStyle: hs({}, false) })
  assert.equal(report.houseStyleApplied, false)
  assert.equal(report.issues.filter((i) => i.category === 'house-style').length, 0)
})

// ── verifyMatrix ─────────────────────────────────────────────────────────────

function baseMatrix(cells: MatrixExportData['cells']): MatrixExportData {
  return {
    name: 'Test Matrix',
    generatedAt: new Date().toISOString(),
    rows: [{ id: 'r1', label: 'Apple', ticker: 'AAPL' }],
    columns: [{ id: 'c1', label: 'Thesis', prompt: 'What is the thesis?' }],
    cells,
  }
}

test('verifyMatrix flags errored cells as formula errors', () => {
  const report = verifyMatrix(baseMatrix({ 'r1.c1': { state: 'error', error: 'provider timeout' } }))
  const err = report.issues.find((i) => i.category === 'formula-error')
  assert.ok(err)
  assert.equal(err!.severity, 'error')
  assert.equal(report.passed, false)
  assert.match(err!.detail, /provider timeout/)
})

test('verifyMatrix flags completed cells missing citations', () => {
  const report = verifyMatrix(baseMatrix({ 'r1.c1': { state: 'done', text: 'Strong moat.', citations: [] } }))
  const cite = report.issues.find((i) => i.category === 'missing-citation')
  assert.ok(cite)
  assert.equal(cite!.severity, 'warning')
  assert.equal(cite!.location.rowId, 'r1')
  assert.equal(cite!.location.columnId, 'c1')
})

test('verifyMatrix passes a cited, completed cell', () => {
  const report = verifyMatrix(baseMatrix({
    'r1.c1': { state: 'done', text: 'Strong moat.', citations: [{ label: '10-K' }] },
  }))
  assert.equal(report.issues.length, 0)
  assert.equal(report.passed, true)
})

test('verifyMatrix flags banned terminology when house style enabled', () => {
  const report = verifyMatrix(
    baseMatrix({ 'r1.c1': { state: 'done', text: 'This is a guaranteed winner.', citations: [{ label: 'x' }] } }),
    { houseStyle: hs({ bannedTerms: ['guaranteed'] }) },
  )
  const banned = report.issues.find((i) => i.category === 'house-style')
  assert.ok(banned)
  assert.match(banned!.detail, /guaranteed/)
})

test('defaultHouseStyle is enabled and valid', () => {
  const d = defaultHouseStyle()
  assert.equal(d.enabled, true)
  assert.equal(d.config.numberFormat.decimals, 1)
})
