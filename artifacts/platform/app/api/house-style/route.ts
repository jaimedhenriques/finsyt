/**
 * GET  /api/house-style — read the org's house-style config (or platform default).
 * PATCH /api/house-style — upsert the org's house-style config.
 *
 * Clerk-org scoped via `getHouseStyle` / `updateHouseStyle` (RLS-isolated on
 * `house_style`). Config is fully normalised server-side, so a partial or
 * hostile payload can never persist an invalid document.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import {
  getHouseStyle,
  updateHouseStyle,
  houseStyleAuditSummary,
} from '@/lib/house-style'
import { audit } from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const houseStyle = await getHouseStyle(orgId, userId)
  return NextResponse.json({ houseStyle })
}

interface PatchBody {
  enabled?: unknown
  config?: unknown
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: PatchBody = {}
  try { raw = (await req.json()) as PatchBody } catch { /* empty body */ }

  const next = await updateHouseStyle(orgId, userId, {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    config: raw.config !== undefined ? raw.config : undefined,
  })

  try {
    await audit.log({
      orgId,
      actorId: userId,
      actorType: 'user',
      action: 'house_style.updated',
      resourceType: 'house_style',
      resourceId: orgId,
      metadata: { after: houseStyleAuditSummary(next) },
    })
  } catch {
    /* swallow — audit failure must not block the save */
  }

  return NextResponse.json({ houseStyle: next })
}
