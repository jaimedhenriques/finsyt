'use client'

import { useState, useRef, useCallback, useMemo } from 'react'

interface FilingCitation {
  index: number
  sourceId: string
  sourceName: string
  sourceType: string
  chunkIndex: number
  snippet: string
}

interface AnalysisSection {
  id: string
  title: string
  content: string
}

interface AnalysisResult {
  fileName: string
  chunkCount: number
  sections: AnalysisSection[]
  citations: FilingCitation[]
}

type UploadPhase =
  | { phase: 'idle' }
  | { phase: 'uploading'; fileName: string }
  | { phase: 'analyzing'; fileName: string; chunkCount: number; sections: AnalysisSection[] }
  | { phase: 'done'; result: AnalysisResult }
  | { phase: 'error'; message: string }

function CitationText({
  text,
  citations,
  onOpen,
}: {
  text: string
  citations: FilingCitation[]
  onOpen: (c: FilingCitation) => void
}) {
  const byIndex = useMemo(() => {
    const m = new Map<number, FilingCitation>()
    for (const c of citations) m.set(c.index, c)
    return m
  }, [citations])

  const pattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g
  const parts: Array<{ type: 'text'; value: string } | { type: 'cite'; nums: number[]; key: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    parts.push({
      type: 'cite',
      nums: match[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)),
      key: `c${key++}`,
    })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) })

  return (
    <span className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
      {parts.map((part, i) => {
        if (part.type === 'text') return <span key={i}>{part.value}</span>
        return (
          <span key={part.key} className="inline-flex items-center gap-0.5 align-baseline mx-0.5">
            {part.nums.map(n => {
              const c = byIndex.get(n)
              if (!c) return <span key={n} className="text-white/25 text-xs">[{n}]</span>
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onOpen(c)}
                  title={`${c.sourceName} — section ${c.chunkIndex + 1}`}
                  className="inline-flex items-center justify-center min-w-[1.2rem] h-[1rem] px-1 rounded bg-blue-500/20 hover:bg-blue-500/40 border border-blue-400/30 text-blue-200 text-[11px] font-semibold transition-colors cursor-pointer"
                  aria-label={`Open citation ${n}`}
                >
                  {n}
                </button>
              )
            })}
          </span>
        )
      })}
    </span>
  )
}

function CitationDrawer({ citation, onClose }: { citation: FilingCitation | null; onClose: () => void }) {
  if (!citation) return null
  const kindLabel: Record<string, string> = {
    pdf: 'Page', docx: 'Section', xlsx: 'Sheet section', pptx: 'Slide', txt: 'Section', sec: 'Section',
  }
  const sectionLabel = `${kindLabel[citation.sourceType] || 'Section'} ~${citation.chunkIndex + 1}`
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={`Citation ${citation.index} from ${citation.sourceName}`}
        className="fixed top-0 right-0 h-screen w-full max-w-md bg-[#0b1224] border-l border-blue-500/20 z-50 flex flex-col shadow-2xl"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-blue-500/15">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-blue-300/70 uppercase tracking-wider">
              <span>Citation [{citation.index}]</span>
              <span className="text-white/25">•</span>
              <span>{sectionLabel}</span>
            </div>
            <h3 className="mt-1 text-white/90 text-sm font-semibold truncate" title={citation.sourceName}>
              {citation.sourceName}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close citation"
            className="text-white/40 hover:text-white/80 text-lg leading-none ml-3 mt-0.5"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap text-white/80 text-[13px] leading-relaxed font-sans">
            {citation.snippet}
          </pre>
        </div>
        <div className="px-5 py-3 border-t border-blue-500/15 text-[11px] text-white/35 flex items-center gap-2">
          <span>{sectionLabel}</span>
          <span className="text-white/20">·</span>
          <span className="truncate">{citation.sourceName}</span>
        </div>
      </aside>
    </>
  )
}

const SECTION_ICONS: Record<string, string> = {
  overview: '🏢', financials: '📊', risks: '⚠️', mda: '📋',
}

function SectionCard({
  section,
  citations,
  loading,
  onOpenCitation,
}: {
  section: AnalysisSection
  citations: FilingCitation[]
  loading: boolean
  onOpenCitation: (c: FilingCitation) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const icon = SECTION_ICONS[section.id] || '📄'

  const citedNums = useMemo(() => {
    const pattern = /\[(\d+(?:\s*,\s*\d+)*)\]/g
    const s = new Set<number>()
    let m: RegExpExecArray | null
    while ((m = pattern.exec(section.content)) !== null) {
      m[1].split(',').forEach(n => s.add(parseInt(n.trim(), 10)))
    }
    return s.size
  }, [section.content])

  return (
    <div className="bg-[#0d1628] border border-blue-500/10 rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-blue-500/5 select-none"
        onClick={() => !loading && setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm">{icon}</span>
          <span className="text-white/85 text-sm font-semibold">{section.title}</span>
          {!loading && citedNums > 0 && (
            <span className="inline-flex items-center px-1.5 h-[1.1rem] rounded bg-blue-500/15 border border-blue-400/20 text-blue-200 text-[10px] font-semibold">
              {citedNums} cited
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-blue-400/25 border-t-blue-400 animate-spin" />
          )}
          {!loading && (
            <span className="text-white/25 text-xs">{collapsed ? '▼' : '▲'}</span>
          )}
        </div>
      </div>
      {!collapsed && (
        <div className="px-4 pb-4 border-t border-blue-500/8">
          {loading ? (
            <div className="pt-4 space-y-2.5">
              {[80, 65, 75, 55].map((w, i) => (
                <div key={i} className="h-2.5 bg-white/5 rounded-full animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <div className="pt-3 text-white/75">
              <CitationText text={section.content} citations={citations} onOpen={onOpenCitation} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ACCEPTED_EXTS = ['.pdf', '.docx', '.xlsx', '.pptx']
const MAX_MB = 25

const SECTION_STUBS: AnalysisSection[] = [
  { id: 'overview', title: 'Business Overview & Strategy', content: '' },
  { id: 'financials', title: 'Key Financial Results', content: '' },
  { id: 'risks', title: 'Risk Factors', content: '' },
  { id: 'mda', title: 'MD&A Highlights', content: '' },
]

export default function FilingUploadPanel() {
  const [state, setState] = useState<UploadPhase>({ phase: 'idle' })
  const [dragging, setDragging] = useState(false)
  const [openCitation, setOpenCitation] = useState<FilingCitation | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  function validateFile(file: File): string | null {
    if (file.size > MAX_MB * 1024 * 1024) return `File too large (max ${MAX_MB} MB)`
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    if (!ACCEPTED_EXTS.includes(ext)) return 'Unsupported file type. Upload a PDF, DOCX, XLSX, or PPTX.'
    return null
  }

  const processFile = useCallback(async (file: File) => {
    const err = validateFile(file)
    if (err) { setState({ phase: 'error', message: err }); return }

    setState({ phase: 'uploading', fileName: file.name })

    const formData = new FormData()
    const clientSourceId = `filing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    formData.append('file', file)
    formData.append('sourceId', clientSourceId)
    formData.append('name', file.name)
    formData.append('origin', 'upload')

    let sourceId: string
    let chunkCount: number
    try {
      const res = await fetch('/api/workspaces/ingest', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok || !data.success) {
        const msg =
          data.error === 'file_too_large (max 25 MB)' ? `File too large (max ${MAX_MB} MB)` :
          data.error === 'no_text_extracted' ? 'Could not extract text — is this a scanned-only PDF?' :
          data.error === 'unsupported_type' ? 'Unsupported file type.' :
          data.error || 'Upload failed. Please try again.'
        setState({ phase: 'error', message: msg }); return
      }
      sourceId = data.sourceId as string
      chunkCount = (data.chunkCount as number) ?? 0
    } catch {
      setState({ phase: 'error', message: 'Network error during upload. Please try again.' }); return
    }

    setState({ phase: 'analyzing', fileName: file.name, chunkCount, sections: [] })
    abortRef.current = new AbortController()
    const completedSections: AnalysisSection[] = []

    try {
      const res = await fetch('/api/filings/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const msg = res.status === 503 ? 'AI provider not configured — contact your workspace administrator.' :
          (data as { message?: string; error?: string }).message ||
          (data as { message?: string; error?: string }).error || 'Analysis failed. Please try again.'
        setState({ phase: 'error', message: msg }); return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string
              section?: AnalysisSection
              citations?: FilingCitation[]
              fileName?: string
              chunkCount?: number
              message?: string
            }
            if (evt.type === 'section_done' && evt.section) {
              completedSections.push(evt.section)
              const snap = [...completedSections]
              setState(prev =>
                prev.phase === 'analyzing' ? { ...prev, sections: snap } : prev,
              )
            } else if (evt.type === 'done') {
              setState({
                phase: 'done',
                result: {
                  fileName: evt.fileName ?? file.name,
                  chunkCount: evt.chunkCount ?? chunkCount,
                  sections: completedSections,
                  citations: evt.citations ?? [],
                },
              })
            } else if (evt.type === 'error') {
              setState({ phase: 'error', message: evt.message || 'Analysis failed.' })
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setState({ phase: 'error', message: 'Analysis failed. Please try again.' })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }, [processFile])

  function reset() { abortRef.current?.abort(); setState({ phase: 'idle' }); setOpenCitation(null) }

  const { phase } = state

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-[#080f1e] overflow-hidden mb-5">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-blue-500/15 bg-[#0a1225]">
        <div className="flex items-center gap-2.5">
          <span className="text-sm">📄</span>
          <span className="text-white/85 text-sm font-semibold tracking-tight">Upload a Filing for Instant AI Analysis</span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600/20 text-blue-300 border border-blue-500/25 uppercase tracking-wider">AI</span>
        </div>
        {phase !== 'idle' && (
          <button
            onClick={reset}
            className="text-white/35 hover:text-white/70 text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
          >
            {phase === 'done' || phase === 'error' ? '+ Upload another' : '✕ Cancel'}
          </button>
        )}
      </div>

      <div className="p-5">
        {phase === 'idle' && (
          <div
            onDragEnter={e => { e.preventDefault(); setDragging(true) }}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={e => { e.preventDefault(); setDragging(false) }}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload a filing"
            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed py-12 cursor-pointer transition-all select-none ${
              dragging
                ? 'border-blue-400 bg-blue-500/10'
                : 'border-blue-500/25 hover:border-blue-500/45 hover:bg-blue-500/5'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-3xl">
              📄
            </div>
            <div className="text-center">
              <p className="text-white/80 text-sm font-semibold">
                {dragging ? 'Drop your filing here' : 'Drag & drop a filing, or click to browse'}
              </p>
              <p className="text-white/35 text-xs mt-1.5">
                PDF, DOCX, XLSX, PPTX · Max {MAX_MB} MB · 10-K, 10-Q, CIM, S-1, Annual Report
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {['10-K', '10-Q', '8-K', 'CIM', 'S-1', 'Annual Report'].map(label => (
                <span
                  key={label}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/5 text-white/35 border border-white/10"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {phase === 'uploading' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="w-10 h-10 rounded-full border-2 border-blue-400/25 border-t-blue-400 animate-spin" />
            <div className="text-center">
              <p className="text-white/80 text-sm font-semibold">Uploading & extracting text…</p>
              <p className="text-white/40 text-xs mt-1 truncate max-w-xs">{state.fileName}</p>
            </div>
          </div>
        )}

        {phase === 'analyzing' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-4 h-4 rounded-full border-2 border-blue-400/25 border-t-blue-400 animate-spin flex-shrink-0" />
              <div className="min-w-0 flex items-baseline gap-1.5 flex-wrap">
                <span className="text-white/70 text-sm">Analysing</span>
                <span className="text-white/90 text-sm font-semibold truncate max-w-[240px]">{state.fileName}</span>
                <span className="text-white/35 text-xs">· {state.chunkCount} sections · 4 AI passes running in parallel</span>
              </div>
            </div>
            {SECTION_STUBS.map(stub => {
              const done = state.sections.find(s => s.id === stub.id)
              return (
                <SectionCard
                  key={stub.id}
                  section={done ?? stub}
                  citations={[]}
                  loading={!done}
                  onOpenCitation={setOpenCitation}
                />
              )
            })}
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 text-[9px] font-bold flex-shrink-0">✓</span>
              <span className="text-white/60 text-xs">
                Analysis complete ·{' '}
                <span className="text-white/85 font-semibold">{state.result.fileName}</span>
                <span className="text-white/35 ml-1.5">
                  · {state.result.chunkCount} sections ingested · {state.result.citations.length} citable chunks
                </span>
              </span>
            </div>
            {state.result.sections.map(section => (
              <SectionCard
                key={section.id}
                section={section}
                citations={state.result.citations}
                loading={false}
                onOpenCitation={setOpenCitation}
              />
            ))}
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl">
              ⚠️
            </div>
            <div className="text-center">
              <p className="text-white/80 text-sm font-semibold">Upload failed</p>
              <p className="text-white/45 text-xs mt-1.5 max-w-xs leading-relaxed">{state.message}</p>
            </div>
            <button
              onClick={reset}
              className="px-4 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-200 text-xs font-semibold transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTS.join(',')}
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload filing document"
      />

      <CitationDrawer citation={openCitation} onClose={() => setOpenCitation(null)} />
    </div>
  )
}
