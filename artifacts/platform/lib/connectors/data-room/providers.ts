/**
 * Data-room provider adapters.
 * ────────────────────────────
 * Per-provider implementations of the two operations the sync worker needs:
 *
 *   - `listFolder(folderId)` → an array of folder/file entries
 *   - `downloadFile(fileId)` → a `Buffer` of the file body
 *
 * Each adapter receives the decrypted credential bag for the user's connection
 * (loaded via `loadConnection({ withCredentials: true })`) so it can issue
 * calls under the user's own permissions — never a global service account.
 *
 * The adapters also expose a `defaultRootFolderId(creds)` helper so the UI
 * can prefill a sensible root when the user hasn't pasted a folder id.
 */
import { assertSafeUrl, UrlSafetyError } from "../url-safety"

export type DataRoomProviderSlug = "datasite" | "intralinks" | "securedocs" | "box" | "dropbox"

export interface DataRoomEntry {
  /** Provider-specific id used by `downloadFile` / `listFolder`. */
  id: string
  /** Display name. Folders end in "/" by convention from some providers; we don't normalise. */
  name: string
  kind: "file" | "folder"
  /** Raw byte size when the provider exposes it. */
  sizeBytes?: number
  /** ISO timestamp of last modification on the provider. */
  modifiedAt?: string
  /** Optional MIME hint from the provider (used as a fallback when the filename has no extension). */
  mimeType?: string
}

export interface DataRoomDownload {
  buffer: Buffer
  /** Final filename after redirects / disposition. */
  name: string
  mimeType?: string
}

export interface DataRoomAdapter {
  slug: DataRoomProviderSlug
  /** Friendly label for the UI. */
  label: string
  /** Suggested starting folder id when the user hasn't picked one. */
  defaultRootFolderId(creds: Record<string, string>): string
  /** Whether `defaultRootFolderId` requires a value the user must paste (e.g. data-room UUID). */
  rootFolderHint(creds: Record<string, string>): { ok: boolean; message?: string }
  listFolder(creds: Record<string, string>, folderId: string): Promise<DataRoomEntry[]>
  downloadFile(creds: Record<string, string>, fileId: string): Promise<DataRoomDownload>
}

const DEFAULT_TIMEOUT_MS = 25_000
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024 // mirror the ingest-helper cap

async function safeFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  // SSRF guard — re-validates DNS on every call so a hostname that resolved
  // public at connect-time can't be flipped to an internal IP later.
  try { await assertSafeUrl(url, "rest") } catch (err) {
    if (err instanceof UrlSafetyError) throw err
    throw err
  }
  const ctrl = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  try { return text ? JSON.parse(text) : null } catch { return { raw: text } }
}

async function readBufferCapped(res: Response, max = MAX_DOWNLOAD_BYTES): Promise<Buffer> {
  const ab = await res.arrayBuffer()
  if (ab.byteLength > max) {
    throw new Error(`file_too_large (received ${ab.byteLength} bytes, max ${max})`)
  }
  return Buffer.from(ab)
}

// ── Box ──────────────────────────────────────────────────────────────────────
// https://developer.box.com/reference/get-folders-id-items/
// The user's OAuth token is in `creds.access_token`; "0" is the special root
// folder id ("All Files") in Box.
const boxAdapter: DataRoomAdapter = {
  slug: "box",
  label: "Box",
  defaultRootFolderId: () => "0",
  rootFolderHint: () => ({ ok: true }),
  async listFolder(creds, folderId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("Box: missing access_token")
    const id = folderId || "0"
    const url = `https://api.box.com/2.0/folders/${encodeURIComponent(id)}/items?fields=id,name,type,size,modified_at&limit=200`
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
    if (!res.ok) throw new Error(`Box list failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as { entries?: Array<{ id: string; name: string; type: string; size?: number; modified_at?: string }> }
    return (json.entries || []).map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.type === "folder" ? "folder" : "file",
      sizeBytes: e.size,
      modifiedAt: e.modified_at,
    }))
  },
  async downloadFile(creds, fileId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("Box: missing access_token")
    const metaRes = await safeFetch(
      `https://api.box.com/2.0/files/${encodeURIComponent(fileId)}?fields=name,size`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    )
    const meta = (await readJson(metaRes)) as { name?: string; size?: number }
    const name = meta?.name || `box-${fileId}`
    const dl = await safeFetch(
      `https://api.box.com/2.0/files/${encodeURIComponent(fileId)}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!dl.ok) throw new Error(`Box download failed: HTTP ${dl.status}`)
    const buffer = await readBufferCapped(dl)
    return { buffer, name }
  },
}

// ── Dropbox ─────────────────────────────────────────────────────────────────
// https://www.dropbox.com/developers/documentation/http/documentation
// Folder ids in Dropbox are *paths* (root = ""). We accept either a path
// (starts with "/") or "" for the user's root.
const dropboxAdapter: DataRoomAdapter = {
  slug: "dropbox",
  label: "Dropbox",
  defaultRootFolderId: () => "",
  rootFolderHint: () => ({ ok: true }),
  async listFolder(creds, folderId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("Dropbox: missing access_token")
    const path = folderId === "/" ? "" : folderId
    const res = await safeFetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ path, recursive: false, include_non_downloadable_files: false }),
    })
    if (!res.ok) throw new Error(`Dropbox list failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as {
      entries?: Array<{ ".tag": string; id: string; name: string; path_lower?: string; size?: number; server_modified?: string }>
    }
    return (json.entries || []).map((e) => ({
      // Dropbox lets us address a file by `id` (an `id:…` string). We prefer
      // the path so the picker UI can show a stable breadcrumb, but for files
      // we fall back to the id which survives renames.
      id: e[".tag"] === "folder" ? (e.path_lower || e.id) : e.id,
      name: e.name,
      kind: e[".tag"] === "folder" ? "folder" : "file",
      sizeBytes: e.size,
      modifiedAt: e.server_modified,
    }))
  },
  async downloadFile(creds, fileId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("Dropbox: missing access_token")
    const res = await safeFetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path: fileId }),
      },
    })
    if (!res.ok) throw new Error(`Dropbox download failed: HTTP ${res.status}`)
    const apiResultRaw = res.headers.get("dropbox-api-result")
    let name = `dropbox-${fileId}`
    if (apiResultRaw) {
      try {
        const meta = JSON.parse(apiResultRaw) as { name?: string }
        if (meta?.name) name = meta.name
      } catch { /* keep fallback */ }
    }
    const buffer = await readBufferCapped(res)
    return { buffer, name }
  },
}

// ── SecureDocs ──────────────────────────────────────────────────────────────
// SecureDocs' developer portal documents an `X-API-Key`-keyed REST surface at
// https://api.securedocs.com/v1/data-rooms/{id}/folders. The schema differs per
// account (legacy v1 vs current v2) — we code against the documented v1 shape
// with defensive fallbacks.
const secureDocsAdapter: DataRoomAdapter = {
  slug: "securedocs",
  label: "SecureDocs",
  defaultRootFolderId(creds) {
    return creds.data_room_id ? `room:${creds.data_room_id}:/` : ""
  },
  rootFolderHint(creds) {
    if (!creds.data_room_id) {
      return { ok: false, message: "SecureDocs requires the data-room id (saved on the connection's credentials)." }
    }
    return { ok: true }
  },
  async listFolder(creds, folderId) {
    const apiKey = creds.api_key || creds.apiKey
    const dataRoomId = creds.data_room_id
    if (!apiKey || !dataRoomId) throw new Error("SecureDocs: missing api_key or data_room_id")
    // folderId format: "room:<id>:<path>" — keeps the picker addressable
    const path = folderId.startsWith(`room:${dataRoomId}:`) ? folderId.slice(`room:${dataRoomId}:`.length) || "/" : "/"
    const url = `https://api.securedocs.com/v1/data-rooms/${encodeURIComponent(dataRoomId)}/items?path=${encodeURIComponent(path)}`
    const res = await safeFetch(url, { headers: { "X-API-Key": apiKey, Accept: "application/json" } })
    if (!res.ok) throw new Error(`SecureDocs list failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as { items?: Array<{ id: string; name: string; type: string; size?: number; modified_at?: string; path?: string }> }
    return (json.items || []).map((e) => ({
      id: e.type === "folder" ? `room:${dataRoomId}:${e.path || `/${e.name}`}` : e.id,
      name: e.name,
      kind: e.type === "folder" ? "folder" : "file",
      sizeBytes: e.size,
      modifiedAt: e.modified_at,
    }))
  },
  async downloadFile(creds, fileId) {
    const apiKey = creds.api_key || creds.apiKey
    const dataRoomId = creds.data_room_id
    if (!apiKey || !dataRoomId) throw new Error("SecureDocs: missing api_key or data_room_id")
    const url = `https://api.securedocs.com/v1/data-rooms/${encodeURIComponent(dataRoomId)}/files/${encodeURIComponent(fileId)}/download`
    const res = await safeFetch(url, { headers: { "X-API-Key": apiKey } })
    if (!res.ok) throw new Error(`SecureDocs download failed: HTTP ${res.status}`)
    const dispo = res.headers.get("content-disposition") || ""
    const m = /filename\*?=(?:UTF-\d+''|")?([^";]+)"?/i.exec(dispo)
    const name = m?.[1] ? decodeURIComponent(m[1]) : `securedocs-${fileId}`
    const buffer = await readBufferCapped(res)
    return { buffer, name }
  },
}

// ── Datasite ────────────────────────────────────────────────────────────────
// Datasite's API (formerly Merrill DealCenter) lives at
// https://api.datasite.com/v1/dataRooms/{id}/folders/{folderId}/items. Their
// docs are gated behind NDA so we code defensively against the published
// fields — the adapter still works for partners who can mint a bearer token.
const datasiteAdapter: DataRoomAdapter = {
  slug: "datasite",
  label: "Datasite",
  defaultRootFolderId(creds) {
    return creds.data_room_id ? `${creds.data_room_id}:root` : ""
  },
  rootFolderHint(creds) {
    if (!creds.data_room_id) {
      return { ok: false, message: "Datasite requires the data-room id (saved on the connection's credentials)." }
    }
    return { ok: true }
  },
  async listFolder(creds, folderId) {
    const token = creds.access_token || creds.accessToken
    const dataRoomId = creds.data_room_id
    if (!token || !dataRoomId) throw new Error("Datasite: missing access_token or data_room_id")
    const folder = folderId.startsWith(`${dataRoomId}:`) ? folderId.slice(`${dataRoomId}:`.length) : "root"
    const url = `https://api.datasite.com/v1/dataRooms/${encodeURIComponent(dataRoomId)}/folders/${encodeURIComponent(folder)}/items?limit=200`
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
    if (!res.ok) throw new Error(`Datasite list failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as { items?: Array<{ id: string; name: string; type?: string; size?: number; updatedAt?: string }> }
    return (json.items || []).map((e) => ({
      id: e.type === "folder" ? `${dataRoomId}:${e.id}` : e.id,
      name: e.name,
      kind: e.type === "folder" ? "folder" : "file",
      sizeBytes: e.size,
      modifiedAt: e.updatedAt,
    }))
  },
  async downloadFile(creds, fileId) {
    const token = creds.access_token || creds.accessToken
    const dataRoomId = creds.data_room_id
    if (!token || !dataRoomId) throw new Error("Datasite: missing access_token or data_room_id")
    const url = `https://api.datasite.com/v1/dataRooms/${encodeURIComponent(dataRoomId)}/files/${encodeURIComponent(fileId)}/content`
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Datasite download failed: HTTP ${res.status}`)
    const dispo = res.headers.get("content-disposition") || ""
    const m = /filename\*?=(?:UTF-\d+''|")?([^";]+)"?/i.exec(dispo)
    const name = m?.[1] ? decodeURIComponent(m[1]) : `datasite-${fileId}`
    const buffer = await readBufferCapped(res)
    return { buffer, name }
  },
}

// ── Intralinks ──────────────────────────────────────────────────────────────
// SS&C Intralinks IMO partner API. Documented at
// https://developer.intralinks.com/ — workspace-scoped folder + file calls.
const intralinksAdapter: DataRoomAdapter = {
  slug: "intralinks",
  label: "Intralinks",
  defaultRootFolderId(creds) {
    return creds.workspace_id ? `${creds.workspace_id}:0` : ""
  },
  rootFolderHint(creds) {
    if (!creds.workspace_id) {
      return { ok: false, message: "Intralinks requires the deal-room workspace id (saved on the connection's credentials)." }
    }
    return { ok: true }
  },
  async listFolder(creds, folderId) {
    const token = creds.access_token || creds.accessToken
    const workspaceId = creds.workspace_id
    if (!token || !workspaceId) throw new Error("Intralinks: missing access_token or workspace_id")
    const folder = folderId.startsWith(`${workspaceId}:`) ? folderId.slice(`${workspaceId}:`.length) : "0"
    const url = `https://api.intralinks.com/services/workspaces/${encodeURIComponent(workspaceId)}/folders/${encodeURIComponent(folder)}/items?limit=200`
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
    if (!res.ok) throw new Error(`Intralinks list failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as { items?: Array<{ id: string; name: string; type?: string; size?: number; lastModified?: string }> }
    return (json.items || []).map((e) => ({
      id: e.type === "FOLDER" || e.type === "folder" ? `${workspaceId}:${e.id}` : e.id,
      name: e.name,
      kind: e.type === "FOLDER" || e.type === "folder" ? "folder" : "file",
      sizeBytes: e.size,
      modifiedAt: e.lastModified,
    }))
  },
  async downloadFile(creds, fileId) {
    const token = creds.access_token || creds.accessToken
    const workspaceId = creds.workspace_id
    if (!token || !workspaceId) throw new Error("Intralinks: missing access_token or workspace_id")
    const url = `https://api.intralinks.com/services/workspaces/${encodeURIComponent(workspaceId)}/documents/${encodeURIComponent(fileId)}/content`
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) throw new Error(`Intralinks download failed: HTTP ${res.status}`)
    const dispo = res.headers.get("content-disposition") || ""
    const m = /filename\*?=(?:UTF-\d+''|")?([^";]+)"?/i.exec(dispo)
    const name = m?.[1] ? decodeURIComponent(m[1]) : `intralinks-${fileId}`
    const buffer = await readBufferCapped(res)
    return { buffer, name }
  },
}

// ── Registry ────────────────────────────────────────────────────────────────
const REGISTRY: Record<DataRoomProviderSlug, DataRoomAdapter> = {
  box: boxAdapter,
  dropbox: dropboxAdapter,
  securedocs: secureDocsAdapter,
  datasite: datasiteAdapter,
  intralinks: intralinksAdapter,
}

export function getDataRoomAdapter(slug: string): DataRoomAdapter | null {
  return (REGISTRY as Record<string, DataRoomAdapter>)[slug] || null
}

export function listDataRoomSlugs(): DataRoomProviderSlug[] {
  return Object.keys(REGISTRY) as DataRoomProviderSlug[]
}
