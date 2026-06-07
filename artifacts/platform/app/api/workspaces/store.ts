import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export type WorkspaceSourceType = "pdf" | "url" | "text" | "sec" | "docx" | "xlsx" | "pptx" | "txt"

/**
 * Provenance of a source — uploaded by the user via the file picker /
 * drag-and-drop, or sync'd from a hosted data-room connector (Datasite,
 * Intralinks, Box, etc).
 */
export type WorkspaceSourceOrigin = "upload" | "connector" | "url"

export interface WorkspaceSourceRecord {
  /** Globally unique id, prefixed with the owning Clerk userId for tenant isolation. */
  sourceId: string
  name: string
  type: WorkspaceSourceType
  chunks: string[]
  /**
   * Optional per-chunk embedding vectors, one entry per `chunks[i]`. Length
   * must match `chunks` when present so chat retrieval can index them by
   * the same `chunkIndex` it ships in citations. `null` slots are allowed
   * for chunks that failed to embed (e.g. transient embedding-API errors)
   * — those chunks fall back to BM25 ranking.
   */
  embeddings?: (number[] | null)[] | null
  /** Optional: which diligence workspace this file belongs to (workspaces.id UUID). */
  workspaceId?: string | null
  /** Byte size of the original file (when known). */
  byteSize?: number | null
  /** Hex SHA-256 over the raw file bytes — supports dedupe + audit. */
  hash?: string | null
  /** "upload" | "connector" | "url". */
  origin?: WorkspaceSourceOrigin | null
  /** Connector slug if origin === "connector". */
  connectorSlug?: string | null
  /** ISO timestamp of last successful ingest. */
  ingestedAt?: string | null
}

interface WorkspaceSourceRow {
  source_id: string
  name: string
  source_type: WorkspaceSourceType
  chunks: unknown
  embeddings?: unknown
  workspace_id?: string | null
  byte_size?: number | null
  hash?: string | null
  origin?: WorkspaceSourceOrigin | null
  connector_slug?: string | null
  ingested_at?: string | null
}

const MEMORY_STORE = new Map<string, WorkspaceSourceRecord>()
const TABLE_NAME = process.env.SUPABASE_WORKSPACE_SOURCES_TABLE || "workspace_sources"

let supabaseClient: SupabaseClient | null = null

function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.finsyt_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL ||
    ""
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.finsyt_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.finsyt_SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.finsyt_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_PUBLISHABLE_KEY ||
    ""

  if (!supabaseUrl || !serviceRoleKey) return null

  supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabaseClient
}

function normaliseChunks(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

/**
 * Defensively parse the per-chunk embeddings column. The value is stored as
 * a JSONB array-of-arrays (or array-with-nulls), but we tolerate junk and
 * coerce to `null` rather than poison retrieval — chat falls back to BM25
 * when an entry is missing or malformed.
 */
function normaliseEmbeddings(value: unknown, expectedLength: number): (number[] | null)[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  const out: (number[] | null)[] = new Array(expectedLength).fill(null)
  for (let i = 0; i < Math.min(value.length, expectedLength); i++) {
    const v = value[i]
    if (Array.isArray(v) && v.length > 0 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      out[i] = v as number[]
    }
  }
  // If everything ended up null, treat the whole field as absent so callers
  // can short-circuit "no vectors available".
  if (out.every((e) => e === null)) return null
  return out
}

function rowToRecord(row: WorkspaceSourceRow): WorkspaceSourceRecord {
  const chunks = normaliseChunks(row.chunks)
  return {
    sourceId: row.source_id,
    name: row.name,
    type: row.source_type,
    chunks,
    embeddings: normaliseEmbeddings(row.embeddings, chunks.length),
    workspaceId: row.workspace_id ?? null,
    byteSize: row.byte_size ?? null,
    hash: row.hash ?? null,
    origin: row.origin ?? null,
    connectorSlug: row.connector_slug ?? null,
    ingestedAt: row.ingested_at ?? null,
  }
}

const SOURCE_COLUMNS_WITH_EMBEDDINGS =
  "source_id,name,source_type,chunks,embeddings,workspace_id,byte_size,hash,origin,connector_slug,ingested_at"
const SOURCE_COLUMNS_WITHOUT_EMBEDDINGS =
  "source_id,name,source_type,chunks,workspace_id,byte_size,hash,origin,connector_slug,ingested_at"

/**
 * Cached signal: does the live `workspace_sources` table have an
 * `embeddings` column? We probe lazily on the first call and cache the
 * answer for the lifetime of the process, so projects whose Supabase has
 * not yet been ALTERed still work — embeddings are simply skipped and
 * BM25 ranking takes over. The cache is intentionally never invalidated;
 * a rolling deploy is the natural way to pick up the new column.
 */
let embeddingsColumnAvailable: boolean | null = null

function noteEmbeddingsColumnState(error: { code?: string; message?: string } | null | undefined, fallback: boolean): boolean {
  if (!error) {
    embeddingsColumnAvailable = true
    return true
  }
  // Postgres error 42703 = undefined_column. PostgREST surfaces it via
  // `code` and via a textual hint in `message`.
  const msg = (error.message ?? "").toLowerCase()
  if (error.code === "42703" || msg.includes("embeddings") && (msg.includes("does not exist") || msg.includes("column"))) {
    embeddingsColumnAvailable = false
    return false
  }
  return fallback
}

export async function upsertWorkspaceSource(record: WorkspaceSourceRecord): Promise<"supabase" | "memory"> {
  const ingestedAt = record.ingestedAt ?? new Date().toISOString()
  const enriched: WorkspaceSourceRecord = { ...record, ingestedAt }
  MEMORY_STORE.set(enriched.sourceId, enriched)
  const client = getSupabaseClient()
  if (!client) return "memory"

  // Build the row payload twice — once with embeddings and once without —
  // so that on the first deploy after this change (where the `embeddings`
  // column may not yet exist in Supabase) we can transparently retry the
  // write without it. Once Supabase has the column, the retry path is
  // never taken.
  const baseRow = {
    source_id: enriched.sourceId,
    name: enriched.name,
    source_type: enriched.type,
    chunks: enriched.chunks,
    workspace_id: enriched.workspaceId ?? null,
    byte_size: enriched.byteSize ?? null,
    hash: enriched.hash ?? null,
    origin: enriched.origin ?? null,
    connector_slug: enriched.connectorSlug ?? null,
    ingested_at: ingestedAt,
    updated_at: ingestedAt,
  } as Record<string, unknown>

  const includeEmbeddings = embeddingsColumnAvailable !== false && enriched.embeddings != null
  const row = includeEmbeddings ? { ...baseRow, embeddings: enriched.embeddings } : baseRow

  const { error } = await client.from(TABLE_NAME).upsert(row, { onConflict: "source_id" })

  if (error) {
    if (includeEmbeddings && noteEmbeddingsColumnState(error, true) === false) {
      const { error: retryErr } = await client.from(TABLE_NAME).upsert(baseRow, { onConflict: "source_id" })
      if (!retryErr) return "supabase"
      console.error(`[workspaces/store] Supabase upsert (no-embeddings retry) failed: ${retryErr.message}`)
      return "memory"
    }
    console.error(`[workspaces/store] Supabase upsert failed, falling back to memory: ${error.message}`)
    return "memory"
  }
  if (includeEmbeddings) embeddingsColumnAvailable = true
  return "supabase"
}

/**
 * Replace just the per-chunk embeddings on an existing row. Used by the
 * backfill script (`scripts/src/backfill-workspace-embeddings.ts`) and
 * by ingest when it computes embeddings after the initial chunk save.
 */
export async function updateWorkspaceSourceEmbeddings(
  sourceId: string,
  embeddings: (number[] | null)[],
): Promise<"supabase" | "memory" | "skipped"> {
  const memoryRecord = MEMORY_STORE.get(sourceId)
  if (memoryRecord) {
    MEMORY_STORE.set(sourceId, { ...memoryRecord, embeddings })
  }
  const client = getSupabaseClient()
  if (!client) return memoryRecord ? "memory" : "skipped"
  if (embeddingsColumnAvailable === false) return memoryRecord ? "memory" : "skipped"

  const { error } = await client.from(TABLE_NAME).update({ embeddings }).eq("source_id", sourceId)
  if (error) {
    if (noteEmbeddingsColumnState(error, true) === false) {
      // Column missing — silently skip. Retrieval still works (BM25-only).
      return memoryRecord ? "memory" : "skipped"
    }
    console.error(`[workspaces/store] Supabase embeddings update failed: ${error.message}`)
    return memoryRecord ? "memory" : "skipped"
  }
  embeddingsColumnAvailable = true
  return "supabase"
}

export async function getWorkspaceSources(sourceIds: string[]): Promise<Map<string, WorkspaceSourceRecord>> {
  const ids = sourceIds.filter(Boolean)
  const records = new Map<string, WorkspaceSourceRecord>()

  if (ids.length === 0) return records

  const client = getSupabaseClient()
  if (client) {
    const cols = embeddingsColumnAvailable === false
      ? SOURCE_COLUMNS_WITHOUT_EMBEDDINGS
      : SOURCE_COLUMNS_WITH_EMBEDDINGS
    let { data, error } = await client.from(TABLE_NAME).select(cols).in("source_id", ids)

    if (error && noteEmbeddingsColumnState(error, false) === false) {
      const retry = await client.from(TABLE_NAME).select(SOURCE_COLUMNS_WITHOUT_EMBEDDINGS).in("source_id", ids)
      data = retry.data
      error = retry.error
    }

    if (!error && data) {
      for (const row of data as WorkspaceSourceRow[]) {
        const record = rowToRecord(row)
        records.set(record.sourceId, record)
      }
    } else if (error) {
      console.error(`[workspaces/store] Supabase read failed, using memory fallback: ${error.message}`)
    }
  }

  for (const id of ids) {
    if (!records.has(id)) {
      const memoryRecord = MEMORY_STORE.get(id)
      if (memoryRecord) records.set(id, memoryRecord)
    }
  }

  return records
}

/**
 * Resolve the *authoritative* set of source ids the caller is allowed to
 * read inside a specific workspace. Intersects the (userId, workspaceId)
 * pair against the caller-supplied list — any id outside the intersection
 * is silently dropped, even if the user owns it.
 *
 * This is the workspace-isolation gate enforced by chat/studio retrieval:
 * a same-tenant caller cannot smuggle a sourceId from workspace B into a
 * workspace-A request, because the row's `workspace_id` won't match.
 *
 * Pass `requestedSourceIds = null` to mean "every source you're allowed to
 * see in this workspace" — used by the studio surface where the client
 * intentionally wants the entire workspace context.
 */
export async function resolveAuthorizedSourceIds(
  userId: string,
  workspaceId: string | null,
  requestedSourceIds: readonly string[] | null,
): Promise<string[]> {
  if (!userId) return []
  const all = await listSourcesForUser(userId)
  // When a workspaceId is supplied we MUST intersect by it. When null, only
  // return sources that are themselves unscoped (workspaceId === null). Never
  // fall back to "every source the user has ever uploaded" — that would
  // expose workspace-scoped sources from a previous or different org to any
  // request that omits the workspaceId parameter.
  const allowed = workspaceId
    ? all.filter((r) => r.workspaceId === workspaceId)
    : all.filter((r) => r.workspaceId === null || r.workspaceId === undefined)
  const allowedIds = new Set(allowed.map((r) => r.sourceId))
  if (requestedSourceIds === null) return Array.from(allowedIds)
  const requested = new Set(
    requestedSourceIds.filter((id): id is string => typeof id === "string"),
  )
  const out: string[] = []
  for (const id of requested) if (allowedIds.has(id)) out.push(id)
  return out
}

/**
 * List every source belonging to a single user. Used by the diligence
 * "Sources" tab. Filtering is by the `userId:` prefix on `source_id` so a
 * caller can never accidentally enumerate another tenant's files.
 */
export async function listSourcesForUser(userId: string): Promise<WorkspaceSourceRecord[]> {
  if (!userId) return []
  const prefix = `${userId}:`
  const records: WorkspaceSourceRecord[] = []

  const client = getSupabaseClient()
  if (client) {
    const cols = embeddingsColumnAvailable === false
      ? SOURCE_COLUMNS_WITHOUT_EMBEDDINGS
      : SOURCE_COLUMNS_WITH_EMBEDDINGS
    let { data, error } = await client
      .from(TABLE_NAME)
      .select(cols)
      .like("source_id", `${prefix}%`)
      .order("ingested_at", { ascending: false })
      .limit(500)
    if (error && noteEmbeddingsColumnState(error, false) === false) {
      const retry = await client
        .from(TABLE_NAME)
        .select(SOURCE_COLUMNS_WITHOUT_EMBEDDINGS)
        .like("source_id", `${prefix}%`)
        .order("ingested_at", { ascending: false })
        .limit(500)
      data = retry.data
      error = retry.error
    }
    if (!error && data) {
      for (const row of data as WorkspaceSourceRow[]) records.push(rowToRecord(row))
    } else if (error) {
      console.error(`[workspaces/store] Supabase list failed, using memory: ${error.message}`)
    }
  }

  if (records.length === 0) {
    for (const r of MEMORY_STORE.values()) {
      if (r.sourceId.startsWith(prefix)) records.push(r)
    }
    records.sort((a, b) => (b.ingestedAt ?? "").localeCompare(a.ingestedAt ?? ""))
  }

  return records
}

/**
 * Delete a single source. The caller MUST pass the requesting userId so the
 * helper can refuse cross-tenant deletes — sourceIds are user-prefixed and a
 * delete request with a mismatched prefix is rejected before touching the DB.
 */
export async function deleteSource(userId: string, sourceId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!userId || !sourceId) return { ok: false, reason: "missing_args" }
  if (!sourceId.startsWith(`${userId}:`)) return { ok: false, reason: "forbidden" }
  MEMORY_STORE.delete(sourceId)
  const client = getSupabaseClient()
  if (client) {
    const { error } = await client.from(TABLE_NAME).delete().eq("source_id", sourceId)
    if (error) {
      console.error(`[workspaces/store] Supabase delete failed: ${error.message}`)
      return { ok: false, reason: error.message }
    }
  }
  return { ok: true }
}

export async function saveSource(
  sourceId: string,
  name: string,
  type: WorkspaceSourceType,
  chunks: string[],
  meta?: {
    workspaceId?: string | null
    byteSize?: number | null
    hash?: string | null
    origin?: WorkspaceSourceOrigin | null
    connectorSlug?: string | null
    /** Optional per-chunk vectors. Length must match `chunks` when provided. */
    embeddings?: (number[] | null)[] | null
  },
): Promise<void> {
  await upsertWorkspaceSource({
    sourceId,
    name,
    type,
    chunks,
    embeddings: meta?.embeddings ?? null,
    workspaceId: meta?.workspaceId ?? null,
    byteSize: meta?.byteSize ?? null,
    hash: meta?.hash ?? null,
    origin: meta?.origin ?? null,
    connectorSlug: meta?.connectorSlug ?? null,
  })
}

export async function getManySources(sourceIds: string[]): Promise<Map<string, WorkspaceSourceRecord>> {
  return getWorkspaceSources(sourceIds)
}

export async function getSourcesWithChunks(sourceIds: string[]): Promise<WorkspaceSourceRecord[]> {
  return Array.from((await getWorkspaceSources(sourceIds)).values())
}

/** Test-only helper. Wipes the in-memory cache. Never call from production code. */
export function __resetMemoryStoreForTests(): void {
  MEMORY_STORE.clear()
}
