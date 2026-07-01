/**
 * Data-room sync orchestrator.
 * ───────────────────────────
 * Walks a remote folder using a provider adapter and drops every file it
 * encounters into the workspace via the shared `ingestBufferAsSource` helper.
 * Returns a per-file result list so the UI can show "imported N, deduped M,
 * skipped K".
 *
 * Permission model
 *   We re-load the connection inside the user's org context (RLS) and pass
 *   the decrypted credential bag straight to the adapter. The adapter's HTTP
 *   calls use *that user's* OAuth token / API key — never a global service
 *   account. If the user's token has a smaller permission scope than the
 *   admin who originally connected the data room, every list/download call
 *   will get a 401/403 from the upstream and the file will be reported as
 *   `skipped: permission_denied` instead of silently fetched.
 */
import { loadConnection } from "../accessor"
import { getDataRoomAdapter, type DataRoomEntry } from "./providers"
import {
  ingestBufferAsSource,
  detectSourceType,
  type IngestBufferResult,
} from "@/lib/workspaces/ingest-helper"

export interface SyncFolderInput {
  /** Local org UUID (already resolved from the Clerk org). */
  orgId: string
  /** Connection row id (must belong to `orgId`). */
  connectionId: string
  /** Catalog slug of the data-room provider. */
  connectorSlug: string
  /** Workspace UUID this sync is running inside. */
  workspaceId: string
  /** Folder id in the provider's namespace; null/empty falls back to the adapter default. */
  folderId: string | null
  /** Authenticated Clerk user id (used to namespace source ids and audit reads). */
  userId: string
  /** When true, recurse into subfolders (capped to `MAX_FILES`). */
  recursive?: boolean
}

export interface SyncFileResult {
  /** Provider's file id. */
  remoteId: string
  /** Display name from the provider. */
  name: string
  /** "imported" — text was ingested; "deduped" — same hash already in workspace; "skipped" — extension/size etc; "failed" — adapter or extraction error. */
  status: "imported" | "deduped" | "skipped" | "failed"
  /** Server-issued source id. Only set when status is imported / deduped. */
  sourceId?: string
  byteSize?: number
  hash?: string
  reason?: string
}

export interface SyncFolderResult {
  ok: boolean
  /** When false, the orchestrator never ran a single download (auth / picker error). */
  fatalError?: string
  imported: number
  deduped: number
  skipped: number
  failed: number
  files: SyncFileResult[]
  walkedFolders: number
}

const MAX_FILES = 200
const MAX_FOLDERS = 50

export async function syncDataRoomFolder(input: SyncFolderInput): Promise<SyncFolderResult> {
  const adapter = getDataRoomAdapter(input.connectorSlug)
  if (!adapter) {
    return {
      ok: false,
      fatalError: `Unknown data-room provider '${input.connectorSlug}'`,
      imported: 0, deduped: 0, skipped: 0, failed: 0, files: [], walkedFolders: 0,
    }
  }

  // Load the connection (with credentials) under org RLS. `loadConnection`
  // also writes a `credential.read` audit row — that's intentional, the
  // sync picker is exactly the kind of action we want auditors to be able
  // to trace.
  const loaded = await loadConnection(input.orgId, input.connectionId, {
    withCredentials: true,
    actorId: input.userId,
  })
  if (!loaded) {
    return {
      ok: false,
      fatalError: "Connection not found in this workspace",
      imported: 0, deduped: 0, skipped: 0, failed: 0, files: [], walkedFolders: 0,
    }
  }
  if (loaded.connection.status === "disabled") {
    return {
      ok: false,
      fatalError: "Connection is disabled",
      imported: 0, deduped: 0, skipped: 0, failed: 0, files: [], walkedFolders: 0,
    }
  }
  const creds = loaded.credentials || {}

  const startFolder = input.folderId && input.folderId.length > 0
    ? input.folderId
    : adapter.defaultRootFolderId(creds)

  const hint = adapter.rootFolderHint(creds)
  if (!hint.ok && !input.folderId) {
    return {
      ok: false,
      fatalError: hint.message ?? "Provider requires a folder id",
      imported: 0, deduped: 0, skipped: 0, failed: 0, files: [], walkedFolders: 0,
    }
  }

  const queue: string[] = [startFolder]
  const seenFolders = new Set<string>()
  const files: SyncFileResult[] = []
  let imported = 0, deduped = 0, skipped = 0, failed = 0
  let walkedFolders = 0

  while (queue.length > 0 && files.length < MAX_FILES && walkedFolders < MAX_FOLDERS) {
    const folder = queue.shift()!
    if (seenFolders.has(folder)) continue
    seenFolders.add(folder)
    walkedFolders += 1

    let entries: DataRoomEntry[]
    try {
      entries = await adapter.listFolder(creds, folder)
    } catch (err) {
      failed += 1
      files.push({
        remoteId: folder,
        name: `(folder ${folder})`,
        status: "failed",
        reason: (err as Error).message || "list_failed",
      })
      continue
    }

    for (const entry of entries) {
      if (entry.kind === "folder") {
        if (input.recursive ?? true) queue.push(entry.id)
        continue
      }
      if (files.length >= MAX_FILES) break

      // Skip unsupported extensions before paying the download cost.
      if (!detectSourceType(entry.name)) {
        skipped += 1
        files.push({ remoteId: entry.id, name: entry.name, status: "skipped", reason: "unsupported_extension" })
        continue
      }

      let downloaded
      try {
        downloaded = await adapter.downloadFile(creds, entry.id)
      } catch (err) {
        failed += 1
        files.push({ remoteId: entry.id, name: entry.name, status: "failed", reason: (err as Error).message || "download_failed" })
        continue
      }

      // Use a deterministic clientSourceId so a re-sync targets the same row
      // when dedupe matches. `${slug}:${remoteId}` is stable across runs.
      const clientSourceId = `${input.connectorSlug}:${entry.id}`
      let result: IngestBufferResult
      try {
        result = await ingestBufferAsSource({
          userId: input.userId,
          workspaceId: input.workspaceId,
          clientSourceId,
          name: downloaded.name || entry.name,
          buffer: downloaded.buffer,
          origin: "connector",
          connectorSlug: input.connectorSlug,
          dedupe: true,
        })
      } catch (err) {
        failed += 1
        files.push({ remoteId: entry.id, name: entry.name, status: "failed", reason: (err as Error).message || "ingest_failed" })
        continue
      }

      if (!result.ok) {
        failed += 1
        files.push({
          remoteId: entry.id, name: entry.name, status: "failed",
          reason: result.error ?? "ingest_failed",
          byteSize: result.byteSize, hash: result.hash,
        })
        continue
      }
      if (result.deduped) {
        deduped += 1
        files.push({
          remoteId: entry.id, name: entry.name, status: "deduped",
          sourceId: result.sourceId, byteSize: result.byteSize, hash: result.hash,
        })
      } else {
        imported += 1
        files.push({
          remoteId: entry.id, name: entry.name, status: "imported",
          sourceId: result.sourceId, byteSize: result.byteSize, hash: result.hash,
        })
      }
    }
  }

  return { ok: true, imported, deduped, skipped, failed, files, walkedFolders }
}
