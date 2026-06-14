import { NextResponse } from 'next/server'
import { apiServerFetch, refuseInProduction } from '@/lib/audit-client'

export async function POST() {
  const refused = refuseInProduction()
  if (refused) return refused
  const r = await apiServerFetch('/admin/retention/purge', { method: 'POST' })
  return NextResponse.json(await r.json(), { status: r.status })
}
