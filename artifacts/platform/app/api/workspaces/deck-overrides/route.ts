/**
 * GET / PUT / DELETE /api/workspaces/deck-overrides
 * ─────────────────────────────────────────────────
 * Per-workspace pinned overrides for the banker-pitch deck export.
 *
 * The company page's "Export to pitch deck" overrides panel reads this on
 * mount so the deal team's saved peer set / DCF assumptions pre-fill every
 * time, and writes back when an analyst clicks "Save". DELETE clears the
 * row ("Reset to defaults"), so the next export falls back to the platform
 * defaults inside `assembleBankerPitch`.
 *
 * One row per Clerk org (table is keyed by `org_id`). RLS in `rls-sql.ts`
 * restricts SELECT to the caller's org and INSERT/UPDATE/DELETE to the
 * caller's org + user — defence-in-depth on top of the explicit `eq(orgId)`
 * predicates here.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { eq, sql } from 'drizzle-orm'
import {
  withClerkContext,
  deckOverridesTable,
  deckOverridesPutSchema,
  type DeckOverridesRow,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DeckOverridesDto {
  peerSetId:      string | null
  wacc:           number | null
  terminalGrowth: number | null
  growthStage1:   number | null
  growthStage2:   number | null
  updatedByUserId: string
  updatedAt:      string
}

function toDto(r: DeckOverridesRow): DeckOverridesDto {
  return {
    peerSetId:       r.peerSetId ?? null,
    wacc:            r.wacc ?? null,
    terminalGrowth:  r.terminalGrowth ?? null,
    growthStage1:    r.growthStage1 ?? null,
    growthStage2:    r.growthStage2 ?? null,
    updatedByUserId: r.updatedByUserId,
    updatedAt:       r.updatedAt.toISOString(),
  }
}

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ overrides: null })

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(deckOverridesTable)
      .where(eq(deckOverridesTable.orgId, orgId))
      .limit(1),
  )
  return NextResponse.json({ overrides: rows[0] ? toDto(rows[0]) : null })
}

export async function PUT(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) {
    return NextResponse.json(
      { error: 'Join or create a workspace to save deck overrides' },
      { status: 409 },
    )
  }

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = deckOverridesPutSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  // Normalise undefined → null so PUT semantics are "replace the entire
  // saved configuration": every field the client omits is cleared. The UI
  // sends explicit `null` for any input the analyst left blank.
  const peerSetId      = parsed.data.peerSetId      ?? null
  const wacc           = parsed.data.wacc           ?? null
  const terminalGrowth = parsed.data.terminalGrowth ?? null
  const growthStage1   = parsed.data.growthStage1   ?? null
  const growthStage2   = parsed.data.growthStage2   ?? null

  const inserted = await withClerkContext(orgId, userId, (tx) =>
    tx.insert(deckOverridesTable)
      .values({
        orgId,
        peerSetId,
        wacc,
        terminalGrowth,
        growthStage1,
        growthStage2,
        updatedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: deckOverridesTable.orgId,
        set: {
          peerSetId,
          wacc,
          terminalGrowth,
          growthStage1,
          growthStage2,
          updatedByUserId: userId,
          updatedAt: sql`now()`,
        },
      })
      .returning(),
  )
  return NextResponse.json({ overrides: toDto(inserted[0]) })
}

export async function DELETE() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ ok: true })

  await withClerkContext(orgId, userId, (tx) =>
    tx.delete(deckOverridesTable).where(eq(deckOverridesTable.orgId, orgId)),
  )
  return NextResponse.json({ ok: true, overrides: null })
}
