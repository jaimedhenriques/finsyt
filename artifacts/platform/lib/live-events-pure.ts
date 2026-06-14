// Pure deterministic helpers used by both the live-events source and the
// live-highlights engine. Kept free of `server-only` and any DB / Next.js
// imports so they can be unit tested directly with `tsx --test`.

export interface LiveCompany {
  symbol: string
  name: string
  sector: string
}

export interface LiveCall {
  symbol: string
  name: string
  sector: string
  event: string
  startedAt: string  // ISO
  listeners: number
}

export const COMPANIES: LiveCompany[] = [
  { symbol: 'AAPL', name: 'Apple Inc.',       sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corp.',  sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.',     sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms',   sector: 'Communication' },
  { symbol: 'TSLA', name: 'Tesla Inc.',       sector: 'Automotive' },
  { symbol: 'GOOGL',name: 'Alphabet Inc.',    sector: 'Communication' },
  { symbol: 'RACE', name: 'Ferrari NV',       sector: 'Automotive' },
  { symbol: 'ASML', name: 'ASML Holding',     sector: 'Technology' },
  { symbol: 'JPM',  name: 'JPMorgan Chase',   sector: 'Financials' },
  { symbol: 'XOM',  name: 'Exxon Mobil',      sector: 'Energy' },
]

export const BUCKET_MIN = 5
export const CALL_LENGTH_MIN = 60

export function liveSelection(now: Date = new Date()): LiveCall[] {
  // Anchor the bucket to a deterministic 5-minute wall-clock boundary so that,
  // for the same physical call, every poll within its lifetime produces the
  // same `startedAt` (and therefore the same `callKey`). Without this,
  // `startedAt = now - phase*N` drifts every tick and the engine treats each
  // tick as a brand new call — duplicating runs, pins, and notifications.
  const bucketStartMs =
    Math.floor(now.getTime() / (BUCKET_MIN * 60_000)) * (BUCKET_MIN * 60_000)
  const seed = Math.floor(bucketStartMs / (BUCKET_MIN * 60_000)) % (24 * 60 / BUCKET_MIN)
  const live: LiveCall[] = []
  COMPANIES.forEach((c, i) => {
    const phase = (seed + i * 7) % 23
    if (phase < 4) {
      // Phase counts how many full buckets the call has been live for, so the
      // true start time is `phase` buckets before the current bucket start.
      const startedAtMs = bucketStartMs - phase * BUCKET_MIN * 60_000
      const startedSeed = Math.floor(startedAtMs / (BUCKET_MIN * 60_000)) % (24 * 60 / BUCKET_MIN)
      live.push({
        ...c,
        event: `Q${1 + (startedSeed % 4)} 2026 Earnings Call`,
        startedAt: new Date(startedAtMs).toISOString(),
        listeners: 200 + (phase * 437 % 4800),
      })
    }
  })
  return live
}

export function callKey(call: LiveCall): string {
  // Stable across the entire call lifetime — `startedAt` is anchored to a
  // 5-minute wall-clock boundary in `liveSelection`, and we bucket here on
  // the same boundary so two calls back-to-back on the same ticker remain
  // distinguishable while a single call retains one identity for every poll.
  const startBucket = Math.floor(
    new Date(call.startedAt).getTime() / (BUCKET_MIN * 60_000),
  )
  return `${call.symbol}:${startBucket}:${call.event}`
}
