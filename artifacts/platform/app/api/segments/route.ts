import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RawMetric = {
  metricId: string
  metricName: string
  metricType: 'Segment' | 'KPI' | string
  metricFormat: 'number' | '%' | string
  isCurrency: boolean
  isImportant: boolean
  isDiscontinued?: Record<string, boolean>
}

type RawGroup = {
  title: string
  metrics: Array<{ metricId: string; metricName: string; isRollup: boolean; rollupMetrics: unknown[] }>
}

type RawPeriod = {
  periodId: string
  periodType: 'Annual' | 'Quarterly' | 'LTM' | 'Semi-Annual'
  reportDate: string
  periodDuration: string
  calendarYear: number
  calendarQuarter: number
  fiscalYear: number
  fiscalQuarter: number
  metricsValues: Record<string, number>
}

type RawResponse = {
  reportingCurrency?: string
  currency?: string
  metrics: RawMetric[]
  segmentGroups: RawGroup[]
  data: RawPeriod[] | Record<string, RawPeriod>
  errors?: Array<{ message: string }>
}

type SlimMetric = {
  id: string
  name: string
  type: 'Segment' | 'KPI' | string
  format: 'number' | '%' | string
  isCurrency: boolean
  isImportant: boolean
  values: Array<{ period: string; reportDate: string; value: number | null; fiscalYear: number; fiscalQuarter: number }>
}

type SlimGroup = { title: string; metrics: SlimMetric[] }

type SlimResponse = {
  ok: true
  source: 'fiscal.ai'
  symbol: string
  reportingCurrency: string
  annual: { periods: string[]; groups: SlimGroup[] }
  quarterly: { periods: string[]; groups: SlimGroup[] }
}

const cache = new Map<string, { at: number; payload: SlimResponse }>()
const TTL_MS = 24 * 60 * 60 * 1000

function periodLabel(p: RawPeriod): string {
  if (p.periodType === 'Annual') return `FY${p.fiscalYear}`
  if (p.periodType === 'Quarterly') return `Q${p.fiscalQuarter} FY${p.fiscalYear}`
  return p.reportDate
}

function isMetricLive(meta: RawMetric, periodType: 'Annual' | 'Quarterly'): boolean {
  const flag = meta.isDiscontinued?.[periodType]
  return !flag
}

function buildSlim(symbol: string, raw: RawResponse, periodType: 'Annual' | 'Quarterly') {
  const periodsRaw = Array.isArray(raw.data) ? raw.data : Object.values(raw.data)
  const periods = periodsRaw
    .filter(p => p.periodType === periodType)
    .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1))
    .slice(0, periodType === 'Annual' ? 8 : 12)
    .reverse()

  const periodLabels = periods.map(periodLabel)
  const metricMeta = new Map(raw.metrics.map(m => [m.metricId, m]))

  const groups: SlimGroup[] = raw.segmentGroups.map(g => {
    const metrics: SlimMetric[] = g.metrics
      .map(gm => {
        const meta = metricMeta.get(gm.metricId)
        if (!meta) return null
        if (!isMetricLive(meta, periodType)) return null
        const values = periods.map(p => {
          const v = p.metricsValues[gm.metricId]
          return {
            period: periodLabel(p),
            reportDate: p.reportDate,
            value: typeof v === 'number' ? v : null,
            fiscalYear: p.fiscalYear,
            fiscalQuarter: p.fiscalQuarter,
          }
        })
        if (values.every(v => v.value === null)) return null
        return {
          id: meta.metricId,
          name: meta.metricName,
          type: meta.metricType,
          format: meta.metricFormat,
          isCurrency: meta.isCurrency,
          isImportant: meta.isImportant,
          values,
        } as SlimMetric
      })
      .filter((m): m is SlimMetric => m !== null)
    return { title: g.title, metrics }
  }).filter(g => g.metrics.length > 0)

  return { periods: periodLabels, groups }
}

async function fetchFiscal(symbol: string, apiKey: string): Promise<RawResponse | { status: number; error: string }> {
  // Fiscal.ai accepts plain ticker for US listings. For non-US we'd map to companyKey.
  const url = new URL('https://api.fiscal.ai/v2/company/segments-and-kpis')
  url.searchParams.set('ticker', symbol)
  const r = await fetch(url.toString(), {
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  if (!r.ok) {
    let msg = `HTTP ${r.status}`
    try {
      const j = await r.json()
      msg = j?.errors?.[0]?.message || msg
    } catch {}
    return { status: r.status, error: msg }
  }
  return (await r.json()) as RawResponse
}

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase()
  if (!symbol) {
    return NextResponse.json({ ok: false, error: 'symbol required' }, { status: 400 })
  }
  const apiKey = process.env.FISCAL_AI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'FISCAL_AI_API_KEY not configured', source: 'fiscal.ai' },
      { status: 503 },
    )
  }

  const cacheKey = `seg:${symbol}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.payload, { headers: { 'x-cache': 'hit' } })
  }

  const raw = await fetchFiscal(symbol, apiKey)
  if ('error' in raw) {
    const code = raw.status === 403 ? 'out_of_coverage' : raw.status === 401 ? 'unauthorized' : 'upstream_error'
    return NextResponse.json(
      { ok: false, error: raw.error, code, source: 'fiscal.ai', symbol },
      { status: raw.status === 403 ? 200 : raw.status },
    )
  }

  const payload: SlimResponse = {
    ok: true,
    source: 'fiscal.ai',
    symbol,
    reportingCurrency: raw.reportingCurrency || raw.currency || 'USD',
    annual: buildSlim(symbol, raw, 'Annual'),
    quarterly: buildSlim(symbol, raw, 'Quarterly'),
  }
  cache.set(cacheKey, { at: Date.now(), payload })
  return NextResponse.json(payload, { headers: { 'x-cache': 'miss' } })
}
