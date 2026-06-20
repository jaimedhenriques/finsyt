import { NextRequest, NextResponse } from 'next/server'

// Slide-image → table extraction is not yet wired to a real OCR/extraction
// pipeline. Until it is we refuse to return synthetic numbers — callers get a
// 501 with a clear message so the UI can render an explicit empty state.
export async function GET(req: NextRequest) {
  // Server-side Pro entitlement check stays, so paying users still see the
  // correct gating message rather than the not-implemented one.
  const tier = req.cookies.get('finsyt_tier')?.value || 'free'
  if (tier === 'free') {
    return NextResponse.json(
      { error: 'Extract-to-Excel is a Pro feature. Upgrade to enable.' },
      { status: 402 }
    )
  }
  return NextResponse.json(
    {
      error: 'not_implemented',
      message:
        'Slide → Excel extraction is not yet wired to a real extraction pipeline. The previous demo workbook contained synthetic numbers and has been removed.',
    },
    { status: 501 }
  )
}
