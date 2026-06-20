/**
 * Report → PDF renderer
 * ─────────────────────
 * Renders an assembled `DeckTemplate` (see `lib/report-data.ts`) into a
 * branded, multi-page PDF using pdf-lib (pure-JS, no external font files —
 * relies on the 14 standard PDF fonts so it works in the serverless runtime).
 *
 * It walks the same `DeckSection` union the PPTX renderer uses, so PPTX and
 * PDF exports stay in lockstep. Layout is deliberately document-style
 * (letter-portrait, flowing pages) rather than slide-style: an analyst gets a
 * clean tearsheet they can print or attach.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { FINSYT_BRAND } from './deck-service'
import type { DeckTemplate, DeckSection } from './deck-service'

function hex(h: string) {
  const n = parseInt(h, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}
const NAVY = hex(FINSYT_BRAND.navy)
const INK = hex(FINSYT_BRAND.ink)
const BODY = hex(FINSYT_BRAND.body)
const MUTED = hex(FINSYT_BRAND.muted)
const ACCENT = hex(FINSYT_BRAND.accent)
const DIVIDER = hex(FINSYT_BRAND.divider)
const SURFACE = hex(FINSYT_BRAND.surface)
const POSITIVE = hex(FINSYT_BRAND.positive)
const WHITE = rgb(1, 1, 1)

const PAGE_W = 612 // US Letter portrait (8.5" × 72)
const PAGE_H = 792
const MARGIN = 54
const CONTENT_W = PAGE_W - MARGIN * 2

interface Ctx {
  doc: PDFDocument
  font: PDFFont
  bold: PDFFont
  page: PDFPage
  y: number
  asOf: string
  footer: string
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H])
  ctx.y = PAGE_H - MARGIN
  drawFooter(ctx)
}

function drawFooter(ctx: Ctx) {
  ctx.page.drawLine({
    start: { x: MARGIN, y: MARGIN - 14 },
    end: { x: PAGE_W - MARGIN, y: MARGIN - 14 },
    thickness: 0.5,
    color: DIVIDER,
  })
  ctx.page.drawText(ctx.footer, { x: MARGIN, y: MARGIN - 26, size: 7, font: ctx.font, color: MUTED })
  ctx.page.drawText(ctx.asOf, {
    x: PAGE_W - MARGIN - ctx.font.widthOfTextAtSize(ctx.asOf, 7),
    y: MARGIN - 26,
    size: 7,
    font: ctx.font,
    color: MUTED,
  })
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 8) newPage(ctx)
}

// Word-wrap `text` to `maxW` at `size`, returning the wrapped lines.
function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(cand, size) > maxW && line) {
        out.push(line)
        line = w
      } else {
        line = cand
      }
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

function drawParagraph(ctx: Ctx, text: string, size: number, font: PDFFont, color = BODY, indent = 0) {
  const lines = wrap(font, text, size, CONTENT_W - indent)
  const lh = size * 1.4
  for (const line of lines) {
    ensure(ctx, lh)
    ctx.page.drawText(line, { x: MARGIN + indent, y: ctx.y - size, size, font, color })
    ctx.y -= lh
  }
}

function sectionHeading(ctx: Ctx, title: string) {
  ensure(ctx, 34)
  ctx.y -= 10
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 2, width: 18, height: 3, color: ACCENT })
  ctx.y -= 6
  ctx.page.drawText(title, { x: MARGIN, y: ctx.y - 13, size: 13, font: ctx.bold, color: NAVY })
  ctx.y -= 24
}

function truncate(font: PDFFont, text: string, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > maxW) t = t.slice(0, -1)
  return `${t}…`
}

// ── Section renderers ─────────────────────────────────────────────────────────

function renderBullets(ctx: Ctx, title: string | undefined, bullets: string[]) {
  if (title) sectionHeading(ctx, title)
  for (const b of bullets.filter((x) => x && x.trim())) {
    const lines = wrap(ctx.font, b, 10, CONTENT_W - 14)
    const lh = 10 * 1.45
    ensure(ctx, lh)
    ctx.page.drawText('•', { x: MARGIN, y: ctx.y - 10, size: 10, font: ctx.bold, color: ACCENT })
    lines.forEach((line, i) => {
      if (i > 0) ensure(ctx, lh)
      ctx.page.drawText(line, { x: MARGIN + 14, y: ctx.y - 10, size: 10, font: ctx.font, color: BODY })
      ctx.y -= lh
    })
    ctx.y -= 3
  }
}

function renderKpiTiles(ctx: Ctx, title: string | undefined, metrics: { label: string; value: string }[]) {
  if (title) sectionHeading(ctx, title)
  const cols = 3
  const gap = 10
  const tileW = (CONTENT_W - gap * (cols - 1)) / cols
  const tileH = 46
  for (let i = 0; i < metrics.length; i += cols) {
    ensure(ctx, tileH + 8)
    const rowTop = ctx.y
    for (let c = 0; c < cols; c++) {
      const m = metrics[i + c]
      if (!m) continue
      const x = MARGIN + c * (tileW + gap)
      ctx.page.drawRectangle({
        x, y: rowTop - tileH, width: tileW, height: tileH, color: SURFACE,
        borderColor: DIVIDER, borderWidth: 0.5,
      })
      ctx.page.drawText(truncate(ctx.font, m.label.toUpperCase(), 7, tileW - 16), {
        x: x + 8, y: rowTop - 16, size: 7, font: ctx.font, color: MUTED,
      })
      ctx.page.drawText(truncate(ctx.bold, m.value, 14, tileW - 16), {
        x: x + 8, y: rowTop - 36, size: 14, font: ctx.bold, color: INK,
      })
    }
    ctx.y = rowTop - tileH - 8
  }
}

function renderBarChart(ctx: Ctx, title: string | undefined, series: { name: string; values: number[] }[], xLabels?: string[]) {
  if (title) sectionHeading(ctx, title)
  const s = series[0]
  if (!s || s.values.length === 0) return
  const chartH = 150
  ensure(ctx, chartH + 30)
  const top = ctx.y
  const baseY = top - chartH
  const max = Math.max(...s.values, 0)
  const min = Math.min(...s.values, 0)
  const range = max - min || 1
  const n = s.values.length
  const slot = CONTENT_W / n
  const barW = Math.min(slot * 0.6, 60)
  const zeroY = baseY + ((0 - min) / range) * chartH
  // axis
  ctx.page.drawLine({ start: { x: MARGIN, y: zeroY }, end: { x: MARGIN + CONTENT_W, y: zeroY }, thickness: 0.5, color: DIVIDER })
  s.values.forEach((v, i) => {
    const h = (Math.abs(v) / range) * chartH
    const x = MARGIN + i * slot + (slot - barW) / 2
    const y = v >= 0 ? zeroY : zeroY - h
    ctx.page.drawRectangle({ x, y, width: barW, height: h, color: ACCENT })
    const lbl = xLabels?.[i] ?? ''
    if (lbl) {
      ctx.page.drawText(truncate(ctx.font, lbl, 7, slot), {
        x: x + barW / 2 - ctx.font.widthOfTextAtSize(lbl, 7) / 2,
        y: baseY - 12, size: 7, font: ctx.font, color: MUTED,
      })
    }
  })
  ctx.y = baseY - 22
}

function renderTable(ctx: Ctx, title: string | undefined, headers: string[], rows: string[][]) {
  if (title) sectionHeading(ctx, title)
  const cols = headers.length
  if (cols === 0) return
  // First column wider (labels), the rest even.
  const firstW = Math.min(CONTENT_W * 0.28, 150)
  const restW = (CONTENT_W - firstW) / Math.max(1, cols - 1)
  const colX = (c: number) => (c === 0 ? MARGIN : MARGIN + firstW + (c - 1) * restW)
  const colW = (c: number) => (c === 0 ? firstW : restW)
  const rowH = 18

  const drawHeader = () => {
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowH, width: CONTENT_W, height: rowH, color: NAVY })
    headers.forEach((h, c) => {
      ctx.page.drawText(truncate(ctx.bold, h, 8, colW(c) - 8), {
        x: colX(c) + 4, y: ctx.y - 13, size: 8, font: ctx.bold, color: WHITE,
      })
    })
    ctx.y -= rowH
  }
  ensure(ctx, rowH * 2)
  drawHeader()
  rows.forEach((r, ri) => {
    ensure(ctx, rowH)
    if (ctx.y === PAGE_H - MARGIN) drawHeader()
    if (ri % 2 === 1) {
      ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - rowH, width: CONTENT_W, height: rowH, color: SURFACE })
    }
    r.forEach((cell, c) => {
      ctx.page.drawText(truncate(c === 0 ? ctx.bold : ctx.font, cell ?? '', 8, colW(c) - 8), {
        x: colX(c) + 4, y: ctx.y - 13, size: 8, font: c === 0 ? ctx.bold : ctx.font, color: c === 0 ? INK : BODY,
      })
    })
    ctx.y -= rowH
  })
  ctx.y -= 8
}

function renderFootballField(
  ctx: Ctx,
  title: string | undefined,
  bands: { method: string; low: number; mid?: number; high: number }[],
  currentPrice?: number,
  weightedMid?: number,
  currency = '$',
) {
  if (title) sectionHeading(ctx, title)
  if (bands.length === 0) return
  const lows = bands.map((b) => b.low)
  const highs = bands.map((b) => b.high)
  let lo = Math.min(...lows, currentPrice ?? Infinity)
  let hi = Math.max(...highs, currentPrice ?? -Infinity)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) { lo = Math.min(...lows); hi = Math.max(...highs) }
  const pad = (hi - lo) * 0.08 || 1
  lo -= pad; hi += pad
  const range = hi - lo || 1
  const labelW = 140
  const trackX = MARGIN + labelW
  const trackW = CONTENT_W - labelW
  const xFor = (v: number) => trackX + ((v - lo) / range) * trackW
  const fmt = (v: number) => `${currency}${v >= 1000 ? v.toFixed(0) : v.toFixed(2)}`
  const rowH = 26

  for (const b of bands) {
    ensure(ctx, rowH)
    const cy = ctx.y - rowH / 2
    ctx.page.drawText(truncate(ctx.font, b.method, 8, labelW - 8), { x: MARGIN, y: cy - 3, size: 8, font: ctx.font, color: BODY })
    const x1 = xFor(b.low); const x2 = xFor(b.high)
    ctx.page.drawRectangle({ x: x1, y: cy - 5, width: Math.max(2, x2 - x1), height: 10, color: hex(FINSYT_BRAND.accentDim), borderColor: ACCENT, borderWidth: 0.75 })
    ctx.page.drawText(fmt(b.low), { x: Math.max(trackX, x1 - 2), y: cy + 7, size: 6.5, font: ctx.font, color: MUTED })
    const hiLbl = fmt(b.high)
    ctx.page.drawText(hiLbl, { x: Math.min(PAGE_W - MARGIN - ctx.font.widthOfTextAtSize(hiLbl, 6.5), x2 - 8), y: cy + 7, size: 6.5, font: ctx.font, color: MUTED })
    if (b.mid != null) {
      const mx = xFor(b.mid)
      ctx.page.drawLine({ start: { x: mx, y: cy - 7 }, end: { x: mx, y: cy + 7 }, thickness: 1.2, color: NAVY })
    }
    ctx.y -= rowH
  }
  // current price marker
  if (currentPrice != null) {
    const cx = xFor(currentPrice)
    ctx.page.drawLine({ start: { x: cx, y: ctx.y }, end: { x: cx, y: ctx.y + bands.length * rowH }, thickness: 1, color: POSITIVE, dashArray: [3, 2] })
  }
  ctx.y -= 6
  const legendBits: string[] = []
  if (currentPrice != null) legendBits.push(`Current price ${fmt(currentPrice)}`)
  if (weightedMid != null) legendBits.push(`Weighted ${fmt(weightedMid)}`)
  if (legendBits.length) {
    drawParagraph(ctx, legendBits.join('   ·   '), 7.5, ctx.font, MUTED)
  }
  ctx.y -= 4
}

function renderSources(ctx: Ctx, title: string | undefined, sources: { name: string; category: string; detail?: string }[]) {
  sectionHeading(ctx, title ?? 'Data sources used')
  if (sources.length === 0) {
    drawParagraph(ctx, 'No external providers were touched assembling this report.', 9, ctx.font, MUTED)
    return
  }
  for (const s of sources) {
    const lh = 9 * 1.5
    ensure(ctx, lh)
    ctx.page.drawText('•', { x: MARGIN, y: ctx.y - 9, size: 9, font: ctx.bold, color: ACCENT })
    const label = s.detail ? `${s.name} — ${s.detail}` : s.name
    ctx.page.drawText(truncate(ctx.font, `${label}  (${s.category})`, 9, CONTENT_W - 16), {
      x: MARGIN + 14, y: ctx.y - 9, size: 9, font: ctx.font, color: BODY,
    })
    ctx.y -= lh
  }
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function renderReportPdf(tpl: DeckTemplate): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const asOf = tpl.context.asOf || ''
  const ctx: Ctx = {
    doc, font, bold,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN,
    asOf,
    footer: tpl.context.footerLine || 'Sources: Finsyt platform data.',
  }
  drawFooter(ctx)

  // ── Cover band ──
  const cover = tpl.context.cover
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 150, width: PAGE_W, height: 150, color: NAVY })
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - 154, width: PAGE_W, height: 4, color: ACCENT })
  if (cover.eyebrow) {
    ctx.page.drawText(cover.eyebrow.toUpperCase(), { x: MARGIN, y: PAGE_H - 56, size: 9, font: bold, color: hex(FINSYT_BRAND.accent) })
  }
  for (const [i, line] of wrap(bold, cover.title, 22, CONTENT_W).slice(0, 2).entries()) {
    ctx.page.drawText(line, { x: MARGIN, y: PAGE_H - 84 - i * 26, size: 22, font: bold, color: WHITE })
  }
  if (cover.subtitle) {
    ctx.page.drawText(truncate(font, cover.subtitle, 11, CONTENT_W), { x: MARGIN, y: PAGE_H - 134, size: 11, font, color: hex(FINSYT_BRAND.divider) })
  }
  ctx.y = PAGE_H - 150 - 24

  // ── Sections ──
  for (const section of tpl.sections) {
    renderSection(ctx, section)
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}

function renderSection(ctx: Ctx, s: DeckSection) {
  switch (s.type) {
    case 'title':
      sectionHeading(ctx, s.data.title)
      if (s.data.subtitle) drawParagraph(ctx, s.data.subtitle, 10, ctx.font)
      break
    case 'executive-summary':
      renderBullets(ctx, s.data.title, s.data.bullets)
      break
    case 'kpi-table':
      renderKpiTiles(ctx, s.data.title, s.data.metrics)
      break
    case 'chart':
      renderBarChart(ctx, s.data.title, s.data.series, s.data.xLabels)
      break
    case 'transcript-excerpt':
      sectionHeading(ctx, s.data.title ?? 'Transcript')
      if (s.data.speaker) drawParagraph(ctx, s.data.speaker, 9, ctx.bold, INK)
      drawParagraph(ctx, `“${s.data.quote}”`, 10, ctx.font)
      if (s.data.attribution) drawParagraph(ctx, s.data.attribution, 8, ctx.font, MUTED)
      break
    case 'citation-list':
      sectionHeading(ctx, s.data.title ?? 'Citations')
      for (const c of s.data.citations) {
        drawParagraph(ctx, c.source ? `${c.label} — ${c.source}` : c.label, 9, ctx.font, BODY, 14)
      }
      break
    case 'peers-table':
      renderTable(
        ctx,
        s.data.title ?? 'Peers',
        ['Ticker', 'Name', 'Mkt cap', 'Rev gr.', 'EBITDA mgn', 'EV/Rev', 'EV/EBITDA', 'P/E'],
        s.data.rows.map((r) => [r.ticker, r.name, r.marketCap, r.revenueGrowth, r.ebitdaMargin, r.evRevenue, r.evEbitda, r.pe]),
      )
      break
    case 'transactions-table':
      renderTable(
        ctx,
        s.data.title ?? 'Transactions',
        ['Date', 'Acquirer', 'Target', 'EV', 'EV/Rev', 'EV/EBITDA'],
        s.data.rows.map((r) => [r.date, r.acquirer, r.target, r.evMm, r.evRevenue, r.evEbitda]),
      )
      break
    case 'valuation-football-field':
      renderFootballField(ctx, s.data.title, s.data.bands, s.data.currentPrice, s.data.weightedMid, s.data.currency)
      break
    case 'peer-comparison':
      renderTable(
        ctx,
        s.data.title,
        ['Company', ...s.data.columns.map((c) => c.label)],
        s.data.rows.map((r) => [r.name || r.symbol, ...s.data.columns.map((c) => r.cells[c.key]?.display ?? '—')]),
      )
      break
    case 'sources-used':
      renderSources(ctx, s.data.title, s.data.sources)
      break
    default:
      break
  }
}
