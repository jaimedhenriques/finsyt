"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"

interface Source {
  id: string
  name: string
  type: "pdf" | "url" | "text" | "sec"
  status: "processing" | "ready" | "error"
  chunkCount?: number
  size?: string
  addedAt: string
}

interface Workspace {
  id: string
  title: string
  sources: Source[]
  createdAt: string
}

interface StudioOutput {
  id: string
  type: "brief" | "risks" | "comparison" | "summary"
  title: string
  content: string
  generatedAt: string
}

type ChatTextPart = { type: "text"; text?: string }
type ChatMessageWithParts = {
  id: string
  role: "user" | "assistant" | "system"
  parts?: ChatTextPart[]
}

const STUDIO_TYPES = [
  { type: "brief" as const, icon: "📋", label: "Earnings Brief", desc: "Key numbers, guidance, beats and misses" },
  { type: "summary" as const, icon: "📝", label: "Exec Summary", desc: "TL;DR for investment and ops teams" },
  { type: "risks" as const, icon: "⚠️", label: "Key Risks", desc: "Risk flags from filings and transcripts" },
  { type: "comparison" as const, icon: "⚖️", label: "Comparison Table", desc: "Side-by-side KPI and commentary" },
]

const SOURCE_LABELS: Record<Source["type"], string> = {
  pdf: "PDF",
  url: "URL",
  text: "TEXT",
  sec: "SEC",
}

const SOURCE_ICONS: Record<Source["type"], string> = {
  pdf: "📄",
  url: "🌐",
  text: "📝",
  sec: "🏛️",
}

function messageText(message: ChatMessageWithParts): string {
  if (!Array.isArray(message.parts)) return ""
  return message.parts
    .filter((part): part is ChatTextPart => part?.type === "text")
    .map((part) => part.text ?? "")
    .join("")
}

function StudioCard({ output, onDelete }: { output: StudioOutput; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(true)
  const iconMap: Record<StudioOutput["type"], string> = {
    brief: "📋",
    risks: "⚠️",
    comparison: "⚖️",
    summary: "📝",
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">{iconMap[output.type]}</span>
          <div>
            <div className="text-sm font-semibold text-slate-900">{output.title}</div>
            <div className="text-xs text-slate-500">{new Date(output.generatedAt).toLocaleString()}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
            className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
          >
            Delete
          </button>
          <span className="text-xs text-slate-400">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4">
          <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700">{output.content}</pre>
        </div>
      )}
    </div>
  )
}

function SourceItem({
  source,
  selected,
  onToggle,
  onDelete,
}: {
  source: Source
  selected: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const statusUi: Record<Source["status"], { label: string; className: string }> = {
    processing: { label: "Processing", className: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200" },
    ready: { label: `${source.chunkCount ?? 0} chunks`, className: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" },
    error: { label: "Error", className: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200" },
  }

  return (
    <div
      onClick={onToggle}
      className={`group cursor-pointer rounded-xl border px-3 py-2.5 transition-all ${
        selected
          ? "border-blue-300 bg-blue-50 shadow-[inset_0_0_0_1px_rgba(37,99,235,0.08)]"
          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          onClick={(event) => event.stopPropagation()}
          className="mt-1 h-4 w-4 accent-blue-600"
        />
        <div className="mt-0.5 text-sm">{SOURCE_ICONS[source.type]}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-slate-900">{source.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-600">
              {SOURCE_LABELS[source.type]}
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${statusUi[source.status].className}`}>
              {statusUi[source.status].label}
            </span>
            {source.size && <span className="text-[10px] text-slate-500">{source.size}</span>}
          </div>
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          className="rounded-md px-1.5 py-1 text-[10px] font-bold text-slate-400 opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default function WorkspacesPage() {
  const [workspace, setWorkspace] = useState<Workspace>({
    id: "default",
    title: "Q2 Strategy Workspace",
    sources: [],
    createdAt: new Date().toISOString(),
  })
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([])
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [tickerInput, setTickerInput] = useState("")
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"chat" | "studio">("chat")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState(workspace.title)
  const fileRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const activeSources = workspace.sources.filter((source) => selectedSources.has(source.id) && source.status === "ready")
  const activeSourceIds = activeSources.map((source) => source.id)
  const sourceIdsKey = activeSourceIds.join(",")

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/workspaces/chat",
        body: { sourceIds: sourceIdsKey ? sourceIdsKey.split(",") : [] },
      }),
    [sourceIdsKey],
  )

  const { messages, input, handleInputChange, handleSubmit, status, setInput } = useChat({
    transport,
    onError: () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 90),
  })

  const addSource = useCallback(
    async (type: Source["type"], data: { name: string; url?: string; text?: string; file?: File; size?: string }) => {
      const id = Math.random().toString(36).slice(2)
      const newSource: Source = {
        id,
        name: data.name,
        type,
        status: "processing",
        size: data.size,
        addedAt: new Date().toISOString(),
      }
      setWorkspace((prev) => ({ ...prev, sources: [...prev.sources, newSource] }))
      setSelectedSources((prev) => new Set([...prev, id]))

      try {
        const formData = new FormData()
        formData.append("sourceId", id)
        formData.append("type", type)
        formData.append("name", data.name)
        if (data.url) formData.append("url", data.url)
        if (data.text) formData.append("text", data.text)
        if (data.file) formData.append("file", data.file)

        const response = await fetch("/api/workspaces/ingest", { method: "POST", body: formData })
        const result = await response.json()
        setWorkspace((prev) => ({
          ...prev,
          sources: prev.sources.map((source) =>
            source.id === id
              ? {
                  ...source,
                  status: result.success ? "ready" : "error",
                  chunkCount: result.chunkCount,
                  size: result.size || data.size,
                }
              : source,
          ),
        }))
      } catch {
        setWorkspace((prev) => ({
          ...prev,
          sources: prev.sources.map((source) => (source.id === id ? { ...source, status: "error" } : source)),
        }))
      }
    },
    [],
  )

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(event.target.files || []).forEach((file) => {
      addSource("pdf", {
        name: file.name,
        file,
        size: `${(file.size / 1024 / 1024).toFixed(1)}MB`,
      })
    })
    setIsAddingSource(false)
  }

  const handleAddUrl = () => {
    if (!urlInput.trim()) return
    try {
      new URL(urlInput)
    } catch {
      return
    }
    const name = urlInput.replace(/^https?:\/\//, "").slice(0, 58)
    addSource("url", { name, url: urlInput })
    setUrlInput("")
    setIsAddingSource(false)
  }

  const handleAddSEC = () => {
    if (!tickerInput.trim()) return
    const ticker = tickerInput.toUpperCase().trim()
    addSource("sec", {
      name: `${ticker} — Latest 10-K`,
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=10-K&dateb=&owner=include&count=5&search_text=`,
    })
    addSource("sec", {
      name: `${ticker} — Latest 10-Q`,
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=10-Q&dateb=&owner=include&count=5&search_text=`,
    })
    setTickerInput("")
    setIsAddingSource(false)
  }

  const generateStudio = async (type: StudioOutput["type"]) => {
    if (!activeSources.length) return
    setIsGenerating(type)
    const titles: Record<StudioOutput["type"], string> = {
      brief: "Earnings Brief",
      summary: "Executive Summary",
      risks: "Key Risks",
      comparison: "Comparison Table",
    }

    try {
      const response = await fetch("/api/workspaces/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          sourceIds: activeSources.map((source) => source.id),
          sourceNames: activeSources.map((source) => source.name),
        }),
      })
      const data = await response.json()
      setStudioOutputs((prev) => [
        {
          id: Math.random().toString(36).slice(2),
          type,
          title: titles[type],
          content: data.content || data.error || "Generation failed",
          generatedAt: new Date().toISOString(),
        },
        ...prev,
      ])
      setActiveTab("studio")
    } catch {
      setStudioOutputs((prev) => [
        {
          id: Math.random().toString(36).slice(2),
          type,
          title: titles[type],
          content: "Error generating output",
          generatedAt: new Date().toISOString(),
        },
        ...prev,
      ])
    } finally {
      setIsGenerating(null)
    }
  }

  const toggleSource = (id: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const deleteSource = (id: string) => {
    setWorkspace((prev) => ({
      ...prev,
      sources: prev.sources.filter((source) => source.id !== id),
    }))
    setSelectedSources((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const emptyChatState = (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-2xl shadow-sm">🔬</div>
      <div>
        <h3 className="text-base font-semibold text-slate-900">Ask grounded research questions</h3>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          Select data sources from the left, then ask for summaries, comparisons, and risk analysis with citations.
        </p>
      </div>
      <div className="grid w-full max-w-xl grid-cols-1 gap-2.5 sm:grid-cols-2">
        {[
          "What are the key revenue drivers this quarter?",
          "Summarise principal risk factors.",
          "How did guidance change vs prior quarter?",
          "Compare margins year-over-year.",
        ].map((question) => (
          <button
            key={question}
            onClick={() => setInput(question)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-slate-600 shadow-sm transition-all hover:border-blue-200 hover:bg-blue-50/40 hover:text-slate-900"
          >
            {question}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 gap-4 bg-slate-50 p-4">
      <aside className="flex w-[300px] min-w-[300px] flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Research sources</span>
            <button
              onClick={() =>
                setSelectedSources(new Set(workspace.sources.filter((source) => source.status === "ready").map((source) => source.id)))
              }
              className="text-[11px] font-semibold text-blue-600 transition-colors hover:text-blue-700"
            >
              Select ready
            </button>
          </div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(event) => setTitleValue(event.target.value)}
              onBlur={() => {
                setWorkspace((prev) => ({ ...prev, title: titleValue || prev.title }))
                setEditingTitle(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setWorkspace((prev) => ({ ...prev, title: titleValue || prev.title }))
                  setEditingTitle(false)
                }
              }}
              className="w-full border-b border-blue-300 bg-transparent pb-0.5 text-sm font-semibold text-slate-900 outline-none"
            />
          ) : (
            <h2 onClick={() => setEditingTitle(true)} className="cursor-text truncate text-sm font-semibold text-slate-900">
              {workspace.title}
            </h2>
          )}
          <p className="mt-1 text-xs text-slate-500">
            {workspace.sources.length} total · {activeSources.length} active
          </p>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {!workspace.sources.length ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <p className="text-xs leading-relaxed text-slate-500">Add PDFs, URLs, or SEC filings to start grounded analysis.</p>
            </div>
          ) : (
            workspace.sources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                selected={selectedSources.has(source.id)}
                onToggle={() => toggleSource(source.id)}
                onDelete={() => deleteSource(source.id)}
              />
            ))
          )}
        </div>

        <div className="space-y-2 border-t border-slate-100 px-3 py-3">
          {isAddingSource ? (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
              <div className="flex gap-1.5">
                <input
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="Paste a URL"
                  onKeyDown={(event) => event.key === "Enter" && handleAddUrl()}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none ring-blue-400 transition focus:border-blue-300 focus:ring-2"
                />
                <button onClick={handleAddUrl} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500">
                  Add
                </button>
              </div>
              <div className="flex gap-1.5">
                <input
                  value={tickerInput}
                  onChange={(event) => setTickerInput(event.target.value)}
                  placeholder="Ticker (NVDA)"
                  onKeyDown={(event) => event.key === "Enter" && handleAddSEC()}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none ring-blue-400 transition focus:border-blue-300 focus:ring-2"
                />
                <button onClick={handleAddSEC} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800">
                  SEC
                </button>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Upload PDF / DOCX / TXT
              </button>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" multiple className="hidden" onChange={handleFileUpload} />
              <button onClick={() => setIsAddingSource(false)} className="w-full text-xs font-semibold text-slate-500 hover:text-slate-700">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingSource(true)}
              className="w-full rounded-xl border border-blue-200 bg-blue-50 py-2.5 text-xs font-semibold text-blue-700 transition-all hover:border-blue-300 hover:bg-blue-100"
            >
              + Add source
            </button>
          )}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          {(["chat", "studio"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                activeTab === tab ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {tab === "chat" ? "💬 Chat" : `✨ Studio ${studioOutputs.length ? `(${studioOutputs.length})` : ""}`}
            </button>
          ))}
          <div className="ml-auto rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {activeSources.length ? `${activeSources.length} active source${activeSources.length > 1 ? "s" : ""}` : "No active sources"}
          </div>
        </div>

        {activeTab === "chat" ? (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-5 py-5">
              {!messages.length
                ? emptyChatState
                : (messages as ChatMessageWithParts[]).map((message) => {
                    const text = messageText(message)
                    const isUser = message.role === "user"
                    return (
                      <div key={message.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                        {!isUser && (
                          <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white shadow-sm">
                            F
                          </div>
                        )}
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                            isUser
                              ? "rounded-br-sm bg-blue-600 text-white"
                              : "rounded-bl-sm border border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{text}</p>
                        </div>
                      </div>
                    )
                  })}
              {status === "streaming" && (
                <div className="flex gap-3">
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-xs font-bold text-white shadow-sm">F</div>
                  <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      {[0, 150, 300].map((delay) => (
                        <div key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500/70" style={{ animationDelay: `${delay}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-slate-100 bg-white px-4 py-3">
              {!activeSources.length && (
                <p className="mb-2 text-center text-xs font-medium text-slate-500">Select one or more sources to enable grounded chat.</p>
              )}
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  value={input}
                  onChange={handleInputChange}
                  placeholder={
                    activeSources.length
                      ? `Ask about ${activeSources
                          .slice(0, 2)
                          .map((source) => source.name.split("—")[0].trim())
                          .join(", ")}...`
                      : "Add and select sources first..."
                  }
                  disabled={!activeSources.length || status === "streaming"}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-200 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!(input ?? "").trim() || !activeSources.length || status === "streaming"}
                  className="rounded-xl bg-blue-600 px-4 py-3 text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
            {!studioOutputs.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <span className="text-4xl">✨</span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">No generated outputs yet</h3>
                  <p className="text-sm text-slate-500">Use Studio actions on the right to generate briefs and comparisons.</p>
                </div>
              </div>
            ) : (
              studioOutputs.map((output) => (
                <StudioCard key={output.id} output={output} onDelete={() => setStudioOutputs((prev) => prev.filter((item) => item.id !== output.id))} />
              ))
            )}
          </div>
        )}
      </section>

      <aside className="flex w-[260px] min-w-[260px] flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Studio actions</div>
          <div className="mt-1 text-xs text-slate-500">Generate analyst-ready outputs from selected sources.</div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {STUDIO_TYPES.map(({ type, icon, label, desc }) => (
            <button
              key={type}
              onClick={() => generateStudio(type)}
              disabled={!activeSources.length || Boolean(isGenerating)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50 disabled:opacity-40"
            >
              <div className="mb-1 flex items-center gap-2">
                <span>{icon}</span>
                <span className="text-xs font-semibold text-slate-900">{label}</span>
                {isGenerating === type && <span className="ml-auto text-xs font-semibold text-blue-600">⏳</span>}
              </div>
              <p className="text-[11px] text-slate-500">{desc}</p>
            </button>
          ))}
        </div>
        <div className="space-y-1.5 border-t border-slate-100 px-3 py-3">
          {[
            ["Sources", workspace.sources.length, "text-slate-700"],
            ["Active", activeSources.length, "text-emerald-700"],
            ["Chunks", activeSources.reduce((sum, source) => sum + (source.chunkCount || 0), 0), "text-slate-700"],
            ["Outputs", studioOutputs.length, "text-slate-700"],
          ].map(([label, value, className]) => (
            <div key={label as string} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{label}</span>
              <span className={`font-semibold ${className as string}`}>{value}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
