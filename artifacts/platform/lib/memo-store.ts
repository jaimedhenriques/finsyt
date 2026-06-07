/**
 * Persistent store for generated investment-memo PPTX files.
 *
 * Backed by Replit App Storage (Google Cloud Storage) so generated decks
 * survive platform restarts and stay reachable from any instance — analysts
 * can keep download links open across days within the TTL window without
 * 404s after a redeploy. Each memo writes one GCS object whose custom
 * metadata carries the manifest the Finsyt Agent drawer needs to re-render
 * the file card (filename, ticker, owner, expiry).
 *
 * The bucket and PRIVATE_OBJECT_DIR are provisioned via the platform's
 * App Storage integration (skill: object-storage). Objects are stored
 * under `${PRIVATE_OBJECT_DIR}/copilot-memos/<fileId>.pptx`.
 */
import { Storage, type File } from '@google-cloud/storage'
import { randomBytes } from 'node:crypto'

const REPLIT_SIDECAR_ENDPOINT = 'http://127.0.0.1:1106'
const TTL_MS = 24 * 60 * 60 * 1000   // 24 hours

let _client: Storage | null = null
function client(): Storage {
  if (_client) return _client
  _client = new Storage({
    credentials: {
      audience: 'replit',
      subject_token_type: 'access_token',
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: 'external_account',
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: { type: 'json', subject_token_field_name: 'access_token' },
      },
      universe_domain: 'googleapis.com',
    },
    projectId: '',
  })
  return _client
}

function privateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR
  if (!dir) {
    throw new Error('PRIVATE_OBJECT_DIR not set — run setupObjectStorage().')
  }
  return dir
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const p = path.startsWith('/') ? path : `/${path}`
  const parts = p.split('/')
  if (parts.length < 3) throw new Error(`Invalid object path: ${path}`)
  return { bucketName: parts[1]!, objectName: parts.slice(2).join('/') }
}

function memoFile(fileId: string): File {
  const dir = privateDir().replace(/\/$/, '')
  const { bucketName, objectName } = parseObjectPath(`${dir}/copilot-memos/${fileId}.pptx`)
  return client().bucket(bucketName).file(objectName)
}

export type MemoTemplate = 'banker-pitch' | 'matrix-snapshot' | 'investment-memo'

export interface MemoMetadata {
  fileId:    string
  filename:  string
  ticker:    string
  userId:    string | null
  createdAt: number
  expiresAt: number
  bytes:     number
  template:  MemoTemplate | null
  slides:    number | null
}

export async function putMemo(input: {
  buffer: Buffer
  filename: string
  ticker: string
  userId: string | null
  template?: MemoTemplate
  slides?: number
}): Promise<{ fileId: string; expiresAt: number; bytes: number }> {
  const fileId = randomBytes(16).toString('hex')
  const now = Date.now()
  const expiresAt = now + TTL_MS
  const bytes = input.buffer.byteLength

  const file = memoFile(fileId)
  await file.save(input.buffer, {
    contentType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    resumable: false,
    metadata: {
      contentType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      metadata: {
        finsytFileId:   fileId,
        finsytFilename: input.filename,
        finsytTicker:   input.ticker.toUpperCase(),
        finsytUserId:   input.userId ?? '',
        finsytCreated:  String(now),
        finsytExpires:  String(expiresAt),
        finsytTemplate: input.template ?? '',
        finsytSlides:   input.slides != null ? String(input.slides) : '',
      },
    },
  })

  return { fileId, expiresAt, bytes }
}

/**
 * Fetch the manifest plus the bytes of a previously stored memo. Returns
 * null if the object is missing or has passed its TTL (we hard-delete on
 * the first stale read so listings don't accumulate cruft).
 */
export async function getMemo(fileId: string): Promise<{
  buffer:   Buffer
  filename: string
  ticker:   string
  userId:   string | null
  createdAt: number
  expiresAt: number
  bytes:     number
} | null> {
  const file = memoFile(fileId)
  let exists = false
  try {
    [exists] = await file.exists()
  } catch {
    return null
  }
  if (!exists) return null

  // GCS `getMetadata()` returns the raw JSON resource; only the fields we
  // actually use are typed here. Custom metadata lives under `.metadata`
  // and is always string-valued by the GCS contract.
  interface GcsMetadataResponse {
    size?:     string | number
    metadata?: Record<string, string | undefined>
  }
  let metadata: GcsMetadataResponse
  try {
    const [m] = await file.getMetadata()
    metadata = m as GcsMetadataResponse
  } catch {
    return null
  }
  const m = (metadata.metadata ?? {}) as Record<string, string | undefined>
  const expiresAt = Number(m.finsytExpires ?? 0)
  if (!expiresAt || expiresAt < Date.now()) {
    // Best-effort cleanup; don't surface delete errors.
    file.delete().catch(() => {})
    return null
  }

  let buffer: Buffer
  try {
    const [buf] = await file.download()
    buffer = buf
  } catch {
    return null
  }

  return {
    buffer,
    filename:  m.finsytFilename || `${m.finsytTicker || 'Investment'} Memo.pptx`,
    ticker:    (m.finsytTicker || '').toUpperCase(),
    userId:    m.finsytUserId ? m.finsytUserId : null,
    createdAt: Number(m.finsytCreated ?? 0),
    expiresAt,
    bytes:     Number(metadata.size ?? buffer.byteLength),
  }
}

const VALID_TEMPLATES: ReadonlySet<MemoTemplate> = new Set([
  'banker-pitch',
  'matrix-snapshot',
  'investment-memo',
])

/**
 * List previously-stored memos for a user, newest first. Includes both
 * still-live and already-expired entries (callers can filter / disable
 * expired rows in the UI). Limited to `limit` rows after sorting so
 * the call stays cheap even if the bucket has years of cruft.
 *
 * Note: this lists every object under `copilot-memos/` and filters in
 * memory, since GCS metadata-side filtering isn't available. The TTL
 * is short (24h) and per-user volume is low, so the listing scans a
 * small working set in practice.
 */
export async function listForUser(
  userId: string,
  limit = 20,
): Promise<MemoMetadata[]> {
  const dir = privateDir().replace(/\/$/, '')
  const { bucketName, objectName: prefix } = parseObjectPath(`${dir}/copilot-memos/`)

  let files: File[]
  try {
    [files] = await client().bucket(bucketName).getFiles({ prefix })
  } catch {
    return []
  }

  interface GcsListEntry {
    name?:     string
    size?:     string | number
    metadata?: Record<string, string | undefined>
  }

  const out: MemoMetadata[] = []
  for (const f of files) {
    const raw = (f.metadata ?? {}) as GcsListEntry
    const m = (raw.metadata ?? {}) as Record<string, string | undefined>
    const ownerId = m.finsytUserId ? m.finsytUserId : null
    if (ownerId !== userId) continue

    const fileId = m.finsytFileId || ''
    if (!fileId) continue
    const tmplRaw = (m.finsytTemplate || '').trim()
    const template = VALID_TEMPLATES.has(tmplRaw as MemoTemplate)
      ? (tmplRaw as MemoTemplate)
      : null
    const slidesRaw = Number(m.finsytSlides ?? 0)

    out.push({
      fileId,
      filename:  m.finsytFilename || `${m.finsytTicker || 'Memo'}.pptx`,
      ticker:    (m.finsytTicker || '').toUpperCase(),
      userId:    ownerId,
      createdAt: Number(m.finsytCreated ?? 0),
      expiresAt: Number(m.finsytExpires ?? 0),
      bytes:     Number(raw.size ?? 0),
      template,
      slides:    Number.isFinite(slidesRaw) && slidesRaw > 0 ? slidesRaw : null,
    })
  }

  out.sort((a, b) => b.createdAt - a.createdAt)
  return out.slice(0, limit)
}
