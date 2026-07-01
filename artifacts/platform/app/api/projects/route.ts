import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { desc, eq, and, inArray } from 'drizzle-orm'
import {
  withOrgContext,
  projectsTable,
  projectMembersTable,
  projectActivityTable,
  insertProjectSchema,
  ensureProjectsSchema,
  auditLog,
} from '@workspace/db'
import { resolveLocalOrgId } from '@/lib/org-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let schemaReady = false
async function getSchemaReady() {
  if (!schemaReady) {
    await ensureProjectsSchema()
    schemaReady = true
  }
}

interface ProjectDto {
  id: string
  name: string
  description: string
  color: string
  status: string
  metadata: Record<string, unknown>
  authorUserId: string
  mine: boolean
  memberCount: number
  createdAt: string
  updatedAt: string
}

function toDto(
  r: typeof projectsTable.$inferSelect,
  currentUserId: string,
  memberCount: number,
): ProjectDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    status: r.status,
    metadata: (r.metadata && typeof r.metadata === 'object' && !Array.isArray(r.metadata))
      ? (r.metadata as Record<string, unknown>)
      : {},
    authorUserId: r.authorUserId,
    mine: r.authorUserId === currentUserId,
    memberCount,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

// GET /api/projects — list all projects in the org
export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ projects: [], synced: false, reason: 'no_workspace' })

  await getSchemaReady()
  const localOrgId = await resolveLocalOrgId(orgId)

  const { rows, memberRows } = await withOrgContext(localOrgId, async (tx) => {
    const rows = await tx.select()
      .from(projectsTable)
      .where(eq(projectsTable.orgId, localOrgId))
      .orderBy(desc(projectsTable.updatedAt))
      .limit(200)

    if (rows.length === 0) return { rows, memberRows: [] as Array<typeof projectMembersTable.$inferSelect> }

    const projectIds = rows.map(r => r.id)
    const memberRows = await tx.select()
      .from(projectMembersTable)
      .where(and(
        eq(projectMembersTable.orgId, localOrgId),
        inArray(projectMembersTable.projectId, projectIds),
      ))
    return { rows, memberRows }
  })

  const memberCounts = new Map<string, number>()
  for (const m of memberRows) {
    memberCounts.set(m.projectId, (memberCounts.get(m.projectId) ?? 0) + 1)
  }

  return NextResponse.json({
    synced: true,
    currentUserId: userId,
    projects: rows.map(r => toDto(r, userId, memberCounts.get(r.id) ?? 0)),
  })
}

// POST /api/projects — create a new project
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: unknown
  try { raw = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const parsed = insertProjectSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'invalid body', details: parsed.error.flatten() }, { status: 400 })

  await getSchemaReady()
  const localOrgId = await resolveLocalOrgId(orgId)

  const { project, member } = await withOrgContext(localOrgId, async (tx) => {
    const [project] = await tx.insert(projectsTable)
      .values({
        orgId: localOrgId,
        authorUserId: userId,
        name: parsed.data.name,
        description: parsed.data.description ?? '',
        color: parsed.data.color ?? 'var(--accent)',
        metadata: parsed.data.metadata ?? {},
      })
      .returning()

    // Auto-add the creator as owner
    const [member] = await tx.insert(projectMembersTable)
      .values({
        projectId: project.id,
        orgId: localOrgId,
        userId,
        role: 'owner',
        addedByUserId: userId,
      })
      .returning()

    await tx.insert(projectActivityTable)
      .values({
        projectId: project.id,
        orgId: localOrgId,
        actorUserId: userId,
        action: 'created_project',
        resourceType: 'project',
        resourceId: project.id,
        resourceLabel: project.name,
      })

    return { project, member }
  })

  await auditLog({
    orgId,
    actorId: userId,
    actorType: 'user',
    action: 'project.created',
    resourceType: 'project',
    resourceId: project.id,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent') ?? null,
    metadata: { name: project.name },
  })

  return NextResponse.json({ project: toDto(project, userId, 1) }, { status: 201 })
}
