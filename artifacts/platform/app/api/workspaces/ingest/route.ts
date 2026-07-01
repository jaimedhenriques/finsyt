import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server";
import dns from "dns/promises"
import { saveSource, type WorkspaceSourceType } from "../store"
import { ingestBufferAsSource } from "@/lib/workspaces/ingest-helper"

export const runtime = "nodejs"

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 30
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

  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":")) {
    return isPrivateIp(hostname)
  }

  const ips: string[] = []
  try { ips.push(...(await dns.resolve4(hostname))) } catch { /* no A records */ }
  try { ips.push(...(await dns.resolve6(hostname))) } catch { /* no AAAA records */ }
  if (ips.length === 0) return true
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

/**
 * Map a multipart filename or explicit `type` field to one of our internal
 * source types. We accept the full data-room file family — PDF, DOCX, XLSX,
 * PPTX, TXT — plus the legacy URL/SEC/text types the research surface emits.
 */
function resolveSourceType(declared: string | null, fileName?: string | null): WorkspaceSourceType | null {
  const allowed: WorkspaceSourceType[] = ["pdf", "url", "text", "sec", "docx", "xlsx", "pptx", "txt"]
  if (declared && (allowed as string[]).includes(declared)) return declared as WorkspaceSourceType
  if (!fileName) return null
  const ext = fileName.toLowerCase().split(".").pop() || ""
  switch (ext) {
    case "pdf": return "pdf"
    case "docx": return "docx"
    case "xlsx": case "xls": return "xlsx"
    case "pptx": case "ppt": return "pptx"
    case "txt": case "md": case "csv": case "log": return "txt"
    default: return null
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
    const clientSourceId = (formData.get("sourceId") as string) || ""
    const declaredType = formData.get("type") as string | null
    const name = (formData.get("name") as string) || ""
    const workspaceId = (formData.get("workspaceId") as string) || null
    const origin = ((formData.get("origin") as string) || null) as
      | "upload" | "connector" | "url" | null
    const connectorSlug = (formData.get("connectorSlug") as string) || null

    if (!clientSourceId) {
      return NextResponse.json({ success: false, error: "sourceId required" }, { status: 400 })
    }

    const sourceId = `${userId}:${clientSourceId}`

    const file = formData.get("file") as File | null
    const type = resolveSourceType(declaredType, file?.name)
    if (!type) {
      return NextResponse.json(
        { success: false, error: `Unsupported source type: ${declaredType ?? "auto"}` },
        { status: 400 },
      )
    }

    if (type === "text" || type === "url" || type === "sec") {
      let rawText = ""
      if (type === "text") {
        rawText = (formData.get("text") as string) || ""
      } else {
        const url = (formData.get("url") as string) || ""
        if (await isBlockedUrl(url)) {
          return NextResponse.json({ success: false, error: "URL not allowed" }, { status: 400 })
        }
        rawText = await fetchUrlText(url)
      }
      if (!rawText || rawText.length < 20) {
        return NextResponse.json({ success: false, error: "No text extracted", chunkCount: 0 })
      }
      const chunks = chunkText(rawText)
      await saveSource(sourceId, name, type, chunks, {
        workspaceId,
        byteSize: null,
        hash: null,
        origin: origin ?? "url",
        connectorSlug,
      })
      return NextResponse.json({
        success: true,
        sourceId,
        type,
        chunkCount: chunks.length,
        byteSize: null,
        hash: null,
        size: `${(rawText.length / 1000).toFixed(0)}k chars`,
        ingestedAt: new Date().toISOString(),
      })
    }

    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await ingestBufferAsSource({
      userId,
      workspaceId,
      clientSourceId,
      name: name || file.name,
      buffer,
      origin: (origin ?? "upload") as "upload" | "connector" | "url",
      connectorSlug,
      // The HTTP route is the user-driven manual upload path. We disable
      // dedupe here so re-uploading the same file overwrites the existing
      // record and refreshes its chunks (the user expects a re-upload to
      // succeed, not silently hit a "deduped" branch).
      dedupe: false,
    })

    if (!result.ok) {
      const status = result.error === "file_too_large (max 25 MB)" ? 413 : 400
      return NextResponse.json(
        { success: false, error: result.error ?? "ingest_failed", chunkCount: 0 },
        { status },
      )
    }

    return NextResponse.json({
      success: true,
      sourceId: result.sourceId,
      type: result.type,
      chunkCount: result.chunkCount,
      byteSize: result.byteSize,
      hash: result.hash,
      size: result.size,
      ingestedAt: result.ingestedAt,
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
