import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { eq, and } from 'drizzle-orm'
import {
  withOrgContext,
  projectsTable,
  projectMembersTable,
  projectActivityTable,
  projectLinksTable,
  patchProjectSchema,
  ensureProjectsSchema,
  auditLog,
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
  // Org admins/owners can always access any project in their org
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

// GET /api/projects/[id] — project detail with members and links
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)

  const result = await withOrgContext(localOrgId, async (tx) => {
    const isMember = await assertProjectMember(tx, localOrgId, id, userId, orgRole?.replace(/^org:/, '') ?? null)
    if (!isMember) return null

    const [project] = await tx.select()
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))
      .limit(1)
    if (!project) return null

    const members = await tx.select()
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.projectId, id),
        eq(projectMembersTable.orgId, localOrgId),
      ))

    const links = await tx.select()
      .from(projectLinksTable)
      .where(and(
        eq(projectLinksTable.projectId, id),
        eq(projectLinksTable.orgId, localOrgId),
      ))

    return { project, members, links }
  })

  if (!result) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  const { project, members, links } = result
  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      color: project.color,
      status: project.status,
      metadata: project.metadata ?? {},
      authorUserId: project.authorUserId,
      mine: project.authorUserId === userId,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    },
    members: members.map(m => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      addedByUserId: m.addedByUserId,
      createdAt: m.createdAt.toISOString(),
    })),
    links: links.map(l => ({
      id: l.id,
      resourceType: l.resourceType,
      resourceId: l.resourceId,
      resourceLabel: l.resourceLabel,
      linkedByUserId: l.linkedByUserId,
      createdAt: l.createdAt.toISOString(),
    })),
  })
}

// PATCH /api/projects/[id] — update project fields
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchProjectSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const updated = await withOrgContext(localOrgId, async (tx) => {
    const isMember = await assertProjectMember(tx, localOrgId, id, userId, resolvedRole)
    if (!isMember) return null

    // Only owner / admin (org or project) can patch core fields
    const memberRow = await tx.select({ role: projectMembersTable.role })
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.projectId, id),
        eq(projectMembersTable.userId, userId),
        eq(projectMembersTable.orgId, localOrgId),
      ))
      .limit(1)
    const projectRole = memberRow[0]?.role ?? 'viewer'
    const canWrite =
      resolvedRole === 'admin' || resolvedRole === 'owner' ||
      projectRole === 'admin' || projectRole === 'owner'
    if (!canWrite) return null

    const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() }
    const [row] = await tx.update(projectsTable)
      .set(updates)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))
      .returning()
    if (!row) return null

    await tx.insert(projectActivityTable)
      .values({
        projectId: id,
        orgId: localOrgId,
        actorUserId: userId,
        action: parsed.data.status === 'archived' ? 'archived_project' : 'updated_project',
        resourceType: 'project',
        resourceId: id,
        resourceLabel: row.name,
        payload: parsed.data,
      })

    return row
  })

  if (!updated) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'project.updated',
    resourceType: 'project',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: parsed.data,
  })

  return NextResponse.json({
    project: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      color: updated.color,
      status: updated.status,
      metadata: updated.metadata ?? {},
      authorUserId: updated.authorUserId,
      mine: updated.authorUserId === userId,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  })
}

// DELETE /api/projects/[id] — delete project (owner only)
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const removed = await withOrgContext(localOrgId, async (tx) => {
    const [project] = await tx.select({
      id: projectsTable.id,
      authorUserId: projectsTable.authorUserId,
    })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))
      .limit(1)
    if (!project) return null

    const isOwner = project.authorUserId === userId
    const isOrgAdmin = resolvedRole === 'admin' || resolvedRole === 'owner'
    if (!isOwner && !isOrgAdmin) return null

    await tx.delete(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))
    return { id }
  })

  if (!removed) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'project.deleted',
    resourceType: 'project',
    resourceId: id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
  })

  return NextResponse.json({ ok: true })
}
