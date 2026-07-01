import { NextRequest, NextResponse } from 'next/server'
import { getNewsBrief } from '@/lib/intelligence/news-intelligence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker      = searchParams.get('ticker') || searchParams.get('symbol') || undefined
  const companyName = searchParams.get('company') || searchParams.get('name') || undefined
  const topic       = searchParams.get('topic') || undefined
  const country     = searchParams.get('country') || undefined

  try {
    const result = await getNewsBrief({ ticker, companyName, topic, country })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({
      unavailable: true,
      unavailableReason: (err as Error).message,
      source: 'Reuters / BBC / GDELT',
    }, { status: 503 })
  }
}
