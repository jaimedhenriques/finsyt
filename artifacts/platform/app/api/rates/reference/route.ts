import { NextResponse } from 'next/server'
import { getReferenceRates } from '@/lib/rates-desk'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const data = await getReferenceRates()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { rates: [], source: 'none', error: (e as Error).message },
      { status: 200 },
    )
  }
}
