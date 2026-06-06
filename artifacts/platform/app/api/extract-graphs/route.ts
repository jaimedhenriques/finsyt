import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import { requireProFeature } from '@/lib/billing'

// Slide-image → table extraction is not yet wired to a real OCR/extraction
// pipeline. Until it is we refuse to return synthetic numbers — callers get a
// 501 with a clear message so the UI can render an explicit empty state.
export async function GET(req: NextRequest) {
  const { orgId } = await auth()
  const pro = await requireProFeature(orgId, 'Extract-to-Excel')
  if (!pro.allowed) {
    return NextResponse.json(
      { error: pro.reason ?? 'Extract-to-Excel is a Pro feature. Upgrade to enable.' },
      { status: 402 },
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
