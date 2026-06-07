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

// PATCH /api/team/members/:userId — change a member's role (admins only)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId, orgId, orgRole } = await auth()
  const { userId: targetId } = await ctx.params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 403 })
  if (!isAdmin(orgRole)) {
    return NextResponse.json({ error: 'Requires admin role' }, { status: 403 })
  }
  let body: { role?: unknown }
  try { body = await req.json() } catch { body = {} }
  const role = typeof body.role === 'string' ? body.role : ''
  if (!(role in APP_TO_CLERK_ROLE)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  try {
    const client = await clerkClient()
    await client.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId: targetId,
      role: APP_TO_CLERK_ROLE[role],
    })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update role'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE /api/team/members/:userId — remove a member (admins only)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  const { userId, orgId, orgRole } = await auth()
  const { userId: targetId } = await ctx.params
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId) return NextResponse.json({ error: 'No active organization' }, { status: 403 })
  if (!isAdmin(orgRole)) {
    return NextResponse.json({ error: 'Requires admin role' }, { status: 403 })
  }
  if (targetId === userId) {
    return NextResponse.json({ error: 'You cannot remove yourself; transfer ownership first' }, { status: 400 })
  }
  try {
    const client = await clerkClient()
    await client.organizations.deleteOrganizationMembership({
      organizationId: orgId,
      userId: targetId,
    })
    return new NextResponse(null, { status: 204 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to remove member'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
