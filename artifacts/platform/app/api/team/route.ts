import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { auth } from '@/lib/auth-server'

const APP_TO_CLERK_ROLE: Record<string, string> = {
  admin: 'org:admin',
  member: 'org:member',
  viewer: 'org:member',
}

interface MemberPublicData {
  userId?: string | null
  firstName?: string | null
  lastName?: string | null
  identifier?: string | null
  imageUrl?: string | null
}

interface MemberLike { id: string; role: string; publicUserData?: MemberPublicData | null; createdAt: number | string }
function shapeMember(raw: unknown) {
  const m = raw as MemberLike
  const u = m.publicUserData
  const fullName = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim()
  return {
    membershipId: m.id,
    userId: u?.userId ?? null,
    name: fullName || u?.identifier || 'Teammate',
    email: u?.identifier ?? null,
    imageUrl: u?.imageUrl ?? null,
    role: m.role.replace(/^org:/, ''),
    status: 'active' as const,
    joinedAt: m.createdAt,
  }
}

interface InvitationLike { id: string; emailAddress: string; role: string; status: string; createdAt: number | string }
function shapeInvitation(raw: unknown) {
  const i = raw as InvitationLike
  return {
    invitationId: i.id,
    email: i.emailAddress,
    role: i.role.replace(/^org:/, ''),
    status: 'invited' as const,
    invitedAt: i.createdAt,
    rawStatus: i.status,
  }
}

// GET /api/team — current org snapshot (members + pending invitations)
export async function GET() {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ organization: null, members: [], invitations: [] })

  try {
    const client = await clerkClient()
    const [org, members, invitations] = await Promise.all([
      client.organizations.getOrganization({ organizationId: orgId }),
      client.organizations.getOrganizationMembershipList({ organizationId: orgId, limit: 100 }),
      client.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ['pending'] }),
    ])
    return NextResponse.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        membersCount: org.membersCount ?? members.data.length,
        role: orgRole?.replace(/^org:/, '') ?? null,
      },
      members: members.data.map((m) => shapeMember(m)),
      invitations: invitations.data.map((i) => shapeInvitation(i)),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load team'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST /api/team — create a new organization (any signed-in user)
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { name?: unknown; slug?: unknown }
  try { body = await req.json() } catch { body = {} }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim() : undefined
  if (name.length < 1 || name.length > 80) {
    return NextResponse.json({ error: 'name is required (1–80 chars)' }, { status: 400 })
  }
  if (slug !== undefined && !/^[a-z0-9-]{2,60}$/i.test(slug)) {
    return NextResponse.json({ error: 'slug may only contain letters, numbers and dashes' }, { status: 400 })
  }
  try {
    const client = await clerkClient()
    const org = await client.organizations.createOrganization({ name, slug, createdBy: userId })
    return NextResponse.json({ organization: { id: org.id, name: org.name, slug: org.slug } }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create organization'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export { APP_TO_CLERK_ROLE }
