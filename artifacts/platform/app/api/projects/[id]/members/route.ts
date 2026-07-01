import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { eq, and } from 'drizzle-orm'
import {
  withOrgContext,
  projectsTable,
  projectMembersTable,
  projectActivityTable,
  addMemberSchema,
  patchMemberSchema,
  ensureProjectsSchema,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams { params: Promise<{ id: string }> }

async function assertCanManageMembers(
  tx: Parameters<Parameters<typeof withOrgContext>[1]>[0],
  localOrgId: string,
  projectId: string,
  userId: string,
  orgRole: string | null,
): Promise<boolean> {
  if (orgRole === 'admin' || orgRole === 'owner') return true
  const rows = await tx.select({ role: projectMembersTable.role })
    .from(projectMembersTable)
    .where(and(
      eq(projectMembersTable.projectId, projectId),
      eq(projectMembersTable.userId, userId),
      eq(projectMembersTable.orgId, localOrgId),
    ))
    .limit(1)
  const role = rows[0]?.role
  return role === 'owner' || role === 'admin'
}

// GET /api/projects/[id]/members — list project members
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const members = await withOrgContext(localOrgId, async (tx) => {
    // Confirm project exists in org
    const [project] = await tx.select({ id: projectsTable.id })
      .from(projectsTable)
      .where(and(eq(projectsTable.id, id), eq(projectsTable.orgId, localOrgId)))
      .limit(1)
    if (!project) return null

    // Caller must be a member or org admin
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
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.projectId, id),
        eq(projectMembersTable.orgId, localOrgId),
      ))
  })

  if (members === null) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  return NextResponse.json({
    members: members.map(m => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      addedByUserId: m.addedByUserId,
      createdAt: m.createdAt.toISOString(),
    })),
  })
}

// POST /api/projects/[id]/members — add a member
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = addMemberSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const result = await withOrgContext(localOrgId, async (tx) => {
    const canManage = await assertCanManageMembers(tx, localOrgId, id, userId, resolvedRole)
    if (!canManage) return null

    const [member] = await tx.insert(projectMembersTable)
      .values({
        projectId: id,
        orgId: localOrgId,
        userId: parsed.data.userId,
        role: parsed.data.role ?? 'member',
        addedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: [projectMembersTable.projectId, projectMembersTable.userId],
        set: { role: parsed.data.role ?? 'member' },
      })
      .returning()

    await tx.insert(projectActivityTable)
      .values({
        projectId: id,
        orgId: localOrgId,
        actorUserId: userId,
        action: 'added_member',
        resourceType: 'member',
        resourceId: parsed.data.userId,
        payload: { role: parsed.data.role ?? 'member' },
      })

    return member
  })

  if (!result) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  return NextResponse.json({
    member: {
      id: result.id,
      userId: result.userId,
      role: result.role,
      addedByUserId: result.addedByUserId,
      createdAt: result.createdAt.toISOString(),
    },
  }, { status: 201 })
}

// PATCH /api/projects/[id]/members?userId=... — change a member's role
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const targetUserId = req.nextUrl.searchParams.get('userId')
  if (!targetUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = patchMemberSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const updated = await withOrgContext(localOrgId, async (tx) => {
    const canManage = await assertCanManageMembers(tx, localOrgId, id, userId, resolvedRole)
    if (!canManage) return null

    const [row] = await tx.update(projectMembersTable)
      .set({ role: parsed.data.role })
      .where(and(
        eq(projectMembersTable.projectId, id),
        eq(projectMembersTable.userId, targetUserId),
        eq(projectMembersTable.orgId, localOrgId),
      ))
      .returning()
    return row ?? null
  })

  if (!updated) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })

  return NextResponse.json({
    member: {
      id: updated.id,
      userId: updated.userId,
      role: updated.role,
      addedByUserId: updated.addedByUserId,
      createdAt: updated.createdAt.toISOString(),
    },
  })
}

// DELETE /api/projects/[id]/members?userId=... — remove a member
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  const targetUserId = req.nextUrl.searchParams.get('userId')
  if (!targetUserId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  await ensureProjectsSchema()
  const localOrgId = await resolveLocalOrgId(orgId)
  const resolvedRole = orgRole?.replace(/^org:/, '') ?? null

  const removed = await withOrgContext(localOrgId, async (tx) => {
    // Allow self-removal; otherwise need manage permission
    if (targetUserId !== userId) {
      const canManage = await assertCanManageMembers(tx, localOrgId, id, userId, resolvedRole)
      if (!canManage) return false
    }

    const rows = await tx.delete(projectMembersTable)
      .where(and(
        eq(projectMembersTable.projectId, id),
        eq(projectMembersTable.userId, targetUserId),
        eq(projectMembersTable.orgId, localOrgId),
      ))
      .returning({ id: projectMembersTable.id })

    if (rows.length > 0) {
      await tx.insert(projectActivityTable)
        .values({
          projectId: id,
          orgId: localOrgId,
          actorUserId: userId,
          action: 'removed_member',
          resourceType: 'member',
          resourceId: targetUserId,
        })
    }

    return rows.length > 0
  })

  if (!removed) return NextResponse.json({ error: 'forbidden_or_missing' }, { status: 403 })
  return NextResponse.json({ ok: true })
}
