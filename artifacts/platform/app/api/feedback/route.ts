import { NextRequest, NextResponse } from 'next/server'

const SECRET = process.env.FEEDBACK_SECRET || ''

// ── POST /api/feedback — submit NPS entry ─────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { score, comment, suggestion, page, sessionDuration } = body

    if (score == null || score < 0 || score > 10) {
      return NextResponse.json({ error: 'score must be 0–10' }, { status: 400 })
    }

    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      score,
      comment: comment || '',
      suggestion: suggestion || '',
      page: page || 'unknown',
      sessionDuration: sessionDuration || 0,
      processed: false,
    }

    // Store to Vercel Blob if available, else log
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (token) {
      const { put } = await import('@vercel/blob')
      const key = `feedback/${entry.id}.json`
      await put(key, JSON.stringify(entry), {
        access: 'public',
        addRandomSuffix: false,
        token,
      })
    } else {
      // Fallback: log to console (captured by Vercel logs)
      console.log('FINSYT_FEEDBACK', JSON.stringify(entry))
    }

    return NextResponse.json({ ok: true, id: entry.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ── GET /api/feedback — retrieve all (authenticated) ─────────────────────────
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || ''
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Blob storage not configured' }, { status: 500 })
  }

  try {
    const { list, head } = await import('@vercel/blob')
    const { blobs } = await list({ prefix: 'feedback/', token })
    const entries = await Promise.all(
      blobs.map(async (b: any) => {
        const r = await fetch(b.url)
        return r.json()
      })
    )
    const sorted = entries.sort((a: any, b: any) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    const avgNPS = sorted.length
      ? sorted.reduce((s: number, e: any) => s + (e.score || 0), 0) / sorted.length
      : 0

    return NextResponse.json({ entries: sorted, count: sorted.length, avgNPS: parseFloat(avgNPS.toFixed(2)) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
