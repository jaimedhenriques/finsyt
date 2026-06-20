import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { factorConfigSchema } from '@workspace/db'
import { runBacktest, BACKTEST_UNIVERSES, type PriceBar, type BacktestConfig } from '@/lib/backtest'
import { dailyBarsWaterfall } from '@/lib/data-providers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function fetchBarsOnce(symbol: string, from: string, to: string): Promise<PriceBar[]> {
  try {
    const res = await dailyBarsWaterfall(symbol, from, to)
    if (!res) return []
    return res.bars
      .filter((b) => Number.isFinite(b.t) && Number.isFinite(b.c) && b.c > 0)
      .map((b) => ({ date: new Date(b.t).toISOString().slice(0, 10), close: Number(b.c) }))
  } catch {
    return []
  }
}

async function fetchBars(symbol: string, from: string, to: string): Promise<PriceBar[]> {
  let bars = await fetchBarsOnce(symbol, from, to)
  if (bars.length < 30) {
    await new Promise((r) => setTimeout(r, 400))
    bars = await fetchBarsOnce(symbol, from, to)
  }
  return bars
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ ok: false, reason: 'unauthorized', message: 'Sign in to run a back-test.' }, { status: 401 })

  let raw: unknown
  try { raw = await req.json() } catch { raw = {} }
  const parsed = factorConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: 'invalid_param', message: 'Invalid back-test configuration.', details: parsed.error.flatten() }, { status: 400 })
  }
  const cfg = parsed.data

  let symbols: string[] = []
  if (cfg.symbols && cfg.symbols.length >= 2) {
    symbols = cfg.symbols
  } else if (cfg.universeKey) {
    const u = BACKTEST_UNIVERSES.find((x) => x.key === cfg.universeKey)
    if (u) symbols = u.symbols
  }
  symbols = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).slice(0, 60)
  if (symbols.length < 2) {
    return NextResponse.json({ ok: false, reason: 'no_universe', message: 'Pick a universe basket or provide at least two tickers.' }, { status: 400 })
  }

  const benchmark = (cfg.benchmark || 'SPY').toUpperCase()
  const today = new Date()
  const start = new Date(today.getTime() - (cfg.years + 1) * 365.25 * 86400000)
  const fromStr = start.toISOString().slice(0, 10)
  const toStr = today.toISOString().slice(0, 10)

  const fetched = await mapWithConcurrency(symbols, 4, async (s) => [s, await fetchBars(s, fromStr, toStr)] as const)
  const benchBars = await fetchBars(benchmark, fromStr, toStr)

  const priceSeriesBySymbol: Record<string, PriceBar[]> = {}
  for (const [s, arr] of fetched) if (arr.length >= 30) priceSeriesBySymbol[s] = arr

  if (Object.keys(priceSeriesBySymbol).length < 2) {
    return NextResponse.json({ ok: false, reason: 'insufficient_data', message: 'Could not load enough price history for this universe. Try a different basket or a shorter range.' }, { status: 200 })
  }
  if (benchBars.length < 30) {
    return NextResponse.json({ ok: false, reason: 'insufficient_data', message: `Benchmark ${benchmark} price history is unavailable for this range.` }, { status: 200 })
  }

  const engineConfig: BacktestConfig = {
    factor: cfg.factor,
    quantiles: cfg.quantiles,
    rebalance: cfg.rebalance,
    riskFreeRate: 0.04,
  }

  const windowStart = new Date(today.getTime() - cfg.years * 365.25 * 86400000).toISOString().slice(0, 10)
  const benchInWindow = benchBars.filter((b) => b.date >= windowStart)

  const result = runBacktest({
    config: engineConfig,
    priceSeriesBySymbol,
    benchmark: benchInWindow,
    benchmarkLabel: benchmark,
  })

  return NextResponse.json(result)
}
