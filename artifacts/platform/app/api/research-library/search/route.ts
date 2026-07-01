/**
 * GET /api/research-library/search?q=...&orgId=...&limit=...
 *
 * Internal search endpoint used by the Finsyt Agent `search_research` tool.
 * Returns the top-K relevant chunks from the tenant's Research Library,
 * formatted for citation in the agent's answer.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { listLibraryItems } from "../store"
import { getManySources } from "../../workspaces/store"
import { embedQuery, rankChunks, type RetrievalChunk } from "../../workspaces/retrieval"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = req.nextUrl
  const q = (url.searchParams.get("q") || "").trim()
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "6"), 12)

  if (!q) return NextResponse.json({ results: [], count: 0 })

  const items = await listLibraryItems(orgId)
  if (items.length === 0) return NextResponse.json({ results: [], count: 0 })

  const sourceIds = items.map((i) => i.workspaceSourceId)
  const sources = await getManySources(sourceIds)

  const candidates: RetrievalChunk[] = []
  for (const item of items) {
    const src = sources.get(item.workspaceSourceId)
    if (!src) continue
    src.chunks.forEach((text, idx) => {
      candidates.push({
        sourceId: item.workspaceSourceId,
        sourceName: item.title,
        sourceType: "research",
        chunkIndex: idx,
        text,
        embedding: src.embeddings ? src.embeddings[idx] ?? null : null,
      })
    })
  }

  const queryVec = await embedQuery(q).catch(() => null)
  const ranked = rankChunks(candidates, q, queryVec, limit)

  const results = ranked.map((c) => {
    const item = items.find((i) => i.workspaceSourceId === c.sourceId)
    return {
      title: c.sourceName,
      snippet: c.text.trim().slice(0, 400),
      authors: item?.authors || [],
      topics: item?.topics || [],
      attribution: item?.attribution || "research",
      arxivId: item?.arxivId,
      url: item?.url,
      year: item?.year,
      score: c.score,
    }
  })

  return NextResponse.json({ results, count: results.length, totalPapers: items.length })
}
