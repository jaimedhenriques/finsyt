/**
 * POST /api/workspaces/ingest/bulk
 * ─────────────────────────────────
 * Batch-ingest multiple files in a single multipart request. Returns a
 * per-file result array so the UI can render aggregate progress
 * ("12 / 25 ingested, 3 skipped, 1 failed") without waiting for every
 * file to finish before showing any feedback.
 *
 * Security / limits:
 *  - Same userId-prefix namespacing and rate limiting as the single-file
 *    ingest route.
 *  - Max 100 files per call; the UI should chunk larger sets into
 *    sequential calls of ≤100 files.
 *  - Per-file size cap is enforced by ingestBufferAsSource (25 MB).
 *  - SHA-256 dedupe is ON by default; re-uploading the same file is a no-op
 *    unless the caller sets `dedupe=false` in the form.
 */
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth-server"
import { ingestBufferAsSource } from "@/lib/workspaces/ingest-helper"
import type { IngestBufferResult } from "@/lib/workspaces/ingest-helper"

export const runtime = "nodejs"

const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 5
const bulkHits = new Map<string, number[]>()

function rateLimited(userId: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_WINDOW_MS
  const hits = (bulkHits.get(userId) ?? []).filter((t) => t >= cutoff)
  hits.push(now)
  bulkHits.set(userId, hits)
  if (bulkHits.size > 2_000) {
    const first = bulkHits.keys().next().value
    if (first) bulkHits.delete(first)
  }
  return hits.length > RATE_LIMIT
}

const MAX_FILES_PER_CALL = 100

export interface BulkIngestFileResult {
  /** Client-supplied sourceId. */
  clientSourceId: string
  /** Original filename. */
  name: string
  /** Server-issued namespaced sourceId on success. */
  sourceId?: string
  ok: boolean
  deduped?: boolean
  chunkCount?: number
  byteSize?: number
  hash?: string
  size?: string
  ingestedAt?: string
  error?: string
}

export interface BulkIngestResponse {
  results: BulkIngestFileResult[]
  imported: number
  deduped: number
  failed: number
  skipped: number
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (rateLimited(userId)) {
    return NextResponse.json(
      { error: "Bulk ingest rate limit exceeded. Try again shortly." },
      { status: 429, headers: { "retry-after": String(Math.ceil(RATE_WINDOW_MS / 1000)) } },
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 })
  }

  const workspaceId =
    (formData.get("workspaceId") as string | null) || null
  const dedupeParam = formData.get("dedupe") as string | null
  const dedupe = dedupeParam !== "false"

  const files = formData.getAll("file") as File[]
  const clientSourceIds = formData.getAll("sourceId") as string[]

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 })
  }

  const capped = files.slice(0, MAX_FILES_PER_CALL)

  const tasks = capped.map(async (file, i): Promise<BulkIngestFileResult> => {
    const clientSourceId = clientSourceIds[i] || `bulk-${i}-${Date.now()}`
    const name = file.name || clientSourceId

    let buffer: Buffer
    try {
      buffer = Buffer.from(await file.arrayBuffer())
    } catch {
      return { clientSourceId, name, ok: false, error: "buffer_read_failed" }
    }

    let result: IngestBufferResult
    try {
      result = await ingestBufferAsSource({
        userId,
        workspaceId,
        clientSourceId,
        name,
        buffer,
        origin: "upload",
        dedupe,
      })
    } catch (err) {
      return {
        clientSourceId,
        name,
        ok: false,
        error: (err as Error).message || "ingest_failed",
      }
    }

    if (!result.ok) {
      return {
        clientSourceId,
        name,
        ok: false,
        byteSize: result.byteSize,
        hash: result.hash || undefined,
        error: result.error,
      }
    }

    return {
      clientSourceId,
      name,
      sourceId: result.sourceId,
      ok: true,
      deduped: result.deduped,
      chunkCount: result.chunkCount,
      byteSize: result.byteSize,
      hash: result.hash || undefined,
      size: result.size,
      ingestedAt: result.ingestedAt,
    }
  })

  const results = await Promise.all(tasks)

  const imported = results.filter((r) => r.ok && !r.deduped).length
  const deduped = results.filter((r) => r.ok && r.deduped).length
  const failed = results.filter((r) => !r.ok && r.error && !r.error.startsWith("unsupported_type")).length
  const skipped = results.filter((r) => !r.ok && r.error?.startsWith("unsupported_type")).length

  return NextResponse.json({ results, imported, deduped, failed, skipped } satisfies BulkIngestResponse)
}
