import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { eq, and } from 'drizzle-orm'
import {
  withOrgContext,
  projectsTable,
  projectMembersTable,
  projectActivityTable,
  projectLinksTable,
  linkResourceSchema,
  unlinkResourceSchema,
  ensureProjectsSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

async function assertProjectMember(
  tx: Parameters<Parameters<typeof withOrgContext>[1]>[0],
  localOrgId: string,
  projectId: string,
  userId: string,
  orgRole: string | null,
): Promise<boolean> {
  if (orgRole === 'admin' || orgRole === 'owner') return true
  const rows = await tx.select({ id: projectMembersTable.id })
    .from(projectMembersTable)
    .where(and(
      eq(projectMembersTable.projectId, projectId),
      eq(projectMembersTable.userId, userId),
      eq(projectMembersTable.orgId, localOrgId),
    ))
    .limit(1)
  return rows.length > 0
}

// POST /api/projects/[id]/link — link a workspace/note/peer_set to this project
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = linkResourceSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const result = await withOrgContext(localOrgId, async (tx) => {
    // Confirm project exists in org
    const [project] = await tx.select({ id: projectsTable.id, name: projectsTable.name })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))
      .limit(1)
    if (!project) return null

    const isMember = await assertProjectMember(tx, localOrgId, id, userId, resolvedRole)
    if (!isMember) return null

    const [link] = await tx.insert(projectLinksTable)
      .values({
        projectId: id,
        orgId: localOrgId,
        resourceType: parsed.data.resourceType,
        resourceId: parsed.data.resourceId,
        resourceLabel: parsed.data.resourceLabel ?? '',
        linkedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [projectLinksTable.projectId, projectLinksTable.resourceType, projectLinksTable.resourceId],
        set: { resourceLabel: parsed.data.resourceLabel ?? '' },
      })
      .returning()

    await tx.insert(projectActivityTable)
      .values({
        projectId: id,
        orgId: localOrgId,
        actorUserId: userId,
        action: `added_${parsed.data.resourceType}`,
        resourceType: parsed.data.resourceType,
        resourceId: parsed.data.resourceId,
        resourceLabel: parsed.data.resourceLabel ?? '',
        payload: { resourceType: parsed.data.resourceType },
      })

    // Bump project updatedAt
    await tx.update(projectsTable)
      .set({ updatedAt: new Date() })
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))

    return link
  })

  if (!result) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  return NextResponse.json({
    link: {
      id: result.id,
      resourceType: result.resourceType,
      resourceId: result.resourceId,
      resourceLabel: result.resourceLabel,
      linkedByUserId: result.linkedByUserId,
      createdAt: result.createdAt.toISOString(),
    },
  }, { status: 201 })
}

// DELETE /api/projects/[id]/link — unlink a resource
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = unlinkResourceSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const removed = await withOrgContext(localOrgId, async (tx) => {
    const isMember = await assertProjectMember(tx, localOrgId, id, userId, resolvedRole)
    if (!isMember) return false

    const rows = await tx.delete(projectLinksTable)
      .where(and(
        eq(projectLinksTable.projectId, id),
        eq(projectLinksTable.resourceType, parsed.data.resourceType),
        eq(projectLinksTable.resourceId, parsed.data.resourceId),
        eq(projectLinksTable.orgId, localOrgId),
      ))
      .returning({ id: projectLinksTable.id })

    if (rows.length > 0) {
      await tx.insert(projectActivityTable)
        .values({
          projectId: id,
          orgId: localOrgId,
          actorUserId: userId,
          action: `removed_${parsed.data.resourceType}`,
          resourceType: parsed.data.resourceType,
          resourceId: parsed.data.resourceId,
        })
    }

    return rows.length > 0
  })

  if (!removed) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}
