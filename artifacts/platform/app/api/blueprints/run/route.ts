import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, eq, or } from 'drizzle-orm'
import {
  withClerkContext,
  blueprintsTable,
  runBlueprintSchema,
  FINSYT_PUBLISHED_ORG_ID,
} from '@workspace/db'
import { runBlueprint } from '@/lib/blueprint-runner'

export const runtime = 'nodejs'
// Blueprint runs are sequential LLM calls and can take 30-90s end-to-end.
// Bumping `maxDuration` lets the platform serverless layer keep the request
// open instead of disconnecting at the default 10s ceiling.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

// POST /api/blueprints/run — execute a blueprint synchronously and persist a
// `blueprint_runs` row. The response includes the full `stepResults` payload
// so the calling UI can render the brief without polling.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = runBlueprintSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request', details: parsed.error.flatten() }, { status: 400 })
  }

  // Resolve the blueprint, allowing both the workspace's own rows and the
  // curated FINSYT_PUBLISHED_ORG_ID rows. Anything else is a 404.
  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(blueprintsTable)
      .where(
        and(
          eq(blueprintsTable.id, parsed.data.blueprintId),
          or(
            eq(blueprintsTable.orgId, orgId),
            eq(blueprintsTable.orgId, FINSYT_PUBLISHED_ORG_ID),
          ),
        ),
      )
      .limit(1),
  )
  if (!rows.length) return NextResponse.json({ error: 'blueprint not found' }, { status: 404 })

  try {
    const result = await runBlueprint({
      orgId,
      userId,
      blueprint: rows[0],
      parameters: parsed.data.parameters ?? {},
      target: parsed.data.target ?? null,
      triggeredBy: 'manual',
    })
    return NextResponse.json({ run: result })
  } catch (err) {
    const msg = (err as Error).message || 'run_failed'
    // `missing_parameter:<key>` is the only contract violation we surface as a
    // 400; everything else is treated as an internal failure.
    if (msg.startsWith('missing_parameter:')) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: 'run failed', detail: msg }, { status: 500 })
  }
}
