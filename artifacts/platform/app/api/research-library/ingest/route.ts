/**
 * POST /api/research-library/ingest
 *
 * Ingests a research item into the library:
 *   - arXiv paper by ID (e.g. "2501.12345" or "2501.12345v2")
 *   - arXiv search query (returns first result)
 *   - Arbitrary URL (finance blog, report, paper)
 *
 * For arXiv papers, we fetch the full HTML body (introduction, methods,
 * results, conclusion) using ar5iv.org (rendered LaTeX → HTML), not just
 * the abstract. This gives meaningful chunks for hybrid BM25+vector search.
 *
 * The text is chunked, embedded, and stored via the existing workspace_sources
 * pipeline so it is immediately available to DeepResearch and the chat agent.
 * Metadata (title, authors, topics) is persisted in the research library store.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { randomUUID } from "crypto"
import {
  addLibraryItem,
  classifyTopics,
  classifyTopicsWithAI,
  type ResearchLibraryItem,
} from "../store"
import { saveSource } from "../../workspaces/store"
import { embedTexts, embeddingsEnabled } from "../../workspaces/retrieval"

export const runtime = "nodejs"
export const maxDuration = 60

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 10
const hits = new Map<string, number[]>()

function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const h = (hits.get(userId) ?? []).filter((t) => t >= cutoff)
  h.push(now)
  hits.set(userId, h)
  if (hits.size > 2_000) {
    const first = hits.keys().next().value
    if (first) hits.delete(first)
  }
  return h.length > RATE_LIMIT
}

// ── arXiv API metadata ────────────────────────────────────────────────────────

interface ArxivEntry {
  title: string
  authors: string[]
  abstract: string
  arxivId: string
  year?: number
  url: string
}

function parseArxivXml(xml: string): ArxivEntry | null {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1]
  if (!entry) return null

  const text = (tag: string): string => {
    const m = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
    return m?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || ""
  }
  const allText = (tag: string): string[] => {
    const matches = [...entry.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g"))]
    return matches.map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
  }

  const title = text("title")
  const abstract = text("summary")
  const authors = allText("name").filter(Boolean)
  const id = text("id")
  const arxivId = id.replace(/.*abs\//, "").replace(/v\d+$/, "")
  const published = text("published")
  const year = published ? parseInt(published.slice(0, 4), 10) : undefined

  if (!title || !abstract) return null
  return { title, authors, abstract, arxivId, year, url: `https://arxiv.org/abs/${arxivId}` }
}

async function fetchArxivMetadata(id: string): Promise<ArxivEntry | null> {
  try {
    const res = await fetch(
      `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`,
      { signal: AbortSignal.timeout(12_000) },
    )
    if (!res.ok) return null
    return parseArxivXml(await res.text())
  } catch {
    return null
  }
}

async function fetchArxivSearch(query: string): Promise<ArxivEntry | null> {
  try {
    const params = new URLSearchParams({
      search_query: `all:${query}`,
      max_results: "1",
      sortBy: "relevance",
    })
    const res = await fetch(`https://export.arxiv.org/api/query?${params}`, {
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    return parseArxivXml(await res.text())
  } catch {
    return null
  }
}

// ── arXiv full-text (HTML body) fetching ──────────────────────────────────────
//
// arXiv papers have HTML versions at two sources:
//   • https://arxiv.org/html/<id>   — native HTML (papers from ~2023+)
//   • https://ar5iv.org/abs/<id>    — LaTeX→HTML rendering (broader coverage)
//
// We try both, strip markup, and extract main body sections (Introduction →
// Conclusion), dropping References, Acknowledgements, and Appendices that
// add noise without improving retrieval quality.

/** Sections to drop from arXiv HTML body (case-insensitive heading match). */
const DROP_SECTIONS = /^(references|acknowledgements?|acknowledgments?|appendix|appendices|funding|conflict)/i

/**
 * Extract the main body text from arXiv HTML (ar5iv or native).
 * Returns the cleaned prose with section headings preserved, capped at 80 000 chars.
 */
function extractArxivBody(html: string): string {
  // Remove scripts, styles, MathJax, nav, header, footer
  let clean = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/(?:nav|header|footer|aside)>/gi, " ")
    // Inline math: keep the alt text
    .replace(/<math[^>]*>[\s\S]*?<\/math>/gi, " [eq] ")
    // SVG figures: drop
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, " ")
    // Tables: flatten — keep the raw text
    .replace(/<\/t[dr]>/gi, " | ")

  // Convert block elements to newlines so paragraphs are separated
  clean = clean
    .replace(/<\/?(p|div|section|article|li|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  // Drop everything from the References section onward
  const lines = clean.split("\n")
  const out: string[] = []
  for (const line of lines) {
    const stripped = line.trim()
    if (DROP_SECTIONS.test(stripped) && stripped.length < 60) break
    out.push(line)
  }

  return out.join("\n").trim().slice(0, 80_000)
}

/**
 * Fetch the full body text for an arXiv paper.
 * Tries the native HTML endpoint first, then ar5iv as fallback.
 * Falls back to the abstract-only text if both fail.
 */
async function fetchArxivFullText(arxivId: string, fallback: string): Promise<string> {
  // Primary: native arxiv HTML (works for ~2023+ papers)
  const nativeUrl = `https://arxiv.org/html/${arxivId}`
  try {
    const res = await fetch(nativeUrl, {
      headers: { "User-Agent": "Mozilla/5.0 Finsyt/1.0 (research indexer)" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    })
    if (res.ok) {
      const html = await res.text()
      if (html.length > 5_000) {
        const body = extractArxivBody(html)
        if (body.length > 1_000) return body
      }
    }
  } catch { /* fall through to ar5iv */ }

  // Fallback: ar5iv.org — LaTeX→HTML rendering with broader coverage
  const ar5ivUrl = `https://ar5iv.org/abs/${arxivId}`
  try {
    const res = await fetch(ar5ivUrl, {
      headers: { "User-Agent": "Mozilla/5.0 Finsyt/1.0 (research indexer)" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    })
    if (res.ok) {
      const html = await res.text()
      if (html.length > 5_000) {
        const body = extractArxivBody(html)
        if (body.length > 1_000) return body
      }
    }
  } catch { /* fall through to abstract */ }

  // Final fallback: just the abstract
  return fallback
}

// ── URL fetcher (with SSRF guard) ──────────────────────────────────────────────

function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }
  const lc = ip.toLowerCase()
  return lc === "::1" || lc.startsWith("fe80:")
}

async function isBlockedUrl(urlString: string): Promise<boolean> {
  let url: URL
  try { url = new URL(urlString) } catch { return true }
  if (url.protocol !== "http:" && url.protocol !== "https:") return true
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  const blocked = ["localhost", "metadata.google.internal", "169.254.169.254"]
  if (blocked.includes(hostname)) return true
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return isPrivateIp(hostname)
  try {
    const dns = await import("dns/promises")
    const ips = await dns.resolve4(hostname).catch(() => [] as string[])
    if (ips.some(isPrivateIp)) return true
  } catch { /* ignore */ }
  return false
}

async function fetchUrlContent(urlStr: string): Promise<string> {
  if (await isBlockedUrl(urlStr)) return ""
  try {
    let current = urlStr
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        headers: { "User-Agent": "Mozilla/5.0 Finsyt/1.0" },
        signal: AbortSignal.timeout(15_000),
        redirect: "manual",
      })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location")
        if (!loc) return ""
        current = new URL(loc, current).toString()
        if (await isBlockedUrl(current)) return ""
        continue
      }
      const html = await res.text()
      return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80_000)
    }
    return ""
  } catch {
    return ""
  }
}

// ── Chunker ───────────────────────────────────────────────────────────────────

function chunkText(text: string, size = 800, overlap = 100): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + size))
    i += size - overlap
  }
  return chunks.filter((c) => c.trim().length > 50)
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (isRateLimited(userId))
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

  let body: { mode?: string; input?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const mode = body.mode || "url" // "arxiv_id" | "arxiv_search" | "url"
  const input = (body.input || "").trim()
  if (!input) return NextResponse.json({ error: "input required" }, { status: 400 })

  let entry: ArxivEntry | null = null
  let rawText = ""
  let sourceType: "arxiv" | "url" = "url"
  let attribution = ""
  let urlFallback = input

  if (mode === "arxiv_id") {
    sourceType = "arxiv"
    const cleanId = input.trim().replace(/^arxiv:/i, "").replace(/v\d+$/, "")
    entry = await fetchArxivMetadata(cleanId)
    if (!entry) return NextResponse.json({ error: "arXiv paper not found" }, { status: 404 })

    // Fetch full body text (title + abstract as fallback if HTML unavailable)
    const abstractFallback = [
      entry.title,
      `Authors: ${entry.authors.join(", ")}`,
      `Abstract: ${entry.abstract}`,
    ].join("\n\n")
    rawText = await fetchArxivFullText(entry.arxivId, abstractFallback)
    attribution = "arXiv"
    urlFallback = entry.url
  } else if (mode === "arxiv_search") {
    sourceType = "arxiv"
    entry = await fetchArxivSearch(input)
    if (!entry) return NextResponse.json({ error: "No arXiv results found" }, { status: 404 })

    const abstractFallback = [
      entry.title,
      `Authors: ${entry.authors.join(", ")}`,
      `Abstract: ${entry.abstract}`,
    ].join("\n\n")
    rawText = await fetchArxivFullText(entry.arxivId, abstractFallback)
    attribution = "arXiv"
    urlFallback = entry.url
  } else {
    // URL mode
    if (await isBlockedUrl(input))
      return NextResponse.json({ error: "URL not allowed" }, { status: 400 })
    rawText = await fetchUrlContent(input)
    if (!rawText || rawText.length < 50)
      return NextResponse.json({ error: "Could not extract content from URL" }, { status: 422 })
    try {
      attribution = new URL(input).hostname.replace(/^www\./, "")
    } catch {
      attribution = "url"
    }
    // Derive a title from the first sentence / beginning of content
    const firstSentence = rawText.split(/[.!?\n]/)[0]?.trim() || input
    entry = {
      title: firstSentence.slice(0, 150) || input,
      authors: [],
      abstract: rawText.slice(0, 600),
      arxivId: "",
      url: input,
    }
  }

  const itemId = randomUUID()
  const sourceId = `${userId}:rl:${itemId}`

  const chunks = chunkText(rawText)
  if (chunks.length === 0)
    return NextResponse.json({ error: "No content could be extracted" }, { status: 422 })

  // Keyword-based topic classification (synchronous, no API required)
  const keywordTopics = classifyTopics(entry.title, entry.abstract)
  // Async AI enhancement — always have keyword fallback
  const topics = await classifyTopicsWithAI(entry.title, entry.abstract, keywordTopics).catch(
    () => keywordTopics,
  )

  // Compute embeddings if configured (best-effort — chunks stored even on failure)
  let embeddings: (number[] | null)[] | null = null
  if (embeddingsEnabled() && chunks.length > 0) {
    embeddings = await embedTexts(chunks).catch(() => null)
  }

  await saveSource(sourceId, entry.title, "url", chunks, {
    workspaceId: null,
    byteSize: null,
    hash: null,
    origin: "url",
    connectorSlug: "research-library",
    embeddings,
  })

  const item: ResearchLibraryItem = {
    id: itemId,
    orgId,
    title: entry.title,
    authors: entry.authors,
    abstract: entry.abstract.slice(0, 1200),
    topics,
    sourceType,
    arxivId: entry.arxivId || undefined,
    url: urlFallback,
    attribution,
    ingestedAt: new Date().toISOString(),
    workspaceSourceId: sourceId,
    chunkCount: chunks.length,
    year: entry.year,
  }

  await addLibraryItem(item)

  return NextResponse.json({ ok: true, item })
}
