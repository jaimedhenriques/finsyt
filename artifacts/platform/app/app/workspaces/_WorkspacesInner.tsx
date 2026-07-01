"use client"

import { useState, useRef, useCallback, useMemo, useEffect } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

/**
 * A citation surfaced by `/api/workspaces/chat` as a `data-citations` part.
 * The chat reply uses `[N]` markers; we render those as clickable badges
 * that open a drawer fetching the underlying chunk via
 * `/api/workspaces/sources/chunk`.
 */
interface ChatCitation {
  index: number
  sourceId: string
  sourceName: string
  sourceType: string
  chunkIndex: number
  snippet: string
}

interface CitationDrawerState {
  citation: ChatCitation
  loading: boolean
  error: string | null
  chunkText: string | null
  totalChunks: number | null
}

type SourceType = "pdf" | "url" | "text" | "sec" | "docx" | "xlsx" | "pptx" | "txt"
type WorkspaceKind = "research" | "diligence"

interface MatrixCitation {
  index: number
  sourceId: string
  sourceName: string
  sourceType: string
  chunkIndex: number
  snippet: string
}

interface MatrixCellState {
  sourceId: string
  sourceName: string
  question: string
  questionIndex: number
  answer: string
  citations: MatrixCitation[]
  status: "idle" | "loading" | "ok" | "error" | "no_content"
  error?: string
}

interface BulkIngestProgress {
  total: number
  done: number
  imported: number
  deduped: number
  failed: number
}

interface Source {
  id: string
  name: string
  type: SourceType
  status: "processing" | "ready" | "error"
  chunkCount?: number
  size?: string
  /** Hex SHA-256 of the source file (when known). */
  hash?: string
  /** ISO timestamp when the server last finished ingesting the source. */
  ingestedAt?: string
  /** "upload" | "connector" | "url". */
  origin?: "upload" | "connector" | "url"
  /** Connector slug if origin === "connector". */
  connectorSlug?: string
  addedAt: string
}

interface Workspace {
  id: string
  title: string
  kind: WorkspaceKind
  sources: Source[]
  createdAt: string
}

interface ServerSourceDto {
  id: string
  sourceId: string
  name: string
  type: string
  workspaceId: string | null
  byteSize: number | null
  hash: string | null
  origin: string | null
  connectorSlug: string | null
  ingestedAt: string | null
  chunkCount: number
}

/** Returned from `GET /api/workspaces/connectors/connections`. */
interface DataRoomConnection {
  id: string
  slug: string
  displayName: string
  status: string
  authType: string
  lastTestOk?: boolean | null
  lastTestAt?: string | null
}

/** Single entry in the folder picker (returned from `…/folders`). */
interface DataRoomEntryDto {
  id: string
  name: string
  kind: "file" | "folder"
  sizeBytes?: number
  modifiedAt?: string
  mimeType?: string
}

/** Returned from `POST /api/workspaces/connectors/sync`. */
interface SyncResultDto {
  ok: boolean
  slug?: string
  workspaceId?: string
  folderId?: string | null
  counts?: {
    imported: number
    deduped: number
    skipped: number
    failed: number
    walkedFolders: number
  }
  files?: Array<{
    remoteId: string
    name: string
    status: "imported" | "deduped" | "skipped" | "failed"
    sourceId?: string
    byteSize?: number
    hash?: string
    reason?: string
  }>
  fatalError?: string
}

/** Friendly icon per data-room provider. */
const CONNECTOR_ICONS: Record<string, string> = {
  box: "📦",
  dropbox: "📂",
  datasite: "🏛️",
  intralinks: "🤝",
  securedocs: "🔐",
}

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—"
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return "—"
  return `${hash.slice(0, 7)}…${hash.slice(-4)}`
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return "—"
  const diff = Date.now() - t
  if (diff < 60_000) return "just now"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

/**
 * Render assistant prose, replacing inline `[1]`, `[2,3]` markers with
 * clickable citation badges. Tokens that don't resolve to a citation in
 * `byIndex` (the model occasionally invents one) fall back to plain text
 * so the reader still sees the original characters.
 */
function CitationText({
  text,
  citations,
  onOpen,
}: {
  text: string
  citations: ChatCitation[]
  onOpen: (c: ChatCitation) => void
}) {
  const byIndex = useMemo(() => {
    const m = new Map<number, ChatCitation>()
    for (const c of citations) m.set(c.index, c)
    return m
  }, [citations])

  if (citations.length === 0) {
    return <p className="whitespace-pre-wrap">{text}</p>
  }

  // Match either a single `[12]` or grouped `[1, 2, 3]` / `[1,2]` forms
  // so the model has flexibility while we still recover discrete markers.
  const pattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g
  const out: Array<string | { tokens: number[]; key: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index))
    const tokens = match[1]
      .split(",")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))
    out.push({ tokens, key: `cite-${key++}-${match.index}` })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex))

  return (
    <p className="whitespace-pre-wrap">
      {out.map((seg, i) => {
        if (typeof seg === "string") return <span key={`t-${i}`}>{seg}</span>
        return (
          <span key={seg.key} className="inline-flex items-center gap-0.5 align-baseline">
            {seg.tokens.map((n, j) => {
              const c = byIndex.get(n)
              if (!c) return <span key={`miss-${j}`} className="text-white/40">[{n}]</span>
              return (
                <button
                  key={`b-${n}-${j}`}
                  type="button"
                  onClick={() => onOpen(c)}
                  title={`${c.sourceName} — section ${c.chunkIndex + 1}`}
                  className="inline-flex items-center justify-center min-w-[1.25rem] h-[1.1rem] px-1 mx-0.5 rounded-md bg-blue-500/20 hover:bg-blue-500/40 border border-blue-400/40 text-blue-200 text-[0.65rem] font-semibold leading-none align-baseline transition-colors"
                  aria-label={`Open citation ${n}: ${c.sourceName}`}
                >
                  {n}
                </button>
              )
            })}
          </span>
        )
      })}
    </p>
  )
}

const SOURCE_KIND_LABEL: Record<string, string> = {
  pdf: "Page",
  pptx: "Slide",
  ppt: "Slide",
  docx: "Section",
  xlsx: "Sheet section",
  txt: "Section",
  url: "Section",
  sec: "Section",
  text: "Section",
}

function chunkLabel(sourceType: string, chunkIndex: number): string {
  const noun = SOURCE_KIND_LABEL[sourceType] || "Section"
  return `${noun} ~${chunkIndex + 1}`
}

function CitationDrawer({
  state,
  onClose,
}: {
  state: CitationDrawerState
  onClose: () => void
}) {
  const { citation } = state
  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label={`Citation ${citation.index} from ${citation.sourceName}`}
        className="fixed top-0 right-0 h-screen w-full max-w-md bg-[#0b1224] border-l border-blue-500/20 z-50 flex flex-col shadow-2xl"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-blue-500/15">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-blue-300/70 uppercase tracking-wider">
              <span>Citation [{citation.index}]</span>
              <span className="text-white/30">•</span>
              <span>{chunkLabel(citation.sourceType, citation.chunkIndex)}</span>
            </div>
            <h3 className="mt-1 text-white/90 text-sm font-semibold truncate" title={citation.sourceName}>
              {citation.sourceName}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close citation"
            className="text-white/40 hover:text-white/80 text-lg leading-none ml-3"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.loading ? (
            <div className="text-white/40 text-xs">Loading source chunk…</div>
          ) : state.error ? (
            <div className="text-red-300/80 text-xs">
              Could not load this citation: {state.error}
            </div>
          ) : state.chunkText ? (
            <pre className="whitespace-pre-wrap text-white/80 text-[13px] leading-relaxed font-sans">
              {state.chunkText}
            </pre>
          ) : (
            <div className="text-white/40 text-xs">No content.</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-blue-500/15 text-[11px] text-white/40 flex items-center justify-between">
          <span>
            {state.totalChunks
              ? `Section ${citation.chunkIndex + 1} of ${state.totalChunks}`
              : `Section ${citation.chunkIndex + 1}`}
          </span>
          <span className="font-mono truncate ml-3" title={citation.sourceId}>
            {citation.sourceId.split(":").slice(1).join(":") || citation.sourceId}
          </span>
        </div>
      </aside>
    </>
  )
}

interface StudioOutput {
  id: string
  type: "brief" | "risks" | "comparison" | "summary"
  title: string
  content: string
  /**
   * Citations the studio route shipped alongside the generated content.
   * Same `[N]` contract as the chat reply — we render them as clickable
   * badges that open the shared citation drawer.
   */
  citations: ChatCitation[]
  generatedAt: string
}

function StudioCard({
  output,
  onDelete,
  onOpenCitation,
}: {
  output: StudioOutput
  onDelete: () => void
  onOpenCitation: (c: ChatCitation) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const icons: Record<string, string> = { brief: "📋", risks: "⚠️", comparison: "⚖️", summary: "📝" }
  return (
    <div className="bg-[#0f1629] border border-blue-500/10 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-blue-500/5" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span>{icons[output.type]}</span>
          <span className="text-white/80 text-sm font-medium">{output.title}</span>
          {output.citations.length > 0 && (
            <span
              className="ml-1 inline-flex items-center px-1.5 h-[1.1rem] rounded-md bg-blue-500/15 border border-blue-400/25 text-blue-200 text-[10px] font-semibold"
              title={`${output.citations.length} cited source chunks`}
            >
              {output.citations.length} cited
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/20 text-xs">{new Date(output.generatedAt).toLocaleTimeString()}</span>
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-white/20 hover:text-red-400 text-xs px-1">✕</button>
          <span className="text-white/30 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-blue-500/10">
          <div className="text-white/70 text-xs leading-relaxed font-sans mt-3">
            <CitationText
              text={output.content}
              citations={output.citations}
              onOpen={onOpenCitation}
            />
          </div>
          {output.citations.length > 0 && (
            <div className="mt-3 pt-2 border-t border-blue-500/10 flex flex-wrap gap-1.5">
              {output.citations.map(c => (
                <button
                  key={`studio-src-${c.index}`}
                  type="button"
                  onClick={() => onOpenCitation(c)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-200/80 text-[11px]"
                  title={`Open ${c.sourceName} — section ${c.chunkIndex + 1}`}
                >
                  <span className="text-blue-300/80 font-semibold">[{c.index}]</span>
                  <span className="truncate max-w-[180px]">{c.sourceName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SourceItem({ source, selected, onToggle, onDelete }: { source: Source; selected: boolean; onToggle: () => void; onDelete: () => void }) {
  const icons: Record<string, string> = {
    pdf: "📄", url: "🌐", text: "📝", sec: "🏛️",
    docx: "📃", xlsx: "📊", pptx: "📽️", txt: "📄",
  }
  const statusColor: Record<string, string> = { processing: "text-yellow-400", ready: "text-emerald-400", error: "text-red-400" }
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group ${selected ? "bg-blue-500/15 border border-blue-500/25" : "hover:bg-blue-500/5 border border-transparent"}`}
      onClick={onToggle}
    >
      <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1 accent-blue-500" onClick={e => e.stopPropagation()} />
      <span className="text-base mt-0.5">{icons[source.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-xs font-medium truncate">{source.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-xs ${statusColor[source.status]}`}>
            {source.status === "processing" ? "⏳ Processing..." : source.status === "ready" ? `✓ ${source.chunkCount || 0} chunks` : "✗ Error"}
          </span>
          {source.size && <span className="text-white/20 text-xs">{source.size}</span>}
        </div>
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 text-xs transition-opacity">✕</button>
    </div>
  )
}

export interface DealRoomViewer {
  userId: string
  name: string
  initials: string
  imageUrl: string | null
  /** ISO timestamp of the last open by this teammate. */
  openedAt: string
}

/**
 * Small circular avatar chip used inside the deal-room sidebar to surface
 * teammates who recently opened the same room. Falls back to initials when
 * Clerk hasn't returned an `imageUrl` (or when the image fails to load —
 * we hide it via onError so a broken URL doesn't leave an empty circle).
 */
function DealRoomViewerAvatar({ viewer, active }: { viewer: DealRoomViewer; active: boolean }) {
  const [imageBroken, setImageBroken] = useState(false)
  const ring = active ? "ring-amber-300/50" : "ring-amber-500/30"
  const tooltip = `${viewer.name} · opened ${relativeTime(viewer.openedAt)}`
  if (viewer.imageUrl && !imageBroken) {
    return (
      <img
        src={viewer.imageUrl}
        alt={viewer.name}
        title={tooltip}
        onError={() => setImageBroken(true)}
        className={`w-5 h-5 rounded-full object-cover ring-1 ${ring} bg-[#0b1220]`}
      />
    )
  }
  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[8.5px] font-semibold bg-amber-500/25 text-amber-100 ring-1 ${ring}`}
    >
      {viewer.initials || "?"}
    </span>
  )
}

export interface DealRoom {
  id: string
  name: string
  updatedAt: string
  /**
   * Teammates (other than the caller) who opened this room within the last
   * 7 days, most-recent-first. The deal-room sidebar surfaces up to a few of
   * these as avatar chips so a reviewer can spot when colleagues are also
   * camped out in the same room before adding notes.
   */
  recentViewers?: DealRoomViewer[]
}

export interface WorkspacesInnerProps {
  workspaceId?: string
  initialTitle?: string
  initialKind?: WorkspaceKind
  /**
   * Source ids the reviewer last had checked in this workspace. When
   * provided, hydration intersects this set with the available sources
   * and pre-checks only those (instead of "select all"). Pass an empty
   * array to start with nothing selected; pass `undefined` to fall back
   * to the legacy "all hydrated" behavior — useful for tests / contexts
   * where no persisted selection exists yet.
   */
  initialSelectedSourceIds?: string[]
  onBack?: () => void
  /**
   * All diligence workspaces in the caller's org, used to populate the
   * deal-room switcher rail. When non-empty (and an `onSwitchWorkspace`
   * is supplied) the switcher renders to the left of the sources rail.
   */
  dealRooms?: DealRoom[]
  /** Switch to a different deal room. Parent should re-key on the new id. */
  onSwitchWorkspace?: (id: string) => void
  /**
   * Create a new diligence workspace via POST /api/workspaces and switch
   * into it. Returns the created workspace id on success, or null on error.
   */
  onCreateDealRoom?: (name: string) => Promise<string | null>
  /**
   * Fired after a debounced PATCH successfully persists the reviewer's
   * source selection to the server. Lets the parent keep its in-memory
   * workspace list in sync so subsequent switches into this room re-hydrate
   * with the latest selection without re-fetching.
   */
  onSelectionPersisted?: (selectedSourceIds: string[]) => void
}

export default function WorkspacesInner({
  workspaceId,
  initialTitle,
  initialKind,
  initialSelectedSourceIds,
  onBack,
  dealRooms,
  onSwitchWorkspace,
  onCreateDealRoom,
  onSelectionPersisted,
}: WorkspacesInnerProps = {}) {
  const [workspace, setWorkspace] = useState<Workspace>({
    id: workspaceId ?? "default",
    title: initialTitle ?? "New Research Workspace",
    kind: initialKind ?? "research",
    sources: [],
    createdAt: new Date().toISOString(),
  })
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([])
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [tickerInput, setTickerInput] = useState("")
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"chat" | "studio" | "sources" | "matrix">("chat")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(initialTitle ?? "New Research Workspace")
  const [serverSources, setServerSources] = useState<ServerSourceDto[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesScope, setSourcesScope] = useState<"workspace" | "user">("workspace")
  const [citationDrawer, setCitationDrawer] = useState<CitationDrawerState | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const DEFAULT_MATRIX_QUESTIONS = [
    "What are the key revenue figures or financial metrics?",
    "What are the main risk factors disclosed?",
    "What is the management guidance or forward outlook?",
  ]
  const [matrixQuestions, setMatrixQuestions] = useState<string[]>(DEFAULT_MATRIX_QUESTIONS)
  const [matrixCells, setMatrixCells] = useState<Map<string, MatrixCellState>>(new Map())
  const [matrixRunning, setMatrixRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<BulkIngestProgress | null>(null)

  // ── Data-room picker state ────────────────────────────────────────────
  // Opens via "🔗 Sync from data room" in the Add Source panel (diligence
  // workspaces only). The picker walks the user's connections → folders →
  // triggers a sync that streams files into this workspace, tagged with
  // origin=connector and the catalog slug.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerConns, setPickerConns] = useState<DataRoomConnection[] | null>(null)
  const [pickerConnsErr, setPickerConnsErr] = useState<string | null>(null)
  const [pickerSelected, setPickerSelected] = useState<DataRoomConnection | null>(null)
  const [pickerFolderId, setPickerFolderId] = useState<string | null>(null)
  const [pickerCrumbs, setPickerCrumbs] = useState<Array<{ id: string; label: string }>>([])
  const [pickerEntries, setPickerEntries] = useState<DataRoomEntryDto[]>([])
  const [pickerListErr, setPickerListErr] = useState<string | null>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSyncing, setPickerSyncing] = useState(false)
  const [pickerResult, setPickerResult] = useState<SyncResultDto | null>(null)

  const activeSources = workspace.sources.filter(s => selectedSources.has(s.id) && s.status === "ready")
  const activeSourceIds = activeSources.map(s => s.id)

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/workspaces/chat",
    body: { sourceIds: activeSourceIds, workspaceId: workspace.id },
  }), [activeSourceIds.join(","), workspace.id])

  const { messages, sendMessage, status } = useChat({
    transport,
    onError: () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100),
  })

  const [chatInput, setChatInput] = useState("")
  const handleChatSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const text = chatInput.trim()
    if (!text || activeSources.length === 0 || status === "streaming") return
    void sendMessage({ text })
    setChatInput("")
  }, [chatInput, activeSources.length, status, sendMessage])

  const addSource = useCallback(async (type: Source["type"], data: { name: string; url?: string; text?: string; file?: File; size?: string; origin?: "upload" | "connector" | "url"; connectorSlug?: string }) => {
    const localId = Math.random().toString(36).slice(2)
    const newSource: Source = { id: localId, name: data.name, type, status: "processing", size: data.size, origin: data.origin, connectorSlug: data.connectorSlug, addedAt: new Date().toISOString() }
    setWorkspace(w => ({ ...w, sources: [...w.sources, newSource] }))
    setSelectedSources(s => new Set([...s, localId]))

    try {
      const formData = new FormData()
      formData.append("sourceId", localId)
      formData.append("type", type)
      formData.append("name", data.name)
      formData.append("workspaceId", workspace.id)
      if (data.origin) formData.append("origin", data.origin)
      if (data.connectorSlug) formData.append("connectorSlug", data.connectorSlug)
      if (data.url) formData.append("url", data.url)
      if (data.text) formData.append("text", data.text)
      if (data.file) formData.append("file", data.file)

      const res = await fetch("/api/workspaces/ingest", { method: "POST", body: formData })
      const result = await res.json()

      const serverId: string = result.sourceId || localId

      setWorkspace(w => ({
        ...w,
        sources: w.sources.map(s => s.id === localId
          ? {
              ...s,
              id: serverId,
              status: result.success ? "ready" : "error",
              chunkCount: result.chunkCount,
              size: result.size || data.size,
              hash: result.hash || s.hash,
              ingestedAt: result.ingestedAt || s.ingestedAt,
            }
          : s
        ),
      }))
      setSelectedSources(prev => {
        const next = new Set(prev)
        next.delete(localId)
        if (result.success) next.add(serverId)
        return next
      })
    } catch {
      setWorkspace(w => ({ ...w, sources: w.sources.map(s => s.id === localId ? { ...s, status: "error" } : s) }))
    }
  }, [workspace.id])

  /** Map a filename's extension to the type the ingest route expects. */
  const detectType = (name: string): SourceType => {
    const ext = (name.split(".").pop() || "").toLowerCase()
    if (ext === "pdf") return "pdf"
    if (ext === "docx") return "docx"
    if (ext === "xlsx" || ext === "xls") return "xlsx"
    if (ext === "pptx" || ext === "ppt") return "pptx"
    if (ext === "txt" || ext === "md" || ext === "csv" || ext === "log") return "txt"
    return "pdf"
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (files.length === 1) {
      const file = files[0]
      addSource(detectType(file.name), {
        name: file.name,
        file,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        origin: "upload",
      })
      setIsAddingSource(false)
    } else {
      void handleBulkFileUpload(files)
    }
    if (fileRef.current) fileRef.current.value = ""
    if (folderRef.current) folderRef.current.value = ""
  }

  const handleAddUrl = () => {
    if (!urlInput.trim()) return
    try { new URL(urlInput) } catch { return }
    const name = urlInput.replace(/^https?:\/\//, "").slice(0, 50)
    addSource("url", { name, url: urlInput })
    setUrlInput("")
    setIsAddingSource(false)
  }

  const handleAddSEC = () => {
    if (!tickerInput.trim()) return
    const ticker = tickerInput.toUpperCase().trim()
    addSource("sec", { name: `${ticker} — Latest 10-K`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=10-K&dateb=&owner=include&count=5&search_text=` })
    addSource("sec", { name: `${ticker} — Latest 10-Q`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=10-Q&dateb=&owner=include&count=5&search_text=` })
    setTickerInput("")
    setIsAddingSource(false)
  }

  const generateStudio = async (type: StudioOutput["type"]) => {
    if (activeSources.length === 0) return
    setIsGenerating(type)
    const titles: Record<string, string> = { brief: "Earnings Brief", risks: "Key Risks", comparison: "Comparison Table", summary: "Executive Summary" }
    try {
      const res = await fetch("/api/workspaces/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          sourceIds: activeSources.map(s => s.id),
          sourceNames: activeSources.map(s => s.name),
          workspaceId: workspace.id,
        }),
      })
      const data = await res.json() as { content?: string; error?: string; citations?: ChatCitation[] }
      const citations = Array.isArray(data.citations) ? data.citations : []
      setStudioOutputs(prev => [{ id: Math.random().toString(36).slice(2), type, title: `${titles[type]}`, content: data.content || data.error || "Generation failed", citations, generatedAt: new Date().toISOString() }, ...prev])
      setActiveTab("studio")
    } catch {
      setStudioOutputs(prev => [{ id: Math.random().toString(36).slice(2), type, title: titles[type], content: "Error generating output", citations: [], generatedAt: new Date().toISOString() }, ...prev])
    } finally {
      setIsGenerating(null)
    }
  }

  const matrixCellKey = (sourceId: string, qi: number) => `${sourceId}::${qi}`

  const runMatrixAll = useCallback(async () => {
    if (activeSources.length === 0 || matrixQuestions.length === 0 || matrixRunning) return
    setMatrixRunning(true)
    const pendingKeys: string[] = []
    setMatrixCells((prev) => {
      const next = new Map(prev)
      for (const src of activeSources) {
        for (let qi = 0; qi < matrixQuestions.length; qi++) {
          const key = matrixCellKey(src.id, qi)
          const existing = next.get(key)
          if (!existing || existing.status === "idle" || existing.status === "error") {
            pendingKeys.push(key)
            next.set(key, {
              sourceId: src.id, sourceName: src.name, question: matrixQuestions[qi],
              questionIndex: qi, answer: "", citations: [], status: "loading",
            })
          }
        }
      }
      return next
    })
    try {
      const res = await fetch("/api/workspaces/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceIds: activeSources.map((s) => s.id),
          questions: matrixQuestions,
          workspaceId: workspace.id,
        }),
        signal: AbortSignal.timeout(300_000),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        setMatrixCells((prev) => {
          const next = new Map(prev)
          for (const key of pendingKeys) {
            const cell = next.get(key)
            if (cell?.status === "loading") next.set(key, { ...cell, status: "error", error: err.error || `HTTP ${res.status}` })
          }
          return next
        })
        return
      }
      // Consume SSE stream — update each cell as it arrives
      const reader = res.body?.getReader()
      if (!reader) throw new Error("No response body")
      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split("\n\n")
        buf = parts.pop() ?? ""
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith("data:")) continue
          try {
            const evt = JSON.parse(line.slice(5).trim()) as
              | { type: "cell"; cell: MatrixCellState }
              | { type: "done"; total: number }
              | { type: "error"; error: string }
            if (evt.type === "cell") {
              const cell = evt.cell
              const key = matrixCellKey(cell.sourceId, cell.questionIndex)
              // Preserve exact backend status — never coerce error → ok
              setMatrixCells((prev) => {
                const next = new Map(prev)
                next.set(key, cell)
                return next
              })
            } else if (evt.type === "error") {
              setMatrixCells((prev) => {
                const next = new Map(prev)
                for (const key of pendingKeys) {
                  const c = next.get(key)
                  if (c?.status === "loading") next.set(key, { ...c, status: "error", error: evt.error })
                }
                return next
              })
            }
          } catch {
            // ignore malformed SSE frames
          }
        }
      }
      // Mark any cells that never received a response as errors
      setMatrixCells((prev) => {
        const next = new Map(prev)
        for (const key of pendingKeys) {
          if (next.get(key)?.status === "loading") {
            const cell = next.get(key)!
            next.set(key, { ...cell, status: "error", error: "no_response" })
          }
        }
        return next
      })
    } catch (err) {
      setMatrixCells((prev) => {
        const next = new Map(prev)
        for (const key of pendingKeys) {
          const cell = next.get(key)
          if (cell?.status === "loading") next.set(key, { ...cell, status: "error", error: (err as Error).message || "network_error" })
        }
        return next
      })
    } finally {
      setMatrixRunning(false)
    }
  }, [activeSources, matrixQuestions, matrixRunning, workspace.id])

  const clearMatrix = useCallback(() => {
    setMatrixCells(new Map())
  }, [])

  const addMatrixQuestion = useCallback(() => {
    setMatrixQuestions((q) => [...q, ""])
  }, [])

  const updateMatrixQuestion = useCallback((idx: number, text: string) => {
    setMatrixQuestions((q) => q.map((v, i) => (i === idx ? text : v)))
    setMatrixCells((prev) => {
      const next = new Map(prev)
      for (const [key, cell] of next) {
        if (cell.questionIndex === idx) next.set(key, { ...cell, status: "idle", answer: "", citations: [] })
      }
      return next
    })
  }, [])

  const removeMatrixQuestion = useCallback((idx: number) => {
    setMatrixQuestions((q) => q.filter((_, i) => i !== idx))
    setMatrixCells((prev) => {
      const next = new Map<string, MatrixCellState>()
      for (const [, cell] of prev) {
        if (cell.questionIndex === idx) continue
        const newQi = cell.questionIndex > idx ? cell.questionIndex - 1 : cell.questionIndex
        const key = matrixCellKey(cell.sourceId, newQi)
        next.set(key, { ...cell, questionIndex: newQi })
      }
      return next
    })
  }, [])

  const handleBulkFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files)
    if (fileArr.length === 0) return

    const localIds = fileArr.map((f, i) => `bulk-${Date.now()}-${i}`)
    setBulkProgress({ total: fileArr.length, done: 0, imported: 0, deduped: 0, failed: 0 })

    setWorkspace((w) => ({
      ...w,
      sources: [
        ...w.sources,
        ...fileArr.map((file, i) => ({
          id: localIds[i],
          name: file.name,
          type: detectType(file.name),
          status: "processing" as const,
          size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
          origin: "upload" as const,
          addedAt: new Date().toISOString(),
        })),
      ],
    }))
    fileArr.forEach((_, i) => setSelectedSources((s) => new Set([...s, localIds[i]])))

    const CHUNK_SIZE = 20
    let imported = 0, deduped = 0, failed = 0, done = 0

    for (let off = 0; off < fileArr.length; off += CHUNK_SIZE) {
      const slice = fileArr.slice(off, off + CHUNK_SIZE)
      const sliceIds = localIds.slice(off, off + CHUNK_SIZE)
      const form = new FormData()
      if (workspaceId && workspaceId !== "default") form.append("workspaceId", workspaceId)
      slice.forEach((file, i) => {
        form.append("file", file)
        form.append("sourceId", sliceIds[i])
      })

      try {
        const res = await fetch("/api/workspaces/ingest/bulk", { method: "POST", body: form })
        if (res.ok) {
          const data = await res.json() as { results?: Array<{ clientSourceId: string; ok: boolean; sourceId?: string; chunkCount?: number; size?: string; hash?: string; ingestedAt?: string; deduped?: boolean; error?: string }> }
          const results = Array.isArray(data.results) ? data.results : []
          setWorkspace((w) => ({
            ...w,
            sources: w.sources.map((src) => {
              const match = results.find((r) => r.clientSourceId === src.id)
              if (!match) return src
              return {
                ...src,
                id: match.sourceId || src.id,
                status: match.ok ? "ready" : "error",
                chunkCount: match.chunkCount,
                size: match.size || src.size,
                hash: match.hash || src.hash,
                ingestedAt: match.ingestedAt || src.ingestedAt,
              }
            }),
          }))
          setSelectedSources((prev) => {
            const next = new Set(prev)
            for (const r of results) {
              next.delete(r.clientSourceId)
              if (r.ok && r.sourceId) next.add(r.sourceId)
            }
            return next
          })
          for (const r of results) {
            if (r.ok && !r.deduped) imported++
            else if (r.ok && r.deduped) deduped++
            else failed++
          }
        } else {
          slice.forEach((_, i) => {
            setWorkspace((w) => ({ ...w, sources: w.sources.map((src) => src.id === sliceIds[i] ? { ...src, status: "error" } : src) }))
          })
          failed += slice.length
        }
      } catch {
        slice.forEach((_, i) => {
          setWorkspace((w) => ({ ...w, sources: w.sources.map((src) => src.id === sliceIds[i] ? { ...src, status: "error" } : src) }))
        })
        failed += slice.length
      }
      done += slice.length
      setBulkProgress({ total: fileArr.length, done, imported, deduped, failed })
    }

    setBulkProgress(null)
    setIsAddingSource(false)
  }, [workspaceId, workspace.id])

  const toggleSource = (id: string) => setSelectedSources(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  /**
   * Delete a source. The server endpoint enforces the userId-prefix guard
   * before touching storage, so a stale id from another tenant can never
   * delete cross-tenant data.
   */
  const deleteSource = useCallback(async (id: string) => {
    setWorkspace(w => ({ ...w, sources: w.sources.filter(s => s.id !== id) }))
    setSelectedSources(prev => { const n = new Set(prev); n.delete(id); return n })
    setServerSources(prev => prev.filter(s => s.sourceId !== id && s.id !== id))
    try {
      await fetch(`/api/workspaces/sources?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    } catch {
      // best-effort — we already removed it from local state.
    }
  }, [])

  /**
   * Open the citation drawer for a `[N]` badge. We optimistically render
   * the in-memory snippet so the user sees something instantly, then fetch
   * the full chunk from the server. The server re-verifies the userId
   * prefix on `sourceId` before returning content, so a tampered citation
   * cannot read another tenant's chunk.
   */
  const openCitation = useCallback(async (citation: ChatCitation) => {
    // Race-safety key: citation.index resets per assistant turn, so
    // pairing on (sourceId, chunkIndex) ensures a stale fetch from a
    // previously-open citation can never overwrite the drawer for the
    // citation the user is currently viewing — even if both happen to
    // share the same `[N]` number across messages.
    const requestKey = `${citation.sourceId}#${citation.chunkIndex}`
    const matches = (prev: CitationDrawerState | null) =>
      !!prev && `${prev.citation.sourceId}#${prev.citation.chunkIndex}` === requestKey
    setCitationDrawer({
      citation,
      loading: true,
      error: null,
      chunkText: citation.snippet || null,
      totalChunks: null,
    })
    try {
      const params = new URLSearchParams({
        sourceId: citation.sourceId,
        chunkIndex: String(citation.chunkIndex),
      })
      if (workspaceId && workspaceId !== "default") params.set("workspaceId", workspaceId)
      const res = await fetch(`/api/workspaces/sources/chunk?${params.toString()}`, {
        cache: "no-store",
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setCitationDrawer((prev) => matches(prev)
          ? { ...prev!, loading: false, error: body?.error || `HTTP ${res.status}` }
          : prev)
        return
      }
      const data = await res.json() as { chunkText: string; totalChunks: number }
      setCitationDrawer((prev) => matches(prev)
        ? { ...prev!, loading: false, error: null, chunkText: data.chunkText, totalChunks: data.totalChunks }
        : prev)
    } catch (err) {
      setCitationDrawer((prev) => matches(prev)
        ? { ...prev!, loading: false, error: (err as Error).message || "fetch_failed" }
        : prev)
    }
  }, [workspaceId])

  /**
   * Pull the latest server-side source list and merge it into the left rail.
   * Shared between the hydrate effect and the post-sync refresh — both want
   * to see brand-new connector files appear in `workspace.sources` without
   * a full reload.
   */
  const mergeServerSources = useCallback(async () => {
    if (!workspaceId || workspaceId === "default") return
    try {
      const res = await fetch(
        `/api/workspaces/sources?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      )
      if (!res.ok) return
      const data = (await res.json()) as { sources: ServerSourceDto[] }
      if (!Array.isArray(data.sources)) return
      const sources: Source[] = data.sources.map((s) => ({
        id: s.sourceId,
        name: s.name,
        type: s.type as SourceType,
        status: "ready",
        chunkCount: s.chunkCount,
        size: s.byteSize ? formatBytes(s.byteSize) : undefined,
        hash: s.hash ?? undefined,
        ingestedAt: s.ingestedAt ?? undefined,
        origin: (s.origin as Source["origin"]) ?? undefined,
        connectorSlug: s.connectorSlug ?? undefined,
        addedAt: s.ingestedAt ?? new Date().toISOString(),
      }))
      setWorkspace((w) => {
        // Preserve any in-flight "processing" rows the server doesn't know
        // about yet (concurrent uploads), but rebuild everything else from
        // the canonical server list.
        const inFlight = w.sources.filter((s) => s.status === "processing")
        const inFlightIds = new Set(inFlight.map((s) => s.id))
        const merged = [
          ...sources.filter((s) => !inFlightIds.has(s.id)),
          ...inFlight,
        ]
        return { ...w, sources: merged }
      })
      // Auto-select any new connector-imported sources so the chat surface
      // can immediately use them without an extra click.
      setSelectedSources((prev) => {
        const next = new Set(prev)
        for (const s of sources) if (s.origin === "connector") next.add(s.id)
        return next
      })
    } catch {
      // best-effort
    }
  }, [workspaceId])

  /** Load the user's data-room connections lazily when the picker opens. */
  const openPicker = useCallback(async () => {
    setPickerOpen(true)
    setPickerResult(null)
    setPickerSelected(null)
    setPickerEntries([])
    setPickerCrumbs([])
    setPickerFolderId(null)
    setPickerListErr(null)
    if (pickerConns) return
    try {
      const res = await fetch("/api/workspaces/connectors/connections", { cache: "no-store" })
      const data = (await res.json()) as { connections?: DataRoomConnection[]; error?: string }
      if (!res.ok) {
        setPickerConnsErr(data.error || `Failed to load connections (HTTP ${res.status})`)
        setPickerConns([])
      } else {
        setPickerConns(data.connections ?? [])
        setPickerConnsErr(null)
      }
    } catch (err) {
      setPickerConnsErr((err as Error).message || "Failed to load connections")
      setPickerConns([])
    }
  }, [pickerConns])

  /** Fetch the children of `folderId` (or the provider's root) for the picker. */
  const loadPickerFolder = useCallback(
    async (conn: DataRoomConnection, folderId: string | null) => {
      setPickerLoading(true)
      setPickerListErr(null)
      try {
        const url = folderId
          ? `/api/workspaces/connectors/folders?connectionId=${encodeURIComponent(conn.id)}&folderId=${encodeURIComponent(folderId)}`
          : `/api/workspaces/connectors/folders?connectionId=${encodeURIComponent(conn.id)}`
        const res = await fetch(url, { cache: "no-store" })
        const data = (await res.json()) as { entries?: DataRoomEntryDto[]; folderId?: string; error?: string }
        if (!res.ok) {
          setPickerListErr(data.error || `HTTP ${res.status}`)
          setPickerEntries([])
        } else {
          setPickerEntries(data.entries ?? [])
          setPickerFolderId(data.folderId ?? folderId ?? null)
        }
      } catch (err) {
        setPickerListErr((err as Error).message || "Failed to list folder")
        setPickerEntries([])
      } finally {
        setPickerLoading(false)
      }
    },
    [],
  )

  /** Pick a connection → load its root folder. */
  const selectPickerConnection = useCallback(
    async (conn: DataRoomConnection) => {
      setPickerSelected(conn)
      setPickerCrumbs([{ id: "", label: conn.displayName }])
      setPickerResult(null)
      await loadPickerFolder(conn, null)
    },
    [loadPickerFolder],
  )

  /** Drill into a sub-folder. */
  const enterPickerFolder = useCallback(
    async (entry: DataRoomEntryDto) => {
      if (!pickerSelected) return
      setPickerCrumbs((c) => [...c, { id: entry.id, label: entry.name }])
      await loadPickerFolder(pickerSelected, entry.id)
    },
    [pickerSelected, loadPickerFolder],
  )

  /** Jump back to a breadcrumb level. */
  const jumpPickerCrumb = useCallback(
    async (index: number) => {
      if (!pickerSelected) return
      const target = pickerCrumbs.slice(0, index + 1)
      setPickerCrumbs(target)
      await loadPickerFolder(pickerSelected, target[index]?.id || null)
    },
    [pickerSelected, pickerCrumbs, loadPickerFolder],
  )

  /** Trigger the actual sync of the currently visible folder. */
  const runPickerSync = useCallback(
    async (recursive: boolean) => {
      if (!pickerSelected || !workspaceId || workspaceId === "default") return
      setPickerSyncing(true)
      setPickerResult(null)
      try {
        const res = await fetch("/api/workspaces/connectors/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: pickerSelected.id,
            workspaceId,
            folderId: pickerFolderId,
            recursive,
          }),
        })
        const data = (await res.json()) as SyncResultDto
        setPickerResult(data)
        if (data.ok) await mergeServerSources()
      } catch (err) {
        setPickerResult({ ok: false, fatalError: (err as Error).message || "sync_failed" })
      } finally {
        setPickerSyncing(false)
      }
    },
    [pickerSelected, pickerFolderId, workspaceId, mergeServerSources],
  )

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setPickerSyncing(false)
  }, [])

  const refreshServerSources = useCallback(async () => {
    setSourcesLoading(true)
    try {
      const url = sourcesScope === "workspace"
        ? `/api/workspaces/sources?workspaceId=${encodeURIComponent(workspace.id)}`
        : "/api/workspaces/sources"
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) {
        const data = await res.json() as { sources: ServerSourceDto[] }
        setServerSources(Array.isArray(data.sources) ? data.sources : [])
      }
    } catch {
      // leave existing list alone
    } finally {
      setSourcesLoading(false)
    }
  }, [sourcesScope, workspace.id])

  // Refresh on Sources tab entry.
  useEffect(() => {
    if (activeTab === "sources") void refreshServerSources()
  }, [activeTab, refreshServerSources])

  // Hydrate persisted sources into the left rail on first mount.
  // `selectionHydratedRef` flips to true once we've made the initial
  // `setSelectedSources` call from server data — the persistence effect
  // below uses it to avoid PATCHing the freshly-hydrated baseline back to
  // the server (which would be a no-op write on every workspace open).
  const hydratedRef = useRef(false)
  const selectionHydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    if (!workspaceId || workspaceId === "default") {
      // No server-side workspace to hydrate from; treat the empty initial
      // state as the "hydrated" baseline so the persistence effect can
      // still PATCH once a real workspace id arrives via re-mount.
      selectionHydratedRef.current = true
      return
    }
    hydratedRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(
          `/api/workspaces/sources?workspaceId=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        )
        if (!res.ok) return
        const data = await res.json() as { sources: ServerSourceDto[] }
        if (cancelled || !Array.isArray(data.sources)) return
        const sources: Source[] = data.sources.map(s => ({
          id: s.sourceId,
          name: s.name,
          type: (s.type as SourceType),
          status: "ready",
          chunkCount: s.chunkCount,
          size: s.byteSize ? formatBytes(s.byteSize) : undefined,
          hash: s.hash ?? undefined,
          ingestedAt: s.ingestedAt ?? undefined,
          origin: (s.origin as Source["origin"]) ?? undefined,
          connectorSlug: s.connectorSlug ?? undefined,
          addedAt: s.ingestedAt ?? new Date().toISOString(),
        }))
        setWorkspace(w => ({ ...w, sources }))
        // Restore the reviewer's last curated selection. We intersect the
        // persisted ids with the currently-available sources so an id that
        // was deleted between sessions doesn't haunt the selection — and
        // so a tampered persisted array can't surface a foreign id to the
        // chat route (which still re-checks ownership server-side).
        const availableIds = new Set(sources.map(s => s.id))
        const persisted = initialSelectedSourceIds
        const next = persisted !== undefined
          ? new Set(persisted.filter(id => availableIds.has(id)))
          // Legacy fallback when no persisted set is supplied (e.g. tests
          // or older callers): pre-check every hydrated source.
          : new Set(sources.map(s => s.id))
        setSelectedSources(next)
        selectionHydratedRef.current = true
      } catch {
        // best-effort — leave the (empty) baseline selection alone but
        // still mark hydration done so user toggles persist as normal.
        selectionHydratedRef.current = true
      }
    })()
    return () => { cancelled = true }
  }, [workspaceId, initialSelectedSourceIds])

  // Debounced persistence: whenever the reviewer toggles sources on/off,
  // PATCH the workspace row so the curated subset survives a reload or a
  // switch back into this deal room. We compare against the last-saved set
  // to skip no-op writes (e.g. selection changes that net to the same set
  // after rapid toggling). Only fires once initial hydration is complete.
  const lastSavedSelectionRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectionHydratedRef.current) return
    if (!workspaceId || workspaceId === "default") return
    // Sort to make the comparison order-insensitive — the server stores a
    // jsonb array but logically the selection is a set.
    const ids = Array.from(selectedSources).sort()
    const serialized = JSON.stringify(ids)
    if (lastSavedSelectionRef.current === null) {
      // Seed the baseline on the first run after hydration so we don't
      // immediately PATCH the hydrated value back to the server.
      lastSavedSelectionRef.current = serialized
      return
    }
    if (lastSavedSelectionRef.current === serialized) return
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/workspaces?id=${encodeURIComponent(workspaceId)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ selectedSourceIds: ids }),
            },
          )
          if (res.ok) {
            lastSavedSelectionRef.current = serialized
            onSelectionPersisted?.(ids)
          }
        } catch {
          // best-effort — leave the baseline alone so the next change
          // retries the PATCH. The local UI state already reflects the
          // user's intent.
        }
      })()
    }, 600)
    return () => window.clearTimeout(handle)
  }, [selectedSources, workspaceId, onSelectionPersisted])

  // Deal-room switcher state. Shown only when the parent passes diligence
  // workspaces and a switch callback (i.e. the caller is the workspaces
  // page in diligence mode, not a standalone embed).
  const showDealRoomRail = !!(dealRooms && onSwitchWorkspace && initialKind === "diligence")

  // Record that the current user opened this diligence workspace, so
  // teammates see "Sarah · 2h ago" chips alongside the room in their own
  // sidebars next time the list refreshes. Best-effort: a network failure
  // here just means the chip won't appear, the workspace itself is still
  // fully functional.
  useEffect(() => {
    if (initialKind !== "diligence") return
    if (!workspaceId || workspaceId === "default") return
    const ctrl = new AbortController()
    fetch("/api/workspaces/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
      signal: ctrl.signal,
    }).catch(() => { /* best-effort, presence indicator only */ })
    return () => ctrl.abort()
  }, [workspaceId, initialKind])
  const [creatingRoom, setCreatingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [creatingBusy, setCreatingBusy] = useState(false)

  const submitNewRoom = useCallback(async () => {
    const name = newRoomName.trim()
    if (!name || !onCreateDealRoom) return
    setCreatingBusy(true)
    try {
      const id = await onCreateDealRoom(name)
      if (id) {
        setNewRoomName("")
        setCreatingRoom(false)
      }
    } finally {
      setCreatingBusy(false)
    }
  }, [newRoomName, onCreateDealRoom])

  return (
    <div className="flex h-screen bg-[#080d1a] text-white overflow-hidden">
      {/* LEFT-MOST: Deal-room switcher (diligence only) */}
      {showDealRoomRail && (
        <div className="w-56 flex-shrink-0 flex flex-col border-r border-amber-500/10 bg-[#0b1220]">
          <div className="px-4 py-4 border-b border-amber-500/10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-amber-300/60 uppercase tracking-widest">Deal Rooms</span>
              {onBack && (
                <button
                  onClick={onBack}
                  aria-label="Back to all workspaces"
                  className="text-amber-300/50 hover:text-amber-300 text-xs"
                  title="Back to all workspaces"
                >
                  ⊞
                </button>
              )}
            </div>
            <p className="text-white/30 text-xs">{dealRooms!.length} saved</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
            {dealRooms!.length === 0 ? (
              <div className="px-2 py-6 text-center">
                <p className="text-white/25 text-xs leading-relaxed">No diligence workspaces yet. Create one below.</p>
              </div>
            ) : dealRooms!.map(dr => {
              const isActive = dr.id === workspace.id
              const viewers = dr.recentViewers ?? []
              const lastOpener = viewers[0]
              // Native title= so the deal-room rail stays markup-light; the
              // copy mirrors the spec ("Last opened by <name> · <relative time>").
              const tooltip = lastOpener
                ? `Last opened by ${lastOpener.name} · ${relativeTime(lastOpener.openedAt)}`
                : undefined
              return (
                <button
                  key={dr.id}
                  onClick={() => { if (!isActive && onSwitchWorkspace) onSwitchWorkspace(dr.id) }}
                  aria-current={isActive ? "page" : undefined}
                  title={tooltip}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                    isActive
                      ? "bg-amber-500/15 border border-amber-500/30"
                      : "hover:bg-amber-500/5 border border-transparent"
                  }`}
                >
                  <div className={`text-xs font-semibold truncate ${isActive ? "text-amber-100" : "text-white/70"}`}>
                    🏛️ {dr.name}
                  </div>
                  <div className="text-[10px] text-white/30 mt-0.5">
                    {relativeTime(dr.updatedAt)}
                  </div>
                  {viewers.length > 0 && (
                    <div
                      className="mt-1.5 flex items-center"
                      aria-label={`Recently opened by ${viewers.map(v => v.name).join(", ")}`}
                    >
                      <div className="flex -space-x-1.5">
                        {viewers.slice(0, 3).map(v => (
                          <DealRoomViewerAvatar key={v.userId} viewer={v} active={isActive} />
                        ))}
                        {viewers.length > 3 && (
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[8.5px] font-semibold ring-1 ${
                              isActive
                                ? "bg-amber-500/25 text-amber-100 ring-amber-300/40"
                                : "bg-white/10 text-white/60 ring-amber-500/20"
                            }`}
                            title={viewers.slice(3).map(v => v.name).join(", ")}
                          >
                            +{viewers.length - 3}
                          </span>
                        )}
                      </div>
                      {lastOpener && (
                        <span className="ml-1.5 text-[9.5px] text-white/35 truncate">
                          {lastOpener.name.split(" ")[0]} · {relativeTime(lastOpener.openedAt)}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
          <div className="p-3 border-t border-amber-500/10">
            {creatingRoom ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={newRoomName}
                  onChange={e => setNewRoomName(e.target.value)}
                  placeholder="e.g. Project Atlas"
                  className="w-full bg-[#0f1629] border border-amber-500/25 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-amber-500/50"
                  onKeyDown={e => {
                    if (e.key === "Enter") void submitNewRoom()
                    if (e.key === "Escape") { setCreatingRoom(false); setNewRoomName("") }
                  }}
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => void submitNewRoom()}
                    disabled={!newRoomName.trim() || creatingBusy}
                    className="flex-1 px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 disabled:opacity-30 rounded-lg text-amber-200 text-xs font-medium"
                  >
                    {creatingBusy ? "Creating…" : "Create"}
                  </button>
                  <button
                    onClick={() => { setCreatingRoom(false); setNewRoomName("") }}
                    className="px-2.5 py-1.5 text-white/30 hover:text-white/60 text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreatingRoom(true)}
                disabled={!onCreateDealRoom}
                className="w-full py-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 rounded-xl text-amber-200 text-xs font-medium transition-all disabled:opacity-30"
              >
                + New Diligence Workspace
              </button>
            )}
          </div>
        </div>
      )}

      {/* LEFT: Sources */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-blue-500/10">
        <div className="px-4 py-4 border-b border-blue-500/10">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  onClick={onBack}
                  aria-label="Back to workspaces"
                  className="text-blue-300/60 hover:text-blue-300 text-sm leading-none"
                >
                  ←
                </button>
              )}
              <span className="text-xs font-semibold text-blue-300/50 uppercase tracking-widest">Sources</span>
            </div>
            <button onClick={() => setSelectedSources(new Set(workspace.sources.filter(s => s.status === "ready").map(s => s.id)))} className="text-xs text-blue-400/50 hover:text-blue-400">Select all</button>
          </div>
          {editingTitle ? (
            <input autoFocus value={titleValue} onChange={e => setTitleValue(e.target.value)}
              onBlur={() => { setWorkspace(w => ({ ...w, title: titleValue })); setEditingTitle(false) }}
              onKeyDown={e => e.key === "Enter" && (setWorkspace(w => ({ ...w, title: titleValue })), setEditingTitle(false))}
              className="w-full bg-transparent text-white text-sm font-semibold outline-none border-b border-blue-500/40 pb-0.5" />
          ) : (
            <h2 onClick={() => setEditingTitle(true)} className="text-white text-sm font-semibold cursor-text hover:text-blue-300 truncate">{workspace.title}</h2>
          )}
          <p className="text-white/20 text-xs mt-0.5">{workspace.sources.length} sources · {activeSources.length} active</p>
          {bulkProgress && (
            <div className="mt-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2.5 py-1.5">
              <div className="flex items-center justify-between text-[10px] text-blue-300/70 mb-1">
                <span>Ingesting {bulkProgress.total} files…</span>
                <span>{bulkProgress.done}/{bulkProgress.total}</span>
              </div>
              <div className="h-1 rounded-full bg-blue-500/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400/60 transition-all"
                  style={{ width: `${Math.round((bulkProgress.done / bulkProgress.total) * 100)}%` }}
                />
              </div>
              {(bulkProgress.failed > 0 || bulkProgress.deduped > 0) && (
                <p className="text-[10px] text-white/30 mt-0.5">
                  {bulkProgress.imported} imported · {bulkProgress.deduped} deduped · {bulkProgress.failed} failed
                </p>
              )}
            </div>
          )}
          <div className="mt-2 flex items-center gap-1 p-0.5 bg-[#0f1629] border border-blue-500/15 rounded-lg" role="tablist" aria-label="Workspace mode">
            {(["research", "diligence"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={workspace.kind === k}
                onClick={() => setWorkspace(w => ({ ...w, kind: k }))}
                className={`flex-1 px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold transition-all ${
                  workspace.kind === k
                    ? (k === "diligence" ? "bg-amber-500/20 text-amber-200" : "bg-blue-500/25 text-blue-200")
                    : "text-white/30 hover:text-white/60"
                }`}
              >
                {k === "diligence" ? "🏛️ Diligence" : "🔬 Research"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
          {workspace.sources.length === 0 ? (
            <div className="px-4 py-8 text-center"><p className="text-white/20 text-xs leading-relaxed">Add PDFs, URLs, or pull SEC filings by ticker</p></div>
          ) : workspace.sources.map(source => (
            <SourceItem key={source.id} source={source} selected={selectedSources.has(source.id)} onToggle={() => toggleSource(source.id)} onDelete={() => deleteSource(source.id)} />
          ))}
        </div>

        <div className="p-3 border-t border-blue-500/10 space-y-2">
          {isAddingSource ? (
            <div className="space-y-2">
              <div className="flex gap-1">
                <input value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="Paste URL..."
                  className="flex-1 bg-[#0f1629] border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                  onKeyDown={e => e.key === "Enter" && handleAddUrl()} />
                <button onClick={handleAddUrl} className="px-2.5 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 text-xs font-medium">Add</button>
              </div>
              <div className="flex gap-1">
                <input value={tickerInput} onChange={e => setTickerInput(e.target.value)} placeholder="Ticker (e.g. NVDA)"
                  className="flex-1 bg-[#0f1629] border border-blue-500/20 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-blue-500/50"
                  onKeyDown={e => e.key === "Enter" && handleAddSEC()} />
                <button onClick={handleAddSEC} className="px-2.5 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-300 text-xs font-medium">SEC</button>
              </div>
              <button onClick={() => fileRef.current?.click()} className="w-full py-1.5 border border-dashed border-blue-500/25 rounded-lg text-blue-300/50 text-xs hover:border-blue-500/50 hover:text-blue-300/80 transition-all">📎 Upload PDF / DOCX / XLSX / PPTX / TXT</button>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.pptx,.ppt,.txt,.md,.csv,.log" multiple className="hidden" onChange={handleFileUpload} />
              {workspace.kind === "diligence" && (
                <>
                  <button onClick={() => folderRef.current?.click()} className="w-full py-1.5 border border-dashed border-amber-500/30 rounded-lg text-amber-200/70 text-xs hover:border-amber-500/60 hover:text-amber-200 transition-all">📁 Upload data-room folder</button>
                  {/* webkitdirectory lets a reviewer drop an entire VDR folder. */}
                  <input
                    ref={folderRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileUpload}
                    {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
                  />
                  <button
                    onClick={() => { setIsAddingSource(false); void openPicker() }}
                    className="w-full py-1.5 border border-dashed border-purple-500/30 rounded-lg text-purple-200/80 text-xs hover:border-purple-500/60 hover:text-purple-200 transition-all"
                  >
                    🔗 Sync from data room (Box, Dropbox, Datasite…)
                  </button>
                </>
              )}
              <button onClick={() => setIsAddingSource(false)} className="w-full text-white/20 text-xs hover:text-white/40">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setIsAddingSource(true)} className="w-full py-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 rounded-xl text-blue-300 text-xs font-medium transition-all">+ Add Source</button>
          )}
        </div>
      </div>

      {/* MIDDLE: Chat / Studio */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-blue-500/10">
        <div className="flex items-center gap-1 px-4 py-3 border-b border-blue-500/10 overflow-x-auto">
          {(["chat", "studio", "sources", "matrix"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${activeTab === tab ? "bg-blue-500/20 text-blue-300" : "text-white/30 hover:text-white/60"}`}>
              {tab === "chat"
                ? "💬 Chat"
                : tab === "studio"
                ? `✨ Studio${studioOutputs.length > 0 ? ` (${studioOutputs.length})` : ""}`
                : tab === "sources"
                ? `📂 Sources${serverSources.length > 0 ? ` (${serverSources.length})` : ""}`
                : `⊞ Matrix`}
            </button>
          ))}
          <div className="ml-auto flex-shrink-0">
            {activeSources.length > 0
              ? <span className="text-emerald-400/60 text-xs">● {activeSources.length} source{activeSources.length !== 1 ? "s" : ""} active</span>
              : <span className="text-white/20 text-xs">No sources selected</span>}
          </div>
        </div>

        {activeTab === "chat" ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl">🔬</div>
                  <div>
                    <h3 className="text-white/80 font-semibold mb-1">Research Workspace</h3>
                    <p className="text-white/30 text-sm max-w-xs leading-relaxed">Add sources on the left, then ask questions grounded to your documents — with citations.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                    {["What were the key revenue drivers?", "Summarise the risk factors", "What guidance was given for next quarter?", "Compare margins YoY"].map(q => (
                      <button key={q} onClick={() => setChatInput(q)} className="text-left px-3 py-2.5 bg-[#0f1629] border border-blue-500/10 hover:border-blue-500/30 rounded-xl text-white/50 text-xs hover:text-white/70 transition-all">{q}</button>
                    ))}
                  </div>
                </div>
              ) : messages.map(msg => {
                const parts = (msg.parts ?? []) as Array<{ type: string; text?: string; data?: unknown }>
                const text = parts.filter(p => p.type === "text").map(p => p.text ?? "").join("")
                // The chat route emits a single `data-citations` part at the
                // start of each assistant turn. We pluck the most recent one
                // (in case the model produces multiple steps) so badges always
                // map to the citations actually used in this reply.
                const citations: ChatCitation[] = (() => {
                  const dataParts = parts.filter(p => p.type === "data-citations")
                  const last = dataParts.at(-1)?.data
                  return Array.isArray(last) ? (last as ChatCitation[]) : []
                })()
                return (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-blue-300">F</div>}
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "bg-blue-500/20 text-white/90 rounded-br-sm" : "bg-[#0f1629] border border-blue-500/10 text-white/80 rounded-bl-sm"}`}>
                    {msg.role === "assistant"
                      ? <CitationText text={text} citations={citations} onOpen={openCitation} />
                      : <p className="whitespace-pre-wrap">{text}</p>}
                    {msg.role === "assistant" && citations.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-blue-500/10 flex flex-wrap gap-1.5">
                        {citations.map(c => (
                          <button
                            key={`src-${c.index}`}
                            type="button"
                            onClick={() => openCitation(c)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-200/80 text-[11px]"
                            title={`Open ${c.sourceName} — section ${c.chunkIndex + 1}`}
                          >
                            <span className="text-blue-300/80 font-semibold">[{c.index}]</span>
                            <span className="truncate max-w-[180px]">{c.sourceName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )})}
              {status === "streaming" && (
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-300">F</div>
                  <div className="px-4 py-3 bg-[#0f1629] border border-blue-500/10 rounded-2xl rounded-bl-sm">
                    <div className="flex gap-1">{[0, 150, 300].map(d => <div key={d} className="w-1.5 h-1.5 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="px-4 pb-4">
              {activeSources.length === 0 && <p className="text-center text-white/20 text-xs mb-2">← Select sources to ground the chat</p>}
              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  placeholder={activeSources.length > 0 ? `Ask about ${activeSources.slice(0,2).map(s => s.name.split("—")[0].trim()).join(", ")}...` : "Add and select sources first..."}
                  disabled={activeSources.length === 0 || status === "streaming"}
                  className="flex-1 bg-[#0f1629] border border-blue-500/15 hover:border-blue-500/30 focus:border-blue-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors disabled:opacity-40" />
                <button type="submit" disabled={!chatInput.trim() || activeSources.length === 0 || status === "streaming"}
                  className="px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-30 border border-blue-500/20 rounded-xl text-blue-300 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </form>
              {/* Export quick-action chips — inject prompts into the chat to trigger
                  the agent's Word-memo and email-draft fast paths. Disabled while
                  streaming to avoid prompt collisions. */}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <button
                  type="button"
                  disabled={status === "streaming"}
                  onClick={() => setChatInput("Generate a Word document for ")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300/70 hover:text-blue-300 text-[10px] font-medium transition-all disabled:opacity-30"
                  title="Pre-fill a Word memo prompt — type the ticker then send"
                >
                  📄 Export Word memo
                </button>
                <button
                  type="button"
                  disabled={status === "streaming"}
                  onClick={() => setChatInput("Draft an email for ")}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-300/70 hover:text-indigo-300 text-[10px] font-medium transition-all disabled:opacity-30"
                  title="Pre-fill an email draft prompt — type the ticker then send"
                >
                  ✉️ Draft email
                </button>
              </div>
            </div>
          </>
        ) : activeTab === "studio" ? (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {studioOutputs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <span className="text-3xl">✨</span>
                <div><h3 className="text-white/80 font-semibold mb-1">Studio</h3><p className="text-white/30 text-sm max-w-xs">Generate structured outputs from your sources using the panel →</p></div>
              </div>
            ) : studioOutputs.map(o => <StudioCard key={o.id} output={o} onDelete={() => setStudioOutputs(p => p.filter(x => x.id !== o.id))} onOpenCitation={openCitation} />)}
          </div>
        ) : activeTab === "matrix" ? (
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Matrix toolbar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-500/10 flex-shrink-0">
              <span className="text-white/40 text-xs">
                {activeSources.length} doc{activeSources.length !== 1 ? "s" : ""} × {matrixQuestions.length} question{matrixQuestions.length !== 1 ? "s" : ""}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {matrixCells.size > 0 && (
                  <button
                    onClick={clearMatrix}
                    disabled={matrixRunning}
                    className="px-2.5 py-1 rounded-lg text-xs text-white/30 hover:text-red-400 disabled:opacity-30 transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={addMatrixQuestion}
                  disabled={matrixRunning || matrixQuestions.length >= 10}
                  className="px-2.5 py-1 rounded-lg text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/20 disabled:opacity-30 transition-colors"
                >
                  + Question
                </button>
                <button
                  onClick={() => void runMatrixAll()}
                  disabled={activeSources.length === 0 || matrixRunning || matrixQuestions.every((q) => !q.trim())}
                  className="px-3 py-1.5 rounded-lg text-xs bg-blue-500/25 hover:bg-blue-500/35 text-blue-200 font-medium border border-blue-500/30 disabled:opacity-30 transition-colors"
                >
                  {matrixRunning ? "Running…" : "▶ Run All"}
                </button>
              </div>
            </div>

            {activeSources.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
                <span className="text-4xl opacity-40">⊞</span>
                <div>
                  <h3 className="text-white/60 font-semibold mb-1">Multi-document Matrix</h3>
                  <p className="text-white/25 text-sm max-w-sm leading-relaxed">
                    Select sources on the left, edit your questions in the columns, then click Run All to get cited answers for every document × question combination.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                  <thead className="sticky top-0 z-10 bg-[#080d1a]">
                    <tr>
                      <th className="sticky left-0 z-20 bg-[#080d1a] border-b border-r border-blue-500/10 px-3 py-2 text-left text-white/30 font-medium min-w-[180px] max-w-[220px]">
                        Document
                      </th>
                      {matrixQuestions.map((q, qi) => (
                        <th
                          key={qi}
                          className="border-b border-r border-blue-500/10 px-2 py-2 min-w-[220px] max-w-[300px] align-top bg-[#080d1a]"
                        >
                          <div className="flex items-start gap-1">
                            <textarea
                              value={q}
                              onChange={(e) => updateMatrixQuestion(qi, e.target.value)}
                              placeholder="Enter question…"
                              rows={2}
                              className="flex-1 bg-transparent text-white/70 placeholder-white/20 resize-none outline-none text-[11px] leading-relaxed min-w-0"
                            />
                            {matrixQuestions.length > 1 && (
                              <button
                                onClick={() => removeMatrixQuestion(qi)}
                                className="text-white/20 hover:text-red-400 text-xs leading-none flex-shrink-0 mt-0.5"
                                title="Remove question"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeSources.map((src) => (
                      <tr key={src.id} className="group hover:bg-blue-500/3">
                        <td className="sticky left-0 bg-[#080d1a] group-hover:bg-[#0b1120] border-b border-r border-blue-500/10 px-3 py-2 align-top max-w-[220px]">
                          <div className="flex items-start gap-1.5">
                            <span className="text-base leading-none mt-0.5 flex-shrink-0">
                              {src.type === "pdf" ? "📄" : src.type === "docx" ? "📃" : src.type === "xlsx" ? "📊" : src.type === "pptx" ? "📽️" : src.type === "url" ? "🌐" : "📄"}
                            </span>
                            <div className="min-w-0">
                              <p className="text-white/80 font-medium truncate leading-snug" title={src.name}>
                                {src.name}
                              </p>
                              {src.size && <p className="text-white/25 text-[10px] mt-0.5">{src.size}</p>}
                            </div>
                          </div>
                        </td>
                        {matrixQuestions.map((_, qi) => {
                          const cell = matrixCells.get(matrixCellKey(src.id, qi))
                          return (
                            <td
                              key={qi}
                              className="border-b border-r border-blue-500/10 px-3 py-2 align-top min-w-[220px] max-w-[300px]"
                            >
                              {!cell || cell.status === "idle" ? (
                                <span className="text-white/15">—</span>
                              ) : cell.status === "loading" ? (
                                <div className="flex items-center gap-1.5 text-blue-400/50">
                                  <div className="flex gap-0.5">
                                    {[0, 100, 200].map((d) => (
                                      <div
                                        key={d}
                                        className="w-1 h-1 rounded-full bg-blue-400/60 animate-bounce"
                                        style={{ animationDelay: `${d}ms` }}
                                      />
                                    ))}
                                  </div>
                                  <span className="text-[10px]">Analyzing…</span>
                                </div>
                              ) : cell.status === "error" ? (
                                <div className="text-red-400/70 text-[11px]">
                                  ⚠ {cell.error || "Error"}
                                </div>
                              ) : cell.status === "no_content" ? (
                                <span className="text-white/25 text-[11px] italic">Not found in this document</span>
                              ) : (
                                <div className="space-y-1.5">
                                  <CitationText
                                    text={cell.answer}
                                    citations={cell.citations.map((c) => ({
                                      ...c,
                                      sourceType: c.sourceType,
                                    }))}
                                    onOpen={(c) =>
                                      openCitation({
                                        index: c.index,
                                        sourceId: c.sourceId,
                                        sourceName: c.sourceName,
                                        sourceType: c.sourceType,
                                        chunkIndex: c.chunkIndex,
                                        snippet: c.snippet,
                                      })
                                    }
                                  />
                                  {cell.citations.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {cell.citations.map((c) => (
                                        <button
                                          key={`m-cite-${c.index}`}
                                          type="button"
                                          onClick={() =>
                                            openCitation({
                                              index: c.index,
                                              sourceId: c.sourceId,
                                              sourceName: c.sourceName,
                                              sourceType: c.sourceType,
                                              chunkIndex: c.chunkIndex,
                                              snippet: c.snippet,
                                            })
                                          }
                                          className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/25 border border-blue-400/20 text-blue-200/70 text-[10px] font-semibold"
                                          title={`Section ${c.chunkIndex + 1}`}
                                        >
                                          [{c.index}]
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="min-w-0">
                <h3 className="text-white/80 text-sm font-semibold">Sources</h3>
                <p className="text-white/30 text-xs">
                  {sourcesScope === "workspace"
                    ? "Files in this workspace. Server-enforced workspace + tenant isolation."
                    : "All files you've ingested across every workspace."}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1 p-0.5 bg-[#0f1629] border border-blue-500/15 rounded-lg" role="tablist" aria-label="Sources scope">
                  {(["workspace", "user"] as const).map((s) => (
                    <button
                      key={s}
                      role="tab"
                      aria-selected={sourcesScope === s}
                      onClick={() => setSourcesScope(s)}
                      className={`px-2 py-1 rounded text-[10px] uppercase tracking-wider font-semibold transition-all ${
                        sourcesScope === s
                          ? "bg-blue-500/25 text-blue-200"
                          : "text-white/30 hover:text-white/60"
                      }`}
                    >
                      {s === "workspace" ? "This workspace" : "All my files"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => void refreshServerSources()}
                  disabled={sourcesLoading}
                  className="text-xs px-2.5 py-1 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 disabled:opacity-40"
                >
                  {sourcesLoading ? "Refreshing…" : "Refresh"}
                </button>
              </div>
            </div>
            {serverSources.length === 0 ? (
              <div className="text-center py-12 text-white/30 text-xs">
                {sourcesLoading ? "Loading…" : "No sources ingested yet."}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-blue-500/10">
                <table className="w-full text-xs">
                  <thead className="bg-[#0f1629] text-white/40 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      <th className="text-left px-3 py-2 font-medium">Origin</th>
                      <th className="text-right px-3 py-2 font-medium">Size</th>
                      <th className="text-left px-3 py-2 font-medium">Hash</th>
                      <th className="text-left px-3 py-2 font-medium">Last ingested</th>
                      <th className="text-right px-3 py-2 font-medium">Chunks</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {serverSources.map((row) => (
                      <tr key={row.sourceId} className="border-t border-blue-500/5 hover:bg-blue-500/5">
                        <td className="px-3 py-2 text-white/80 truncate max-w-[280px]" title={row.name}>{row.name}</td>
                        <td className="px-3 py-2 text-white/50 uppercase">{row.type}</td>
                        <td className="px-3 py-2 text-white/50">
                          {row.origin === "connector" && row.connectorSlug
                            ? <span className="text-amber-300/80">{row.connectorSlug}</span>
                            : (row.origin || "—")}
                        </td>
                        <td className="px-3 py-2 text-right text-white/60">{formatBytes(row.byteSize)}</td>
                        <td className="px-3 py-2 font-mono text-white/40" title={row.hash || ""}>{shortHash(row.hash)}</td>
                        <td className="px-3 py-2 text-white/50" title={row.ingestedAt || ""}>{relativeTime(row.ingestedAt)}</td>
                        <td className="px-3 py-2 text-right text-white/50">{row.chunkCount}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => void deleteSource(row.sourceId)}
                            className="text-white/30 hover:text-red-400 text-xs"
                            aria-label={`Delete ${row.name}`}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT: Studio Controls */}
      <div className="w-52 flex-shrink-0 flex flex-col border-l border-blue-500/10">
        <div className="px-4 py-4 border-b border-blue-500/10">
          <span className="text-xs font-semibold text-blue-300/50 uppercase tracking-widest">Studio</span>
        </div>
        <div className="flex-1 p-3 space-y-2">
          {[
            { type: "brief" as const,      icon: "📋", label: "Earnings Brief",    desc: "Key numbers, guidance, beats/misses" },
            { type: "summary" as const,    icon: "📝", label: "Exec Summary",      desc: "TL;DR for busy analysts" },
            { type: "risks" as const,      icon: "⚠️",  label: "Key Risks",        desc: "Flags from filings & transcripts" },
            { type: "comparison" as const, icon: "⚖️", label: "Comparison Table", desc: "Side-by-side metrics" },
          ].map(({ type, icon, label, desc }) => (
            <button key={type} onClick={() => generateStudio(type)} disabled={activeSources.length === 0 || !!isGenerating}
              className="w-full text-left px-3 py-3 bg-[#0f1629] hover:bg-blue-500/10 border border-blue-500/10 hover:border-blue-500/25 rounded-xl transition-all disabled:opacity-30 group">
              <div className="flex items-center gap-2 mb-1">
                <span>{icon}</span>
                <span className="text-white/80 text-xs font-medium">{label}</span>
                {isGenerating === type && <span className="ml-auto text-blue-400/60 text-xs animate-pulse">⏳</span>}
              </div>
              <p className="text-white/30 text-xs">{desc}</p>
            </button>
          ))}
          <div className="pt-2 border-t border-blue-500/10 text-center">
            <p className="text-white/15 text-xs px-2 leading-relaxed">Select sources to enable generation</p>
          </div>
        </div>
        <div className="p-3 border-t border-blue-500/10 space-y-1.5">
          {[["Sources", workspace.sources.length, "text-white/60"], ["Active", activeSources.length, "text-emerald-400/70"], ["Chunks", activeSources.reduce((s, x) => s + (x.chunkCount || 0), 0), "text-white/60"], ["Outputs", studioOutputs.length, "text-white/60"]].map(([label, val, cls]) => (
            <div key={label as string} className="flex justify-between text-xs">
              <span className="text-white/30">{label}</span>
              <span className={cls as string}>{val}</span>
            </div>
          ))}
        </div>
      </div>
      {citationDrawer && (
        <CitationDrawer state={citationDrawer} onClose={() => setCitationDrawer(null)} />
      )}

      {/* Data-room picker overlay */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Sync from data room"
          onClick={(e) => { if (e.target === e.currentTarget) closePicker() }}
        >
          <div className="w-full max-w-2xl max-h-[80vh] bg-[#0b1224] border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-purple-500/20">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔗</span>
                <div>
                  <h3 className="text-white text-sm font-semibold">Sync from data room</h3>
                  <p className="text-white/40 text-xs">Files stream into this workspace under your own permissions.</p>
                </div>
              </div>
              <button onClick={closePicker} aria-label="Close picker" className="text-white/30 hover:text-white text-lg leading-none px-2">×</button>
            </div>

            {/* Step 1 — pick a connection */}
            {!pickerSelected && (
              <div className="overflow-y-auto p-5 space-y-3">
                {pickerConns === null ? (
                  <p className="text-white/40 text-xs">Loading connections…</p>
                ) : pickerConnsErr ? (
                  <p className="text-red-300 text-xs">{pickerConnsErr}</p>
                ) : pickerConns.length === 0 ? (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-amber-100/80 text-xs leading-relaxed">
                    No data-room connections in this workspace yet. Open the
                    <span className="text-amber-200 font-medium"> Connector Hub</span> and connect Box, Dropbox, Datasite, Intralinks or SecureDocs first.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {pickerConns.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => void selectPickerConnection(c)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0f1629] border border-purple-500/15 hover:border-purple-500/40 transition-all text-left"
                        >
                          <span className="text-2xl">{CONNECTOR_ICONS[c.slug] || "🔌"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-white/85 text-sm font-medium truncate">{c.displayName}</div>
                            <div className="text-white/30 text-xs">
                              {c.slug} · {c.authType}
                              {c.lastTestOk === false && <span className="text-amber-300/70"> · last test failed</span>}
                            </div>
                          </div>
                          <span className="text-purple-300 text-xs">Browse →</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Step 2 — folder picker + sync */}
            {pickerSelected && (
              <>
                <div className="px-5 py-2 border-b border-purple-500/20 flex items-center gap-2 text-xs">
                  <button onClick={() => { setPickerSelected(null); setPickerEntries([]); setPickerCrumbs([]); setPickerFolderId(null); setPickerListErr(null) }} className="text-purple-300/70 hover:text-purple-200">← Connections</button>
                  <span className="text-white/20">/</span>
                  {pickerCrumbs.map((c, i) => (
                    <span key={`${c.id}-${i}`} className="flex items-center gap-1">
                      <button
                        onClick={() => void jumpPickerCrumb(i)}
                        className={`hover:text-white truncate max-w-[10rem] ${i === pickerCrumbs.length - 1 ? "text-white/80" : "text-white/40"}`}
                        title={c.label}
                      >
                        {c.label}
                      </button>
                      {i < pickerCrumbs.length - 1 && <span className="text-white/20">/</span>}
                    </span>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[14rem]">
                  {pickerLoading ? (
                    <p className="text-white/40 text-xs">Loading folder…</p>
                  ) : pickerListErr ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-red-200 text-xs">{pickerListErr}</div>
                  ) : pickerEntries.length === 0 ? (
                    <p className="text-white/30 text-xs">This folder is empty.</p>
                  ) : (
                    <ul className="space-y-1">
                      {pickerEntries.map((e) => (
                        <li key={e.id}>
                          {e.kind === "folder" ? (
                            <button
                              onClick={() => void enterPickerFolder(e)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-purple-500/10 text-left text-sm text-white/80"
                            >
                              <span>📁</span>
                              <span className="flex-1 truncate">{e.name}</span>
                              <span className="text-white/30 text-xs">›</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-white/60">
                              <span>📄</span>
                              <span className="flex-1 truncate">{e.name}</span>
                              <span className="text-white/30 text-xs">{formatBytes(e.sizeBytes ?? null)}</span>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {pickerResult && (
                  <div className={`mx-5 mb-2 rounded-xl border p-3 text-xs leading-relaxed ${pickerResult.ok ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-100/80" : "border-red-500/30 bg-red-500/5 text-red-200"}`}>
                    {pickerResult.ok ? (
                      <>
                        <div className="font-medium text-emerald-200">Sync complete</div>
                        <div>
                          imported {pickerResult.counts?.imported ?? 0}
                          {" · "}deduped {pickerResult.counts?.deduped ?? 0}
                          {" · "}skipped {pickerResult.counts?.skipped ?? 0}
                          {" · "}failed {pickerResult.counts?.failed ?? 0}
                          {" · "}walked {pickerResult.counts?.walkedFolders ?? 0} folder{pickerResult.counts?.walkedFolders === 1 ? "" : "s"}
                        </div>
                        {pickerResult.files && pickerResult.files.some((f) => f.status === "failed") && (
                          <div className="mt-2 text-amber-200/80">
                            Some files failed: {pickerResult.files.filter((f) => f.status === "failed").slice(0, 3).map((f) => `${f.name} (${f.reason || "error"})`).join(", ")}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="font-medium">Sync failed</div>
                        <div>{pickerResult.fatalError || "Unknown error"}</div>
                      </>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 px-5 py-3 border-t border-purple-500/20">
                  <span className="text-white/40 text-xs flex-1 truncate">
                    {pickerFolderId ? `Will sync into: ${pickerCrumbs.map((c) => c.label).join(" / ")}` : "Selecting root…"}
                  </span>
                  <button
                    onClick={() => void runPickerSync(false)}
                    disabled={pickerSyncing || !!pickerListErr}
                    className="px-3 py-1.5 rounded-lg bg-[#0f1629] border border-purple-500/30 hover:border-purple-500/60 text-purple-200 text-xs font-medium disabled:opacity-40"
                  >
                    {pickerSyncing ? "Syncing…" : "Sync this folder"}
                  </button>
                  <button
                    onClick={() => void runPickerSync(true)}
                    disabled={pickerSyncing || !!pickerListErr}
                    className="px-3 py-1.5 rounded-lg bg-purple-500/25 hover:bg-purple-500/40 text-purple-100 text-xs font-medium disabled:opacity-40"
                  >
                    {pickerSyncing ? "Syncing…" : "Sync recursively"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
