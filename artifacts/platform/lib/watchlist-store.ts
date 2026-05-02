import 'server-only'
import { eq } from 'drizzle-orm'
import { watchlistsTable, withComplianceContext } from '@workspace/db'

// Per-org watchlist storage, persisted in the `watchlists` table. The
// previous version kept this map in process memory which meant a Next.js
// dev restart, deploy, or crash silently dropped every workspace's set of
// monitored tickers — and the Live Highlights engine then re-monitored the
// hard-coded defaults on the next tick. Persisting it here means the engine
// reads the same set the user picked, across restarts.
//
// We intentionally seed every brand-new org with a small default list so
// the platform demo has something to show on first login. The seed is
// written through the same upsert path so it survives restarts too.

const DEFAULT_WATCHLIST: readonly string[] = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'META']

function normalize(symbols: unknown): string[] {
  if (!Array.isArray(symbols)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of symbols) {
    const v = String(s).toUpperCase().trim()
    if (!v || seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

async function readRow(orgId: string): Promise<string[] | null> {
  try {
    const [row] = await withComplianceContext(orgId, (tx) =>
      tx
        .select({ symbols: watchlistsTable.symbols })
        .from(watchlistsTable)
        .where(eq(watchlistsTable.orgId, orgId))
        .limit(1),
    )
    return row ? normalize(row.symbols) : null
  } catch {
    return null
  }
}

async function writeRow(orgId: string, symbols: string[]): Promise<void> {
  await withComplianceContext(orgId, (tx) =>
    tx
      .insert(watchlistsTable)
      .values({ orgId, symbols })
      .onConflictDoUpdate({
        target: watchlistsTable.orgId,
        set: { symbols, updatedAt: new Date() },
      }),
  )
}

export async function getWatchlist(orgId: string): Promise<string[]> {
  const existing = await readRow(orgId)
  if (existing) return existing
  // First time we've seen this org — seed and persist defaults.
  const seeded = [...DEFAULT_WATCHLIST]
  try {
    await writeRow(orgId, seeded)
  } catch {
    /* fail-soft: still return defaults so the UI renders */
  }
  return seeded
}

export async function addToWatchlist(orgId: string, symbol: string): Promise<string[]> {
  const s = String(symbol).toUpperCase().trim()
  const current = await getWatchlist(orgId)
  if (!s || current.includes(s)) return current
  const next = [...current, s]
  await writeRow(orgId, next)
  return next
}

export async function removeFromWatchlist(orgId: string, symbol: string): Promise<string[]> {
  const s = String(symbol).toUpperCase().trim()
  const current = await getWatchlist(orgId)
  const next = current.filter((x) => x !== s)
  if (next.length === current.length) return current
  await writeRow(orgId, next)
  return next
}
