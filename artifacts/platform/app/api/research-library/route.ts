import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { listLibraryItems, removeLibraryItem } from "./store"
import { deleteSource } from "../workspaces/store"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = req.nextUrl
  const topic = url.searchParams.get("topic") || ""
  const q = url.searchParams.get("q") || ""

  const items = await listLibraryItems(orgId)

  let filtered = items
  if (topic) filtered = filtered.filter((i) => i.topics.includes(topic))
  if (q) {
    const lq = q.toLowerCase()
    filtered = filtered.filter(
      (i) =>
        i.title.toLowerCase().includes(lq) ||
        i.abstract.toLowerCase().includes(lq) ||
        i.authors.some((a) => a.toLowerCase().includes(lq)),
    )
  }

  return NextResponse.json({ items: filtered, total: items.length })
}

export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { itemId } = (await req.json()) as { itemId?: string }
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 })

  // removeLibraryItem returns the removed item so we can use its stored
  // workspaceSourceId — not a reconstructed one based on the current userId.
  // This is important because the item may have been ingested by a different
  // org member, and the sourceId would differ.
  const removed = await removeLibraryItem(orgId, itemId)
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Extract the ingester's userId from the stored sourceId prefix
  // (format: `${ingestingUserId}:rl:${itemId}`) so deleteSource cleans up
  // the correct record regardless of who is calling DELETE.
  const storedSourceId = removed.workspaceSourceId
  const ingestingUserId = storedSourceId.split(":")[0] ?? userId
  await deleteSource(ingestingUserId, storedSourceId)

  return NextResponse.json({ ok: true })
}
