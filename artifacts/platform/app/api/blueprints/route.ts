import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { and, desc, eq, or } from 'drizzle-orm'
import {
  withClerkContext,
  audit,
  blueprintsTable,
  insertBlueprintSchema,
  FINSYT_PUBLISHED_ORG_ID,
  type BlueprintRow,
} from '@workspace/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/blueprints — list blueprints visible to the active workspace.
// Visibility model:
//   • org_id == active org   → private/team/firm rows live in this workspace
//   • org_id == FINSYT_PUBLISHED_ORG_ID → curated, read-only library
// RLS enforces the same constraints; the explicit filter is defense-in-depth.
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ blueprints: [], synced: false, reason: 'no_workspace' })

  const onlyMine = req.nextUrl.searchParams.get('mine') === '1'
  const category = req.nextUrl.searchParams.get('category') || undefined

  const rows = await withClerkContext(orgId, userId, (tx) =>
    tx.select()
      .from(blueprintsTable)
      .where(
        and(
          onlyMine
            ? eq(blueprintsTable.orgId, orgId)
            : or(
                eq(blueprintsTable.orgId, orgId),
                eq(blueprintsTable.orgId, FINSYT_PUBLISHED_ORG_ID),
              ),
          category ? eq(blueprintsTable.category, category) : undefined,
        ),
      )
      .orderBy(desc(blueprintsTable.updatedAt))
      .limit(500),
  )

  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    currentOrgId: orgId,
    blueprints: rows.map(serialiseBlueprint),
  })
}

// POST /api/blueprints — create a workspace-scoped blueprint.
// Curated/published blueprints are seeded out-of-band; user-created rows are
// always pinned to the active Clerk org.
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const parsed = insertBlueprintSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid blueprint', details: parsed.error.flatten() }, { status: 400 })
  }

  // Workspace blueprints can never be `published` — that tier is reserved for
  // the curated `FINSYT_PUBLISHED_ORG_ID` rows.
  const visibility = parsed.data.visibility === 'published' ? 'firm' : (parsed.data.visibility ?? 'private')
  const slug = parsed.data.slug || slugify(parsed.data.name)

  const [created] = await withClerkContext(orgId, userId, (tx) =>
    tx.insert(blueprintsTable)
      .values({
        orgId,
        authorUserId: userId,
        slug,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        category: parsed.data.category,
        icon: parsed.data.icon ?? '◎',
        visibility,
        version: 1,
        parameters: (parsed.data.parameters ?? []) as unknown as object,
        steps: parsed.data.steps as unknown as object,
        expectedOutputs: (parsed.data.expectedOutputs ?? []) as unknown as object,
        requiredTools: (parsed.data.requiredTools ?? []) as unknown as object,
        requiredConnectors: (parsed.data.requiredConnectors ?? []) as unknown as object,
      })
      .returning(),
  )

  audit.log({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'blueprint.created',
    resourceType: 'blueprint',
    resourceId: created.id,
    metadata: { name: created.name, category: created.category, visibility: created.visibility },
  }).catch(() => {})

  return NextResponse.json({ blueprint: serialiseBlueprint(created) }, { status: 201 })
}

export function serialiseBlueprint(r: BlueprintRow) {
  return {
    id: r.id,
    orgId: r.orgId,
    authorUserId: r.authorUserId,
    slug: r.slug,
    name: r.name,
    description: r.description,
    category: r.category,
    icon: r.icon,
    visibility: r.visibility,
    version: r.version,
    parameters: r.parameters,
    steps: r.steps,
    expectedOutputs: r.expectedOutputs,
    requiredTools: r.requiredTools,
    requiredConnectors: r.requiredConnectors,
    publishedSlug: r.publishedSlug,
    isPublished: r.orgId === FINSYT_PUBLISHED_ORG_ID,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || `bp-${Date.now().toString(36)}`
}

