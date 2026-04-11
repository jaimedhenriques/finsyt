import { NextRequest, NextResponse } from "next/server"

// In-memory store (swap for Supabase pgvector in production)
// Structure: sourceId -> { chunks: string[], metadata: object }
const STORE = new Map<string, { chunks: string[]; name: string; type: string }>()
export { STORE }

function chunkText(text: string, size = 800, overlap = 100): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + size))
    i += size - overlap
  }
  return chunks.filter(c => c.trim().length > 50)
}

async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Finsyt/1.0" }, signal: AbortSignal.timeout(10000) })
    const html = await res.text()
    // Strip HTML tags
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50000)
  } catch {
    return ""
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const sourceId = formData.get("sourceId") as string
    const type = formData.get("type") as string
    const name = formData.get("name") as string

    let rawText = ""
    let size = ""

    if (type === "text") {
      rawText = formData.get("text") as string || ""
    } else if (type === "url" || type === "sec") {
      const url = formData.get("url") as string
      rawText = await fetchUrlText(url)
    } else if (type === "pdf") {
      const file = formData.get("file") as File
      if (file) {
        size = `${(file.size / 1024 / 1024).toFixed(1)}MB`
        // Read as text (works for txt/md; PDF needs server-side parser)
        try {
          rawText = await file.text()
          // Basic PDF text extraction — strip binary, keep readable chars
          rawText = rawText.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim()
        } catch {
          rawText = `[File: ${file.name} — binary content, unable to extract text in this environment]`
        }
      }
    }

    if (!rawText || rawText.length < 20) {
      return NextResponse.json({ success: false, error: "No text extracted", chunkCount: 0 })
    }

    const chunks = chunkText(rawText)
    STORE.set(sourceId, { chunks, name, type })

    return NextResponse.json({
      success: true,
      chunkCount: chunks.length,
      size: size || `${(rawText.length / 1000).toFixed(0)}k chars`,
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
