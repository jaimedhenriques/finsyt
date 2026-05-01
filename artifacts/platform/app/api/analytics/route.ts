import { NextRequest, NextResponse } from 'next/server'
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (process.env.NODE_ENV !== 'production') console.log('[analytics:server]', body.event, body.props)
  } catch {}
  return NextResponse.json({ ok: true })
}
