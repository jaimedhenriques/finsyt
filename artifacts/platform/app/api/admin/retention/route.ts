import { NextRequest, NextResponse } from 'next/server'
import { apiServerFetch, refuseInProduction } from '@/lib/audit-client'

export async function GET() {
  const refused = refuseInProduction()
  if (refused) return refused
  const r = await apiServerFetch('/admin/retention')
  return NextResponse.json(await r.json(), { status: r.status })
}

export async function PUT(req: NextRequest) {
  const refused = refuseInProduction()
  if (refused) return refused
  const body = await req.text()
  const r = await apiServerFetch('/admin/retention', { method: 'PUT', body })
  return NextResponse.json(await r.json(), { status: r.status })
}
