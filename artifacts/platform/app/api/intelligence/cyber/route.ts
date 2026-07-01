import { NextRequest, NextResponse } from 'next/server'
import { getCyberThreats } from '@/lib/intelligence/cyber'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker      = searchParams.get('ticker') || searchParams.get('symbol') || undefined
  const companyName = searchParams.get('company') || searchParams.get('name') || undefined
  const sector      = searchParams.get('sector') || undefined

  try {
    const result = await getCyberThreats({ ticker, companyName, sector })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({
      unavailable: true,
      unavailableReason: (err as Error).message,
      source: 'CISA KEV / NVD NIST',
    }, { status: 503 })
  }
}
