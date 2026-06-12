import { NextRequest, NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { auth } from '@/lib/auth-server'

const APP_TO_CLERK_ROLE: Record<string, string> = {
  admin: 'org:admin',
  member: 'org:member',
  viewer: 'org:member',
}

function isAdmin(orgRole: string | null | undefined): boolean {
  const r = (orgRole || '').replace(/^org:/, '')
  return r === 'admin' || r === 'owner'
}

// POST /api/team/invitations — invite by email + role (admins only)
export async function POST(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 403 })
  if (!isAdmin(orgRole)) {
    return NextResponse.json({ error: 'Requires admin role' }, { status: 403 })
  }

  let body: { email?: unknown; role?: unknown }
  try { body = await req.json() } catch { body = {} }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = typeof body.role === 'string' ? body.role : 'member'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!(role in APP_TO_CLERK_ROLE)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  try {
    const client = await clerkClient()
    const inv = await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      emailAddress: email,
      role: APP_TO_CLERK_ROLE[role],
      inviterUserId: userId,
    })
    return NextResponse.json({
      invitation: {
        invitationId: inv.id,
        email: inv.emailAddress,
        role: inv.role.replace(/^org:/, ''),
        invitedAt: inv.createdAt,
      },
    }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to send invitation'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
