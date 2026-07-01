import { NextRequest, NextResponse } from 'next/server'
import { screenSanctions } from '@/lib/intelligence/sanctions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity') || searchParams.get('name') || searchParams.get('q') || ''
  if (!entity.trim()) {
    return NextResponse.json({ error: 'entity parameter required' }, { status: 400 })
  }
  try {
    const result = await screenSanctions(entity)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({
      unavailable: true,
      unavailableReason: (err as Error).message,
      source: 'OFAC SDN / EU FSF / UN Security Council',
    }, { status: 503 })
  }
}
