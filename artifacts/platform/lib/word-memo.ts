/**
 * Word (.docx) Investment Memo Generator
 * ───────────────────────────────────────
 * Converts the same `InvestmentMemoData` the PPTX builder consumes into a
 * branded, source-cited Word document. Callers that already have assembled
 * memo data can pass it directly; others call the route which assembles it.
 *
 * Layout per section:
 *   Cover  → large title + subtitle + date + presenter
 *   Overview    → description paragraph + metrics table + segments/geo
 *   Valuation   → current multiples table + historical range table + consensus
 *   Peers       → comparable companies table
 *   Transactions → precedent M&A table
 *   DCF         → assumptions + intrinsic value
 *   Qualitative → investment thesis bullets + catalysts
 *   Sources     → numbered list of data sources used
 *
 * Uses `docx` (npm) — pure JS, no LibreOffice / COM dependency.
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  PageBreak,
  ShadingType,
  convertInchesToTwip,
  type ISectionOptions,
} from 'docx'
import { isUnavailable, type InvestmentMemoData } from './investment-memo-pptx'

// ── Brand colours (hex without #) ──────────────────────────────────────────
const NAVY    = '0B1B3D'
const ACCENT  = '4F7CFF'
const INK     = '0E1A33'
const BODY    = '4A5568'
const MUTED   = '6B7280'
const SURFACE = 'F7F9FC'
const PAPER   = 'FFFFFF'

// ── Typography helpers ──────────────────────────────────────────────────────

function run(text: string, opts: Partial<{
  bold: boolean; italic: boolean; size: number; color: string; font: string
}> = {}): TextRun {
  return new TextRun({
    text,
    bold:  opts.bold  ?? false,
    italics: opts.italic ?? false,
    size:  (opts.size  ?? 11) * 2,   // half-points
    color: opts.color ?? INK,
    font:  opts.font  ?? 'Calibri',
  })
}

function heading1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({
      text,
      bold: true,
      size: 28,
      color: NAVY,
      font: 'Calibri',
    })],
  })
}

function heading2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 180, after: 80 },
    children: [new TextRun({
      text,
      bold: true,
      size: 22,
      color: NAVY,
      font: 'Calibri',
    })],
  })
}

function body(text: string, opts: { italic?: boolean; color?: string; spacing?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: opts.spacing ?? 100 },
    children: [run(text, { italic: opts.italic, color: opts.color ?? BODY, size: 11 })],
  })
}

function bullet(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [run(text, { color: BODY, size: 11 })],
  })
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [new PageBreak()] })
}

function sectionDivider(label: string): Paragraph[] {
  return [
    new Paragraph({ spacing: { before: 240, after: 60 } }),
    new Paragraph({
      spacing: { before: 0, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT } },
      children: [new TextRun({
        text: label.toUpperCase(),
        bold: true,
        size: 16,
        color: ACCENT,
        font: 'Calibri',
      })],
    }),
  ]
}

// ── Table helpers ────────────────────────────────────────────────────────────

interface ColDef { label: string; width: number }

function dataTable(cols: ColDef[], rows: string[][]): Table {
  const totalWidth = 9360 // twips (~6.5 inches)
  const colWidths = cols.map(c => Math.round((c.width / 100) * totalWidth))

  const headerCells = cols.map((c, i) =>
    new TableCell({
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: NAVY, fill: NAVY },
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({
          text: c.label,
          bold: true,
          size: 18,
          color: PAPER,
          font: 'Calibri',
        })],
      })],
    })
  )

  const bodyRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map((cell, ci) =>
        new TableCell({
          width: { size: colWidths[ci], type: WidthType.DXA },
          shading: ri % 2 === 0
            ? { type: ShadingType.SOLID, color: SURFACE, fill: SURFACE }
            : { type: ShadingType.SOLID, color: PAPER, fill: PAPER },
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            children: [new TextRun({
              text: cell || '—',
              size: 18,
              color: INK,
              font: 'Calibri',
            })],
          })],
        })
      ),
    })
  )

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    rows: [
      new TableRow({ children: headerCells, tableHeader: true }),
      ...bodyRows,
    ],
  })
}

// ── Section builders ─────────────────────────────────────────────────────────

function buildCoverSection(memo: InvestmentMemoData): Paragraph[] {
  const id = memo.identity
  const asOf = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 1440, after: 240 },
      children: [new TextRun({
        text: 'FINSYT INVESTMENT MEMO',
        bold: true,
        size: 20,
        color: ACCENT,
        font: 'Calibri',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [new TextRun({
        text: `${id.ticker} · ${id.name}`,
        bold: true,
        size: 48,
        color: NAVY,
        font: 'Calibri',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [new TextRun({
        text: [id.exchange, id.sector].filter(Boolean).join(' · '),
        size: 24,
        color: BODY,
        font: 'Calibri',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 480 },
      children: [new TextRun({
        text: `As of ${asOf}`,
        size: 20,
        color: MUTED,
        italics: true,
        font: 'Calibri',
      })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: ACCENT } },
      children: [new TextRun({
        text: 'Finsyt Research  ·  finsyt.com',
        size: 18,
        color: MUTED,
        font: 'Calibri',
      })],
    }),
    pageBreak(),
  ]
}

function buildOverviewSection(memo: InvestmentMemoData): (Paragraph | Table)[] {
  if (isUnavailable(memo.overview)) {
    return [
      ...sectionDivider('Company Overview'),
      body(`Overview unavailable: ${(memo.overview as any).reason}`),
    ]
  }
  const ov = memo.overview
  const items: (Paragraph | Table)[] = [
    ...sectionDivider('Company Overview'),
    body(ov.description),
  ]

  if (ov.metrics.length > 0) {
    items.push(
      new Paragraph({ spacing: { before: 120, after: 80 }, children: [run('Key Metrics', { bold: true, color: NAVY, size: 12 })] }),
      dataTable(
        [{ label: 'Metric', width: 55 }, { label: 'Value', width: 45 }],
        ov.metrics.map(m => [m.label, m.value])
      ),
    )
  }

  if (ov.segments.length > 0) {
    items.push(
      new Paragraph({ spacing: { before: 140, after: 60 }, children: [run('Business Segments', { bold: true, color: NAVY, size: 12 })] }),
      ...ov.segments.map(s => bullet(s)),
    )
  }

  if (ov.geography.length > 0) {
    items.push(
      new Paragraph({ spacing: { before: 140, after: 60 }, children: [run('Geographic Mix', { bold: true, color: NAVY, size: 12 })] }),
      ...ov.geography.map(g => bullet(g)),
    )
  }

  return items
}

function buildValuationSection(memo: InvestmentMemoData): (Paragraph | Table)[] {
  if (isUnavailable(memo.valuation)) {
    return [
      ...sectionDivider('Valuation'),
      body(`Valuation unavailable: ${(memo.valuation as any).reason}`),
    ]
  }
  const val = memo.valuation
  const items: (Paragraph | Table)[] = [...sectionDivider('Valuation')]

  if (val.current.length > 0) {
    items.push(
      new Paragraph({ spacing: { before: 100, after: 80 }, children: [run('Current Trading Multiples', { bold: true, color: NAVY, size: 12 })] }),
      dataTable(
        [{ label: 'Multiple', width: 55 }, { label: 'Value', width: 45 }],
        val.current.map(m => [m.label, m.value])
      ),
    )
  }

  if (val.historical.length > 0) {
    items.push(
      new Paragraph({ spacing: { before: 140, after: 80 }, children: [run('Historical Range', { bold: true, color: NAVY, size: 12 })] }),
      dataTable(
        [{ label: 'Multiple', width: 40 }, { label: 'Low', width: 20 }, { label: 'Median', width: 20 }, { label: 'High', width: 20 }],
        val.historical.map(h => [h.label, h.low, h.median, h.high])
      ),
    )
  }

  if (val.forwardConsensus) {
    items.push(
      new Paragraph({ spacing: { before: 140, after: 80 }, children: [run('Street Consensus', { bold: true, color: NAVY, size: 12 })] }),
      dataTable(
        [{ label: 'Metric', width: 55 }, { label: 'Value', width: 45 }],
        val.forwardConsensus.items.map(i => [i.label, i.value])
      ),
      ...(val.forwardConsensus.note ? [body(val.forwardConsensus.note, { italic: true, color: MUTED })] : []),
    )
  }

  return items
}

function buildPeersSection(memo: InvestmentMemoData): (Paragraph | Table)[] {
  if (isUnavailable(memo.peers)) {
    return [
      ...sectionDivider('Peer Comparables'),
      body(`Peers unavailable: ${(memo.peers as any).reason}`),
    ]
  }
  const peers = memo.peers as any[]
  return [
    ...sectionDivider('Peer Comparables'),
    dataTable(
      [
        { label: 'Ticker',       width: 10 },
        { label: 'Company',      width: 25 },
        { label: 'Mkt Cap',      width: 13 },
        { label: 'Rev Growth',   width: 13 },
        { label: 'EBITDA Mgn',   width: 13 },
        { label: 'EV/Rev',       width: 13 },
        { label: 'EV/EBITDA',    width: 13 },
      ],
      peers.map((p: any) => [
        p.ticker, p.name, p.marketCap, p.revenueGrowth,
        p.ebitdaMargin, p.evRevenue, p.evEbitda,
      ])
    ),
  ]
}

function buildTransactionsSection(memo: InvestmentMemoData): (Paragraph | Table)[] {
  if (isUnavailable(memo.transactions)) {
    return [
      ...sectionDivider('Precedent M&A Transactions'),
      body(`Transactions unavailable: ${(memo.transactions as any).reason}`),
    ]
  }
  const txns = memo.transactions as any[]
  return [
    ...sectionDivider('Precedent M&A Transactions'),
    dataTable(
      [
        { label: 'Date',      width: 12 },
        { label: 'Acquirer',  width: 22 },
        { label: 'Target',    width: 22 },
        { label: 'EV',        width: 14 },
        { label: 'EV/Rev',    width: 15 },
        { label: 'EV/EBITDA', width: 15 },
      ],
      txns.map((t: any) => [
        t.date, t.acquirer, t.target, t.evMm, t.evRevenue, t.evEbitda,
      ])
    ),
  ]
}

function buildDcfSection(memo: InvestmentMemoData): (Paragraph | Table)[] {
  if (isUnavailable(memo.dcf)) {
    return [
      ...sectionDivider('DCF Valuation'),
      body(`DCF unavailable: ${(memo.dcf as any).reason}`),
    ]
  }
  const dcf = memo.dcf as any
  const rows: [string, string][] = [
    ['WACC',               dcf.assumptions?.discountRate != null ? `${(dcf.assumptions.discountRate * 100).toFixed(1)}%` : '—'],
    ['Terminal Growth',    dcf.assumptions?.terminalGrowthRate != null ? `${(dcf.assumptions.terminalGrowthRate * 100).toFixed(1)}%` : '—'],
    ['Stage 1 Growth',     dcf.assumptions?.growthStage1 != null ? `${(dcf.assumptions.growthStage1 * 100).toFixed(1)}%` : '—'],
    ['Stage 2 Growth',     dcf.assumptions?.growthStage2 != null ? `${(dcf.assumptions.growthStage2 * 100).toFixed(1)}%` : '—'],
    ['Intrinsic Value / Share', dcf.intrinsicValuePerShare != null ? `$${Number(dcf.intrinsicValuePerShare).toFixed(2)}` : '—'],
    ['Implied Upside',     dcf.impliedUpside != null ? `${(Number(dcf.impliedUpside) * 100).toFixed(1)}%` : '—'],
  ]
  return [
    ...sectionDivider('DCF Valuation'),
    dataTable(
      [{ label: 'Assumption / Output', width: 55 }, { label: 'Value', width: 45 }],
      rows,
    ),
  ]
}

function buildQualitativeSection(memo: InvestmentMemoData): (Paragraph | Table)[] {
  if (isUnavailable(memo.qualitative)) {
    return [
      ...sectionDivider('Investment Thesis & Qualitative Factors'),
      body(`Qualitative section unavailable: ${(memo.qualitative as any).reason}`),
    ]
  }
  const q = memo.qualitative as any
  const items: (Paragraph | Table)[] = [...sectionDivider('Investment Thesis & Qualitative Factors')]

  if (q.thesis?.length) {
    items.push(
      new Paragraph({ spacing: { before: 100, after: 60 }, children: [run('Investment Thesis', { bold: true, color: NAVY, size: 12 })] }),
      ...q.thesis.map((t: string) => bullet(t)),
    )
  }
  if (q.strengths?.length) {
    items.push(
      new Paragraph({ spacing: { before: 120, after: 60 }, children: [run('Key Strengths', { bold: true, color: NAVY, size: 12 })] }),
      ...q.strengths.map((s: string) => bullet(s)),
    )
  }
  if (q.risks?.length) {
    items.push(
      new Paragraph({ spacing: { before: 120, after: 60 }, children: [run('Key Risks', { bold: true, color: NAVY, size: 12 })] }),
      ...q.risks.map((r: string) => bullet(r)),
    )
  }
  if (q.catalysts?.length) {
    items.push(
      new Paragraph({ spacing: { before: 120, after: 60 }, children: [run('Catalysts (Next 12 Months)', { bold: true, color: NAVY, size: 12 })] }),
      ...q.catalysts.map((c: string) => bullet(c)),
    )
  }

  return items
}

function buildSourcesSection(): Paragraph[] {
  const sources = [
    'Financial Modeling Prep (FMP) — Quote, income / balance / cash-flow statements, key metrics, peers, M&A',
    'FMP Analyst Estimates — Forward NTM revenue / EPS / price targets',
    'Finsyt DCF Model — 2-stage discounted cash-flow with CAPM-derived WACC',
    'Yahoo Finance — Backup quote feed',
    'U.S. SEC EDGAR — Filings and disclosures',
  ]
  return [
    ...sectionDivider('Data Sources Used'),
    ...sources.map((s, i) => bullet(`[${i + 1}] ${s}`)),
    new Paragraph({ spacing: { before: 180, after: 0 } }),
    body('Generated by Finsyt Research · finsyt.com', { italic: true, color: MUTED }),
  ]
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a branded Word document (.docx) from the given investment memo data.
 * Returns a Buffer ready to be streamed as a download response.
 */
export async function buildWordMemo(memo: InvestmentMemoData): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    ...buildCoverSection(memo),
    ...buildOverviewSection(memo),
    pageBreak(),
    ...buildValuationSection(memo),
    pageBreak(),
    ...buildPeersSection(memo),
    pageBreak(),
    ...buildTransactionsSection(memo),
    pageBreak(),
    ...buildDcfSection(memo),
    pageBreak(),
    ...buildQualitativeSection(memo),
    pageBreak(),
    ...buildSourcesSection(),
  ]

  const sectionOpts: ISectionOptions = {
    children,
    properties: {
      page: {
        margin: {
          top:    convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left:   convertInchesToTwip(1.1),
          right:  convertInchesToTwip(1.1),
        },
      },
    },
  }

  const doc = new Document({
    creator: 'Finsyt Research',
    title: `${memo.identity.ticker} Investment Memo`,
    description: `Investment memo for ${memo.identity.name} generated by Finsyt`,
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: INK },
        },
      },
    },
    sections: [sectionOpts],
  })

  const buf = await Packer.toBuffer(doc)
  return Buffer.from(buf)
}
