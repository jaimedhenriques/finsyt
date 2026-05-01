import { NextResponse } from 'next/server'
import { clerkClient } from '@clerk/nextjs/server'
import { auth } from '@/lib/auth-server'

function isAdmin(orgRole: string | null | undefined): boolean {
  const r = (orgRole || '').replace(/^org:/, '')
  return r === 'admin' || r === 'owner'
}

// DELETE /api/team/invitations/:id — revoke a pending invitation (admins only)
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { userId, orgId, orgRole } = await auth()
  const { id } = await ctx.params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 403 })
  if (!isAdmin(orgRole)) {
    return NextResponse.json({ error: 'Requires admin role' }, { status: 403 })
  }
  try {
    const client = await clerkClient()
    await client.organizations.revokeOrganizationInvitation({
      organizationId: orgId,
      invitationId: id,
      requestingUserId: userId,
    })
    return new NextResponse(null, { status: 204 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to revoke invitation'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
