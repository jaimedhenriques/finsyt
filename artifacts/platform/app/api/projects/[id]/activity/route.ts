import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { eq, and, desc } from 'drizzle-orm'
import {
  withOrgContext,
  projectsTable,
  projectMembersTable,
  projectActivityTable,
  ensureProjectsSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

// GET /api/projects/[id]/activity — shared activity feed
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const limitParam = parseInt(req.nextUrl.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
  const limit = Math.min(isNaN(limitParam) ? DEFAULT_LIMIT : Math.max(1, limitParam), MAX_LIMIT)

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const events = await withOrgContext(localOrgId, async (tx) => {
    // Confirm project exists
    const [project] = await tx.select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))
      .limit(1)
    if (!project) return null

    // Caller must be a member or org admin/owner
    const isMember = resolvedRole === 'admin' || resolvedRole === 'owner'
      ? true
      : (await tx.select({ id: projectMembersTable.id })
          .from(projectMembersTable)
          .where(and(
            eq(projectMembersTable.projectId, id),
            eq(projectMembersTable.userId, userId),
            eq(projectMembersTable.orgId, localOrgId),
          ))
          .limit(1)
        ).length > 0

    if (!isMember) return null

    return tx.select()
      .from(projectActivityTable)
      .where(and(
        eq(projectActivityTable.projectId, id),
        eq(projectActivityTable.orgId, localOrgId),
      ))
      .orderBy(desc(projectActivityTable.createdAt))
      .limit(limit)
  })

  if (events === null) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  return NextResponse.json({
    events: events.map(e => ({
      id: e.id,
      actorUserId: e.actorUserId,
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      resourceLabel: e.resourceLabel,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    })),
  })
}
