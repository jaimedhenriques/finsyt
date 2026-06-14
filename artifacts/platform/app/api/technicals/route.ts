import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { dailyBarsWaterfall, type DailyBar } from '@/lib/data-providers'
import {
  computeIndicators,
  latestSignals,
  OVERLAY_TYPES,
  OSCILLATOR_TYPES,
  type IndicatorRequest,
  type IndicatorType,
} from '@/lib/technical-indicators'

export const runtime = 'nodejs'

const ALL_TYPES = [...OVERLAY_TYPES, ...OSCILLATOR_TYPES] as [IndicatorType, ...IndicatorType[]]

/** Range token → days of history to request. */
const RANGE_DAYS: Record<string, number> = {
  '1M': 31, '3M': 92, '6M': 184, '1Y': 366, '2Y': 731, '5Y': 1827, 'MAX': 3653,
}

const QuerySchema = z.object({
  symbol: z.string().trim().min(1).max(32),
  range: z.enum(['1M', '3M', '6M', '1Y', '2Y', '5Y', 'MAX']).default('1Y'),
  from: z.string().optional(),
  to: z.string().optional(),
  /** Comma-separated indicator list, e.g. "sma,ema,rsi,macd". */
  indicators: z.string().optional(),
  /**
   * Optional JSON config: an array of { type, params } overriding the simple
   * comma list when callers need custom periods.
   */
  config: z.string().optional(),
  /** When "1" omit the raw bars from the response (agent tool default). */
  noBars: z.string().optional(),
})

/** Parse the `indicators` / `config` query into IndicatorRequest[]. */
function parseRequests(indicators?: string, config?: string): IndicatorRequest[] {
  if (config) {
    try {
      const parsed = JSON.parse(config)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((r): r is IndicatorRequest => r && typeof r.type === 'string' && (ALL_TYPES as string[]).includes(r.type))
          .map(r => ({ type: r.type, params: r.params && typeof r.params === 'object' ? r.params : undefined }))
      }
    } catch { /* fall through to comma list */ }
  }
  if (indicators) {
    return indicators
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => (ALL_TYPES as string[]).includes(s))
      .map(s => ({ type: s as IndicatorType }))
  }
  // Sensible default set.
  return [
    { type: 'sma', params: { period: 50 } },
    { type: 'sma', params: { period: 200 } },
    { type: 'ema', params: { period: 20 } },
    { type: 'rsi' },
    { type: 'macd' },
  ]
}

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid query', issues: parsed.error.issues }, { status: 400 })
  }
  const { symbol: rawSymbol, range, from: fromQ, to: toQ, indicators, config, noBars } = parsed.data
  const symbol = rawSymbol.toUpperCase()

  const to = toQ || new Date().toISOString().slice(0, 10)
  const from = fromQ || new Date(Date.now() - (RANGE_DAYS[range] ?? 366) * 86400000).toISOString().slice(0, 10)

  let result: { bars: DailyBar[]; source: string } | null = null
  try {
    result = await dailyBarsWaterfall(symbol, from, to)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, symbol }, { status: 502 })
  }

  if (!result || !result.bars.length) {
    // Honest empty state — no fabricated series.
    return NextResponse.json(
      { error: 'No price history available for this symbol', symbol, from, to, source: 'none' },
      { status: 404 },
    )
  }

  const bars = result.bars.slice().sort((a, b) => a.t - b.t)
  const requests = parseRequests(indicators, config)
  const computed = computeIndicators(bars, requests)
  const signals = latestSignals(bars)

  return NextResponse.json({
    symbol,
    from,
    to,
    range,
    count: bars.length,
    source: result.source,
    indicators: computed,
    signals,
    bars: noBars === '1' ? undefined : bars,
  })
}
