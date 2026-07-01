/**
 * GET /api/research-library/graph
 *
 * Returns a topic knowledge-graph for the tenant's Research Library:
 *   nodes — research topics (with count) + paper entries
 *   edges — paper → topic membership
 *
 * The frontend renders this as an interactive force-directed SVG.
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { listLibraryItems } from "../store"

export const runtime = "nodejs"

export interface GraphNode {
  id: string
  kind: "topic" | "paper"
  label: string
  /** For topic nodes: number of papers. For paper: year or 0. */
  weight: number
  /** For paper nodes only. */
  arxivId?: string
  url?: string
  authors?: string[]
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export async function GET(_req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const items = await listLibraryItems(orgId)
  const topicCounts = new Map<string, number>()
  for (const item of items) {
    for (const t of item.topics) topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1)
  }

  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  for (const [topic, count] of topicCounts.entries()) {
    nodes.push({ id: `topic:${topic}`, kind: "topic", label: topic, weight: count })
  }

  for (const item of items) {
    nodes.push({
      id: `paper:${item.id}`,
      kind: "paper",
      label: item.title.length > 60 ? item.title.slice(0, 57) + "…" : item.title,
      weight: item.year ?? 0,
      arxivId: item.arxivId,
      url: item.url,
      authors: item.authors.slice(0, 3),
    })
    for (const t of item.topics) {
      edges.push({ source: `paper:${item.id}`, target: `topic:${t}` })
    }
  }

  return NextResponse.json({ nodes, edges } satisfies GraphData)
}
