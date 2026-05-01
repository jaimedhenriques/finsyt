import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server";
import dns from "dns/promises"
import pdfParse from "pdf-parse"
import { saveSource } from "../store"

export const runtime = "nodejs"

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 20
const ingestHits = new Map<string, number[]>()

function ingestRateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const hits = (ingestHits.get(userId) ?? []).filter(t => t >= cutoff)
  hits.push(now)
  ingestHits.set(userId, hits)
  if (ingestHits.size > 5_000) {
    const first = ingestHits.keys().next().value
    if (first) ingestHits.delete(first)
  }
  return hits.length > RATE_LIMIT
}

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a === 240 || a === 255
    )
  }
  const lc = ip.toLowerCase()
  return lc === "::1" || lc.startsWith("fe80:") || lc.startsWith("fc") || lc.startsWith("fd")
}

async function isBlockedUrl(urlString: string): Promise<boolean> {
  let url: URL
  try { url = new URL(urlString) } catch { return true }

  if (url.protocol !== "http:" && url.protocol !== "https:") return true

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")

  const blockedNames = ["localhost", "metadata.google.internal", "metadata.goog", "169.254.169.254"]
  if (blockedNames.includes(hostname)) return true

  // If hostname is a bare IP, check it directly
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) {
    return isPrivateIp(hostname)
  }

  // DNS-resolve the hostname and check all returned addresses
  const ips: string[] = []
  try { ips.push(...(await dns.resolve4(hostname))) } catch { /* no A records */ }
  try { ips.push(...(await dns.resolve6(hostname))) } catch { /* no AAAA records */ }
  if (ips.length === 0) return true // unresolvable — block
  return ips.some(isPrivateIp)
}

async function fetchUrlText(url: string): Promise<string> {
  if (await isBlockedUrl(url)) return ""
  try {
    let current = url
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        headers: { "User-Agent": "Mozilla/5.0 Finsyt/1.0" },
        signal: AbortSignal.timeout(10_000),
        redirect: "manual",
      })
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location")
        if (!location) return ""
        const next = new URL(location, current).toString()
        if (await isBlockedUrl(next)) return ""
        current = next
        continue
      }
      const html = await res.text()
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 50_000)
    }
    return ""
  } catch {
    return ""
  }
}

function chunkText(text: string, size = 800, overlap = 100): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + size))
    i += size - overlap
  }
  return chunks.filter(c => c.trim().length > 50)
}

function normaliseText(text: string, maxLength = 50_000): string {
  return text.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
}

async function extractPdfText(file: File): Promise<string> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await pdfParse(buffer)
    return normaliseText(parsed.text || "")
  } catch {
    return ""
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (ingestRateLimited(userId)) {
    return NextResponse.json(
      { error: "Too Many Requests", message: "Ingest rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    )
  }

  try {
    const formData = await req.formData()
    const clientSourceId = formData.get("sourceId") as string
    const type = formData.get("type") as string
    const name = formData.get("name") as string

    const sourceId = `${userId}:${clientSourceId}`

    let rawText = ""
    let size = ""

    if (type === "text") {
      rawText = formData.get("text") as string || ""
    } else if (type === "url" || type === "sec") {
      const url = formData.get("url") as string
      if (await isBlockedUrl(url)) {
        return NextResponse.json({ success: false, error: "URL not allowed" }, { status: 400 })
      }
      rawText = await fetchUrlText(url)
    } else if (type === "pdf") {
      const file = formData.get("file") as File
      if (file) {
        if (file.size > MAX_FILE_BYTES) {
          return NextResponse.json({ success: false, error: "File too large (max 20 MB)" }, { status: 413 })
        }
        size = `${(file.size / 1024 / 1024).toFixed(1)}MB`
        rawText = await extractPdfText(file)
        if (!rawText) {
          try { rawText = normaliseText(await file.text()) } catch { rawText = "" }
        }
        if (!rawText) rawText = `[File: ${file.name} — unable to extract readable text from PDF]`
      }
    }

    if (!rawText || rawText.length < 20) {
      return NextResponse.json({ success: false, error: "No text extracted", chunkCount: 0 })
    }

    const chunks = chunkText(rawText)
    await saveSource(sourceId, name, type, chunks)

    return NextResponse.json({
      success: true,
      sourceId,
      chunkCount: chunks.length,
      size: size || `${(rawText.length / 1000).toFixed(0)}k chars`,
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
