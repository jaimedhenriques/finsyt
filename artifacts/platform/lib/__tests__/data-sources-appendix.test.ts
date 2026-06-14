/**
 * Snapshot-style tests for `buildDataSourcesAppendixSlide` — the printed
 * form of the "Data sources used" footer that ships with every Finsyt
 * agent answer.
 *
 * Current product contract (locked here so it can't drift silently):
 *   • The "Data Sources Used" appendix slide is ALWAYS appended to the
 *     deck (the wrapper in `deck-service` always invokes this builder).
 *     When `dataSources` is non-empty the slide renders a per-provider
 *     table; when it's empty the slide renders the
 *     "No provider trace was recorded for this memo" placeholder.
 *   • This is a deliberate change from the prior "skip the slide when
 *     empty" behaviour: we want a stable, predictable deck shape so the
 *     8-slide composition (cover + 6 memo + sources) holds regardless
 *     of which providers happened to fire.
 *
 * We assert that the slide builder renders every supplied trace row with
 * its provider label, role pill, response time, citation count and
 * Connector Hub deep link by recording every `addText` / `addShape`
 * call against a typed PptxGenJS-shaped mock. The 14-row table cap +
 * overflow notice is also locked in here so a layout regression can't
 * silently truncate rows without surfacing a "+N omitted" hint.
 *
 * The end-to-end deck shape (cover + 6 memo + "Data Sources Used") is
 * covered by `deck-service.test.ts`; this file intentionally focuses on
 * the appendix slide's internal contract. The SSE `tool_result` payload
 * shape that feeds these traces is locked by
 * `agent-tool-result-payload.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildDataSourcesAppendixSlide,
  type InvestmentMemoData,
  type DataSourceEntry,
} from '../investment-memo-pptx.ts'

// ─── Fixtures ───────────────────────────────────────────────────────────────

function baseMemoData(extra?: Partial<InvestmentMemoData>): InvestmentMemoData {
  return {
    identity: { ticker: 'TEST', name: 'Test Corp', exchange: 'NASDAQ', sector: 'Technology' },
    asOf: 'May 2026',
    sourceLine: 'Sources: Test Fixture.',
    overview:    { unavailable: true },
    valuation:   { unavailable: true },
    peers:       { unavailable: true },
    transactions:{ unavailable: true },
    dcf:         { unavailable: true },
    qualitative: { unavailable: true },
    ...extra,
  }
}

const SAMPLE_TRACE: DataSourceEntry[] = [
  {
    label: 'Financial Modeling Prep',
    role: 'primary',
    responseMs: 240,
    detail: 'Real-time quote',
    hubHref: '/app/connectors?provider=fmp',
  },
  {
    label: 'Yahoo Finance (RapidAPI)',
    role: 'fallback',
    responseMs: 1450,
    detail: 'Real-time quote',
    hubHref: '/app/connectors?provider=yahoo',
  },
  {
    label: 'SEC EDGAR',
    role: 'citation',
    responseMs: 320,
    citationCount: 4,
    detail: 'SEC filings',
    hubHref: '/app/connectors?provider=sec',
  },
]

// ─── Mock pptx that records what was rendered ────────────────────────────────
//
// We capture every text/shape call so we can assert that a given trace row
// produced its label, role pill, response-time string and Connector Hub
// hyperlink. The real `applyChrome` internals (header bar, footer page
// number, gradient stripe) also flow through this mock as no-op shape adds
// — that's intentional, the appendix builder is only responsible for what
// goes *inside* the chrome.

interface CapturedSlide {
  texts: string[]                    // every plain-string text chunk
  hyperlinks: { text: string; url: string }[]
  shapeCount: number
}

function makePptxMock(): { pptx: any; slides: CapturedSlide[] } {
  const slides: CapturedSlide[] = []
  const pushText = (slide: CapturedSlide, t: unknown) => {
    if (typeof t === 'string') {
      slide.texts.push(t)
      return
    }
    if (Array.isArray(t)) {
      for (const part of t) {
        if (typeof part === 'string') { slide.texts.push(part); continue }
        const text = (part as any)?.text
        if (typeof text === 'string') slide.texts.push(text)
        const link = (part as any)?.options?.hyperlink?.url
        if (typeof link === 'string' && typeof text === 'string') {
          slide.hyperlinks.push({ text, url: link })
        }
      }
    }
  }
  const slide = (): any => {
    const s: CapturedSlide = { texts: [], hyperlinks: [], shapeCount: 0 }
    slides.push(s)
    const obj = {
      addText: (t: unknown, _opts?: unknown) => {
        // pptxgenjs also accepts hyperlinks via the options block when the
        // text is a plain string. Capture that variant too.
        const opts = _opts as any
        if (typeof t === 'string' && opts?.hyperlink?.url) {
          s.hyperlinks.push({ text: t, url: String(opts.hyperlink.url) })
        }
        pushText(s, t)
        return obj
      },
      addShape: () => { s.shapeCount++; return obj },
      addImage: () => obj,
      addTable: () => obj,
      background: undefined,
      slideNumber: undefined,
    }
    return obj
  }
  const pptx = {
    addSlide: slide,
    layout: 'LAYOUT_WIDE',
    defineLayout: () => {},
  }
  return { pptx, slides }
}

// ─── Direct slide tests ─────────────────────────────────────────────────────

test('buildDataSourcesAppendixSlide: renders one row per trace with role, label, response time and hub link', () => {
  const { pptx, slides } = makePptxMock()
  const data = baseMemoData({ dataSources: SAMPLE_TRACE })
  buildDataSourcesAppendixSlide(pptx as any, data, 7, 7)

  assert.equal(slides.length, 1, 'should add exactly one slide')
  const s = slides[0]
  const text = s.texts.join(' | ')

  // Each trace row's provider label appears verbatim.
  assert.match(text, /Financial Modeling Prep/)
  assert.match(text, /Yahoo Finance/)
  assert.match(text, /SEC EDGAR/)

  // The role pills are title-cased exactly as the footer shows them.
  assert.match(text, /\bPrimary\b/)
  assert.match(text, /\bFallback\b/)
  assert.match(text, /\bCitation\b/)

  // Response time formatting: <1s → "ms", ≥1s → "X.XX s".
  assert.match(text, /240 ms/)
  assert.match(text, /1\.45 s/)
  assert.match(text, /320 ms/)

  // Citation count rendered for the citation row only.
  assert.ok(s.texts.includes('4'), 'should render citation count "4"')

  // Each hub href becomes a clickable hyperlink.
  const urls = s.hyperlinks.map(h => h.url).sort()
  assert.deepEqual(urls, [
    '/app/connectors?provider=fmp',
    '/app/connectors?provider=sec',
    '/app/connectors?provider=yahoo',
  ])
})

test('buildDataSourcesAppendixSlide: empty trace renders the unavailable placeholder (slide is ALWAYS added, never skipped)', () => {
  const { pptx, slides } = makePptxMock()
  const data = baseMemoData({ dataSources: [] })
  buildDataSourcesAppendixSlide(pptx as any, data, 7, 7)

  assert.equal(slides.length, 1)
  const text = slides[0].texts.join(' | ')

  // The unavailable placeholder is the only signal an empty appendix is allowed to emit.
  assert.match(text, /No provider trace was recorded/i)
  // No spurious provider rows or hyperlinks should leak through.
  assert.equal(slides[0].hyperlinks.length, 0)
  // None of the role pills should be drawn.
  assert.doesNotMatch(text, /\bPrimary\b/)
  assert.doesNotMatch(text, /\bFallback\b/)
  assert.doesNotMatch(text, /\bCitation\b/)
})

test('buildDataSourcesAppendixSlide: caps the table at 14 rows and notes the omitted overflow', () => {
  // Generate 16 trace rows → expect the 14-row table + an overflow note
  // ("+2 additional sources omitted for layout").
  const big: DataSourceEntry[] = Array.from({ length: 16 }, (_, i) => ({
    label: `Provider ${i + 1}`,
    role: 'primary' as const,
    responseMs: 100 + i,
    detail: `tool-${i}`,
    hubHref: `/app/connectors?provider=p${i}`,
  }))
  const { pptx, slides } = makePptxMock()
  buildDataSourcesAppendixSlide(pptx as any, baseMemoData({ dataSources: big }), 7, 7)
  const text = slides[0].texts.join(' | ')

  assert.match(text, /Provider 1\b/)
  assert.match(text, /Provider 14\b/)
  // Items 15 and 16 must NOT have rendered into the table body.
  assert.doesNotMatch(text, /Provider 15\b/)
  assert.doesNotMatch(text, /Provider 16\b/)
  assert.match(text, /\+2 additional sources? omitted for layout/i)
})

