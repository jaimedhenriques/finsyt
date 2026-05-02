/**
 * Shared workspace-ingest helper.
 * ───────────────────────────────
 * Used by both the HTTP `POST /api/workspaces/ingest` route and the data-room
 * sync workers. Encapsulates the common pipeline:
 *
 *   1. Resolve the source type from the filename.
 *   2. Extract text via the matching extractor (PDF / DOCX / XLSX / PPTX / TXT).
 *   3. Hash the bytes (sha256) — drives the Sources-tab "fingerprint" column
 *      and the connector-sync dedupe check.
 *   4. Chunk text and call `saveSource`.
 *
 * The HTTP route owns auth, multipart parsing, and rate-limit. This helper
 * is auth-agnostic and accepts a pre-authenticated `userId` so it can be
 * called from a server-side connector worker without re-doing the multipart
 * dance.
 */
import { createHash } from "node:crypto"
// @ts-expect-error pdf-parse ships JS without bundled .d.ts; runtime is fine.
import pdfParse from "pdf-parse"
import {
  saveSource,
  listSourcesForUser,
  type WorkspaceSourceType,
  type WorkspaceSourceOrigin,
  type WorkspaceSourceRecord,
} from "@/app/api/workspaces/store"
import {
  extractDocxText,
  extractPptxText,
  extractXlsxText,
} from "@/app/api/workspaces/ingest/extractors"
import { embedTexts, embeddingsEnabled } from "@/app/api/workspaces/retrieval"

export interface IngestBufferInput {
  /** Authenticated caller (used to namespace the sourceId). */
  userId: string
  /** Workspace this file belongs to (UUID). */
  workspaceId?: string | null
  /** Stable id from the caller — usually `${connectorSlug}:${remoteFileId}` for connectors. */
  clientSourceId: string
  /** Display name (filename). */
  name: string
  /** Raw file bytes. */
  buffer: Buffer
  /** Provenance — connector workers always pass "connector". */
  origin: WorkspaceSourceOrigin
  /** Connector slug when origin === "connector". */
  connectorSlug?: string | null
  /**
   * When true (default), skip ingestion if a source with the same sha256 hash
   * already exists in the same workspace + connector. Returns `{ deduped: true }`
   * with the existing record so the caller can update "last seen" without
   * creating a duplicate Sources-tab row. The connector sync worker relies on
   * this.
   */
  dedupe?: boolean
}

export interface IngestBufferResult {
  ok: boolean
  /** Server-issued, namespaced source id (`userId:clientSourceId`). */
  sourceId: string
  type?: WorkspaceSourceType
  chunkCount: number
  byteSize: number
  hash: string
  /** "1.2 MB" / "640 KB" — pre-formatted for the Sources tab. */
  size: string
  ingestedAt: string
  /** When true, ingest was skipped because the same hash already exists. */
  deduped?: boolean
  /** Existing record returned when `deduped === true`. */
  existing?: WorkspaceSourceRecord
  error?: string
}

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB — bumped slightly for CIM PDFs

function normaliseText(text: string, maxLength = 200_000): string {
  return text
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}

function chunkText(text: string, size = 800, overlap = 100): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    chunks.push(text.slice(i, i + size))
    i += size - overlap
  }
  return chunks.filter((c) => c.trim().length > 50)
}

async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string> {
  try {
    const parsed = await pdfParse(buffer)
    return normaliseText(parsed.text || "")
  } catch {
    return ""
  }
}

export function detectSourceType(name: string): WorkspaceSourceType | null {
  const ext = (name.split(".").pop() || "").toLowerCase()
  switch (ext) {
    case "pdf": return "pdf"
    case "docx": return "docx"
    case "xlsx":
    case "xls": return "xlsx"
    case "pptx":
    case "ppt": return "pptx"
    case "txt":
    case "md":
    case "csv":
    case "log": return "txt"
    default: return null
  }
}

function formatSize(byteSize: number): string {
  return byteSize > 1024 * 1024
    ? `${(byteSize / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(byteSize / 1024))} KB`
}

/**
 * Ingest a raw byte buffer into the workspace sources store.
 *
 * Returns `{ ok: false, error }` on every recoverable failure (oversize,
 * unknown type, no extractable text). The connector sync worker treats every
 * failure here as a per-file skip and keeps walking the rest of the folder.
 */
export async function ingestBufferAsSource(input: IngestBufferInput): Promise<IngestBufferResult> {
  const { userId, workspaceId, clientSourceId, name, buffer, origin, connectorSlug } = input
  const dedupe = input.dedupe ?? true

  const sourceId = `${userId}:${clientSourceId}`
  const byteSize = buffer.byteLength
  const ingestedAt = new Date().toISOString()

  if (byteSize === 0) {
    return { ok: false, sourceId, chunkCount: 0, byteSize: 0, hash: "", size: "0 KB", ingestedAt, error: "empty_file" }
  }
  if (byteSize > MAX_BYTES) {
    return {
      ok: false,
      sourceId,
      chunkCount: 0,
      byteSize,
      hash: "",
      size: formatSize(byteSize),
      ingestedAt,
      error: `file_too_large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)`,
    }
  }

  const type = detectSourceType(name)
  if (!type) {
    return { ok: false, sourceId, chunkCount: 0, byteSize, hash: "", size: formatSize(byteSize), ingestedAt, error: "unsupported_type" }
  }

  const hash = createHash("sha256").update(buffer).digest("hex")

  if (dedupe && workspaceId) {
    // Skip when a source with the same hash already exists in this workspace
    // for the same connector. We allow re-ingesting the same file *manually*
    // (different connectorSlug) since that's a meaningful user action — but
    // re-running a connector sync should be a no-op for unchanged files.
    const existing = await listSourcesForUser(userId)
    const dup = existing.find(
      (r) =>
        r.hash === hash &&
        r.workspaceId === workspaceId &&
        (origin !== "connector" || r.connectorSlug === connectorSlug),
    )
    if (dup) {
      // Bump `ingestedAt` so the Sources tab reflects the most recent sync
      // touch — keep everything else (including chunks) untouched.
      await saveSource(dup.sourceId, dup.name, dup.type, dup.chunks, {
        workspaceId: dup.workspaceId ?? null,
        byteSize: dup.byteSize ?? null,
        hash: dup.hash ?? null,
        origin: dup.origin ?? null,
        connectorSlug: dup.connectorSlug ?? null,
      })
      return {
        ok: true,
        sourceId: dup.sourceId,
        type: dup.type,
        chunkCount: dup.chunks.length,
        byteSize: dup.byteSize ?? byteSize,
        hash,
        size: formatSize(dup.byteSize ?? byteSize),
        ingestedAt: new Date().toISOString(),
        deduped: true,
        existing: dup,
      }
    }
  }

  let rawText = ""
  switch (type) {
    case "pdf": {
      rawText = await extractPdfTextFromBuffer(buffer)
      if (!rawText) {
        try { rawText = normaliseText(buffer.toString("utf8")) } catch { rawText = "" }
      }
      if (!rawText) rawText = `[File: ${name} — unable to extract readable text from PDF]`
      break
    }
    case "docx":
      rawText = normaliseText(await extractDocxText(buffer))
      if (!rawText) rawText = `[File: ${name} — DOCX contained no extractable text]`
      break
    case "xlsx":
      rawText = normaliseText(await extractXlsxText(buffer))
      if (!rawText) rawText = `[File: ${name} — XLSX contained no extractable text]`
      break
    case "pptx":
      rawText = normaliseText(await extractPptxText(buffer))
      if (!rawText) rawText = `[File: ${name} — PPTX contained no extractable text]`
      break
    case "txt":
      rawText = normaliseText(buffer.toString("utf8"))
      break
    default:
      rawText = ""
  }

  if (!rawText || rawText.length < 20) {
    return {
      ok: false,
      sourceId,
      type,
      chunkCount: 0,
      byteSize,
      hash,
      size: formatSize(byteSize),
      ingestedAt,
      error: "no_text_extracted",
    }
  }

  const chunks = chunkText(rawText)

  // Compute embeddings up-front so chat retrieval can rank by cosine
  // similarity instead of keyword overlap. Best-effort: if the embedding
  // API is unconfigured or the call fails, we still save the chunks
  // (BM25 ranking will pick up the slack) and emit a warning so operators
  // can decide whether to backfill later.
  let embeddings: (number[] | null)[] | null = null
  if (embeddingsEnabled() && chunks.length > 0) {
    try {
      embeddings = await embedTexts(chunks)
    } catch (err) {
      console.warn(
        `[workspaces/ingest] embedding failed for ${sourceId}: ${(err as Error).message}`,
      )
      embeddings = null
    }
  }

  await saveSource(sourceId, name, type, chunks, {
    workspaceId: workspaceId ?? null,
    byteSize,
    hash,
    origin,
    connectorSlug: connectorSlug ?? null,
    embeddings,
  })

  return {
    ok: true,
    sourceId,
    type,
    chunkCount: chunks.length,
    byteSize,
    hash,
    size: formatSize(byteSize),
    ingestedAt,
  }
}
