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

export type DataRoomProviderSlug =
  | "datasite"
  | "intralinks"
  | "securedocs"
  | "box"
  | "dropbox"
  | "sharepoint"
  | "google-drive"
  | "confluence"
  | "notion"

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

// ── Shared helpers for knowledge connectors ──────────────────────────────────
function sanitizeFileName(name: string): string {
  return (name || "untitled").replace(/[/\\:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 180) || "untitled"
}

/** Best-effort HTML → plain text. We ingest the result as a .txt source so the
 *  workspace store treats Confluence pages as searchable documents without a
 *  new source type. */
function stripHtml(html: string): string {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|table)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

interface NotionRich { plain_text?: string }
function notionRichText(rt: NotionRich[] | undefined): string {
  return (rt || []).map((t) => t.plain_text || "").join("")
}

function extractNotionTitle(page: Record<string, unknown>): string {
  const props = (page.properties as Record<string, { type?: string; title?: NotionRich[] }>) || {}
  for (const key of Object.keys(props)) {
    const p = props[key]
    if (p?.type === "title") return notionRichText(p.title) || "Untitled"
  }
  return "Untitled"
}

function notionBlocksToMarkdown(blocks: Array<Record<string, unknown>>): string {
  const lines: string[] = []
  for (const b of blocks) {
    const type = (b.type as string) || ""
    const data = (b[type] as { rich_text?: NotionRich[]; checked?: boolean } | undefined) || undefined
    const text = data?.rich_text ? notionRichText(data.rich_text) : ""
    switch (type) {
      case "heading_1": lines.push(`# ${text}`); break
      case "heading_2": lines.push(`## ${text}`); break
      case "heading_3": lines.push(`### ${text}`); break
      case "bulleted_list_item": lines.push(`- ${text}`); break
      case "numbered_list_item": lines.push(`1. ${text}`); break
      case "to_do": lines.push(`- [${data?.checked ? "x" : " "}] ${text}`); break
      case "quote": lines.push(`> ${text}`); break
      case "code": lines.push("```\n" + text + "\n```"); break
      default: if (text) lines.push(text)
    }
  }
  return lines.join("\n\n")
}

function basicAuthHeader(creds: Record<string, string>): string {
  const user = creds.username || creds.user || ""
  const pass = creds.password || creds.pass || creds.api_token || ""
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`
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

// ── SharePoint / OneDrive (Microsoft Graph) ──────────────────────────────────
// https://learn.microsoft.com/graph/api/resources/onedrive
// The user's OAuth token is in `creds.access_token`. "root" addresses the
// signed-in user's drive root; child folders are addressed by item id.
const sharepointAdapter: DataRoomAdapter = {
  slug: "sharepoint",
  label: "SharePoint / OneDrive",
  defaultRootFolderId: () => "root",
  rootFolderHint: () => ({ ok: true }),
  async listFolder(creds, folderId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("SharePoint: missing access_token")
    const id = folderId || "root"
    const childrenPath = id === "root"
      ? "/me/drive/root/children"
      : `/me/drive/items/${encodeURIComponent(id)}/children`
    const url = `https://graph.microsoft.com/v1.0${childrenPath}?$select=id,name,size,folder,file,lastModifiedDateTime&$top=200`
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
    if (!res.ok) throw new Error(`SharePoint list failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as {
      value?: Array<{ id: string; name: string; size?: number; lastModifiedDateTime?: string; folder?: unknown; file?: { mimeType?: string } }>
    }
    return (json.value || []).map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.folder ? "folder" : "file",
      sizeBytes: e.size,
      modifiedAt: e.lastModifiedDateTime,
      mimeType: e.file?.mimeType,
    }))
  },
  async downloadFile(creds, fileId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("SharePoint: missing access_token")
    const metaRes = await safeFetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}?$select=name`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    )
    const meta = (await readJson(metaRes)) as { name?: string }
    const name = meta?.name || `sharepoint-${fileId}`
    const dl = await safeFetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!dl.ok) throw new Error(`SharePoint download failed: HTTP ${dl.status}`)
    const buffer = await readBufferCapped(dl)
    return { buffer, name }
  },
}

// ── Google Drive ─────────────────────────────────────────────────────────────
// https://developers.google.com/drive/api/reference/rest/v3
// The user's OAuth token is in `creds.access_token`. "root" is the special
// alias for the user's My Drive root. Native Google editor files (Docs /
// Sheets / Slides) have no binary content and must be exported — we export to
// PDF so the ingest pipeline's PDF extractor can read them.
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder"
const googleDriveAdapter: DataRoomAdapter = {
  slug: "google-drive",
  label: "Google Drive",
  defaultRootFolderId: () => "root",
  rootFolderHint: () => ({ ok: true }),
  async listFolder(creds, folderId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("Google Drive: missing access_token")
    const id = folderId || "root"
    const q = `'${id}' in parents and trashed=false`
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
      `&fields=${encodeURIComponent("files(id,name,mimeType,size,modifiedTime)")}` +
      `&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true`
    const res = await safeFetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } })
    if (!res.ok) throw new Error(`Google Drive list failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as {
      files?: Array<{ id: string; name: string; mimeType?: string; size?: string; modifiedTime?: string }>
    }
    return (json.files || []).map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.mimeType === GOOGLE_FOLDER_MIME ? "folder" : "file",
      sizeBytes: e.size ? Number(e.size) : undefined,
      modifiedAt: e.modifiedTime,
      mimeType: e.mimeType,
    }))
  },
  async downloadFile(creds, fileId) {
    const token = creds.access_token || creds.accessToken
    if (!token) throw new Error("Google Drive: missing access_token")
    const metaRes = await safeFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    )
    const meta = (await readJson(metaRes)) as { name?: string; mimeType?: string }
    const baseName = meta?.name || `gdrive-${fileId}`
    const mime = meta?.mimeType || ""
    let url: string
    let name = baseName
    if (mime.startsWith("application/vnd.google-apps")) {
      // Native Google editor file — export to PDF (no binary content otherwise).
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`
      if (!/\.pdf$/i.test(name)) name = `${name}.pdf`
    } else {
      url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`
    }
    const dl = await safeFetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!dl.ok) throw new Error(`Google Drive download failed: HTTP ${dl.status}`)
    const buffer = await readBufferCapped(dl)
    return { buffer, name }
  },
}

// ── Confluence (Atlassian Cloud) ─────────────────────────────────────────────
// https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
// Basic auth: account email + API token. We model spaces as folders and pages
// as files. Page bodies are exported HTML, stripped to plain text and ingested
// as a .txt source.
const confluenceAdapter: DataRoomAdapter = {
  slug: "confluence",
  label: "Confluence",
  defaultRootFolderId: () => "root",
  rootFolderHint(creds) {
    if (!creds.base_url) {
      return { ok: false, message: "Confluence requires the wiki base URL (saved on the connection's credentials)." }
    }
    return { ok: true }
  },
  async listFolder(creds, folderId) {
    const base = (creds.base_url || "").replace(/\/+$/, "")
    if (!base) throw new Error("Confluence: missing base_url")
    const auth = basicAuthHeader(creds)
    if (folderId === "root" || !folderId) {
      // Top level → list spaces as folders.
      const res = await safeFetch(`${base}/rest/api/space?limit=200`, {
        headers: { Authorization: auth, Accept: "application/json" },
      })
      if (!res.ok) throw new Error(`Confluence space list failed: HTTP ${res.status}`)
      const json = (await readJson(res)) as { results?: Array<{ key: string; name: string }> }
      return (json.results || []).map((s) => ({
        id: `space:${s.key}`,
        name: s.name || s.key,
        kind: "folder" as const,
      }))
    }
    if (folderId.startsWith("space:")) {
      const key = folderId.slice("space:".length)
      const res = await safeFetch(
        `${base}/rest/api/content?spaceKey=${encodeURIComponent(key)}&type=page&limit=200`,
        { headers: { Authorization: auth, Accept: "application/json" } },
      )
      if (!res.ok) throw new Error(`Confluence page list failed: HTTP ${res.status}`)
      const json = (await readJson(res)) as { results?: Array<{ id: string; title: string }> }
      return (json.results || []).map((p) => ({
        id: `page:${p.id}`,
        name: p.title || `page-${p.id}`,
        kind: "file" as const,
      }))
    }
    return []
  },
  async downloadFile(creds, fileId) {
    const base = (creds.base_url || "").replace(/\/+$/, "")
    if (!base) throw new Error("Confluence: missing base_url")
    const auth = basicAuthHeader(creds)
    const pageId = fileId.startsWith("page:") ? fileId.slice("page:".length) : fileId
    const res = await safeFetch(
      `${base}/rest/api/content/${encodeURIComponent(pageId)}?expand=body.export_view`,
      { headers: { Authorization: auth, Accept: "application/json" } },
    )
    if (!res.ok) throw new Error(`Confluence page fetch failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as { title?: string; body?: { export_view?: { value?: string } } }
    const html = json.body?.export_view?.value || ""
    const text = stripHtml(html)
    const name = `${sanitizeFileName(json.title || `confluence-${pageId}`)}.txt`
    return { buffer: Buffer.from(text, "utf8"), name }
  },
}

// ── Notion ───────────────────────────────────────────────────────────────────
// https://developers.notion.com/reference/intro
// Internal-integration bearer token. Notion has no folder tree we can browse
// generically, so we present every page shared with the integration as a flat
// list under root. Page bodies are converted to Markdown and ingested as .md.
const NOTION_VERSION = "2022-06-28"
const notionAdapter: DataRoomAdapter = {
  slug: "notion",
  label: "Notion",
  defaultRootFolderId: () => "root",
  rootFolderHint: () => ({ ok: true }),
  async listFolder(creds, folderId) {
    const token = creds.token || creds.access_token || creds.api_key
    if (!token) throw new Error("Notion: missing integration token")
    if (folderId && folderId !== "root") return []
    const res = await safeFetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ filter: { property: "object", value: "page" }, page_size: 100 }),
    })
    if (!res.ok) throw new Error(`Notion search failed: HTTP ${res.status}`)
    const json = (await readJson(res)) as { results?: Array<Record<string, unknown>> }
    return (json.results || []).map((p) => ({
      id: String(p.id),
      name: extractNotionTitle(p),
      kind: "file" as const,
      modifiedAt: typeof p.last_edited_time === "string" ? p.last_edited_time : undefined,
    }))
  },
  async downloadFile(creds, fileId) {
    const token = creds.token || creds.access_token || creds.api_key
    if (!token) throw new Error("Notion: missing integration token")
    const headers = {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      Accept: "application/json",
    }
    const pageRes = await safeFetch(
      `https://api.notion.com/v1/pages/${encodeURIComponent(fileId)}`,
      { headers },
    )
    const page = (await readJson(pageRes)) as Record<string, unknown>
    const title = extractNotionTitle(page)
    const blocksRes = await safeFetch(
      `https://api.notion.com/v1/blocks/${encodeURIComponent(fileId)}/children?page_size=100`,
      { headers },
    )
    if (!blocksRes.ok) throw new Error(`Notion block fetch failed: HTTP ${blocksRes.status}`)
    const blocksJson = (await readJson(blocksRes)) as { results?: Array<Record<string, unknown>> }
    const md = `# ${title}\n\n${notionBlocksToMarkdown(blocksJson.results || [])}`
    const name = `${sanitizeFileName(title)}.md`
    return { buffer: Buffer.from(md, "utf8"), name }
  },
}

// ── Registry ────────────────────────────────────────────────────────────────
const REGISTRY: Record<DataRoomProviderSlug, DataRoomAdapter> = {
  box: boxAdapter,
  dropbox: dropboxAdapter,
  securedocs: secureDocsAdapter,
  datasite: datasiteAdapter,
  intralinks: intralinksAdapter,
  sharepoint: sharepointAdapter,
  "google-drive": googleDriveAdapter,
  confluence: confluenceAdapter,
  notion: notionAdapter,
}

export function getDataRoomAdapter(slug: string): DataRoomAdapter | null {
  return (REGISTRY as Record<string, DataRoomAdapter>)[slug] || null
}

export function listDataRoomSlugs(): DataRoomProviderSlug[] {
  return Object.keys(REGISTRY) as DataRoomProviderSlug[]
}
