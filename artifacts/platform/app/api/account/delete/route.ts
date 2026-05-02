import { NextRequest, NextResponse } from 'next/server'
import { apiServerFetch, refuseInProduction } from '@/lib/audit-client'

export async function POST(req: NextRequest) {
  const refused = refuseInProduction()
  if (refused) return refused
  const body = await req.text()
  const r = await apiServerFetch('/account/delete', { method: 'POST', body: body || '{}' })
  return NextResponse.json(await r.json(), { status: r.status })
}

export async function DELETE() {
  const refused = refuseInProduction()
  if (refused) return refused
  const r = await apiServerFetch('/account/delete', { method: 'DELETE' })
  return NextResponse.json(await r.json(), { status: r.status })
}
