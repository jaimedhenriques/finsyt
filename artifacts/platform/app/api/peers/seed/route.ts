import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  peerSetsTable,
  peerSetMembersTable,
  auditLog,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Six starter peer baskets the platform offers to every new workspace. The
// names match the institutional sectors Finsyt's research stack covers most
// often; analysts can edit the symbol list after seeding.
const STARTER_SETS: { name: string; description: string; symbols: string[] }[] = [
  { name: 'Mega-Cap Tech',           description: 'Five-stock tech complex used as a market beta benchmark.',                                  symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'] },
  { name: 'AI Semiconductors',       description: 'Compute supply chain for the post-2023 AI build-out.',                                       symbols: ['NVDA', 'AMD', 'AVGO', 'TSM', 'ASML'] },
  { name: 'EV & Auto OEMs',          description: 'Electric and ICE auto OEMs for cross-cycle margin and capex compares.',                     symbols: ['TSLA', 'F', 'GM', 'RIVN', 'TM'] },
  { name: 'US Money-Center Banks',   description: 'Top-five US universal banks for NIM, capital ratios, and reserve builds.',                   symbols: ['JPM', 'BAC', 'WFC', 'C', 'GS'] },
  { name: 'Streaming & Ad-tech',     description: 'Direct-to-consumer streaming and the ad-tech stack monetising it.',                          symbols: ['NFLX', 'DIS', 'WBD', 'PARA', 'ROKU'] },
  { name: 'Energy Supermajors',      description: 'Integrated oil & gas — buybacks, dividend cover, capex discipline.',                          symbols: ['XOM', 'CVX', 'SHEL', 'BP', 'TTE'] },
]

// POST /api/peers/seed — idempotent seed of the six starter peer sets in the
// active workspace. Skips any starter whose name already exists. Safe to call
// repeatedly from the empty-state CTA on /app/peers.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active workspace' }, { status: 409 })

  const created: { id: string; name: string; symbols: string[] }[] = []

  for (const seed of STARTER_SETS) {
    const inserted = await withClerkContext(orgId, userId, async (tx) => {
      const existing = await tx
        .select({ id: peerSetsTable.id })
        .from(peerSetsTable)
        .where(and(eq(peerSetsTable.orgId, orgId), eq(peerSetsTable.name, seed.name)))
        .limit(1)
      if (existing.length > 0) return null
      const [row] = await tx
        .insert(peerSetsTable)
        .values({
          orgId,
          authorUserId: userId,
          name: seed.name,
          description: seed.description,
        })
        .returning()
      const memberValues = seed.symbols.map((symbol, i) => ({ setId: row.id, orgId, symbol, position: i }))
      await tx.insert(peerSetMembersTable).values(memberValues)
      return row
    }).catch(() => null)
    if (inserted) {
      created.push({ id: inserted.id, name: inserted.name, symbols: seed.symbols })
    }
  }

  if (created.length > 0) {
    await auditLog({
      orgId,
      actorId: userId,
      actorType: 'user',
      action: 'peers.seed',
      resourceType: 'peer_set',
      resourceId: orgId,
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
      metadata: { count: created.length, names: created.map((c) => c.name) },
    }).catch(() => {})
  }

  return NextResponse.json({ created })
}
