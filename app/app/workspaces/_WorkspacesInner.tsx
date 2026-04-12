"use client"

import { useState, useRef, useCallback, useMemo } from "react"
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

function StudioCard({ output, onDelete }: { output: StudioOutput; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(true)
  const icons: Record<string, string> = { brief: "📋", risks: "⚠️", comparison: "⚖️", summary: "📝" }
  return (
    <div className="bg-[#0f1629] border border-blue-500/10 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-blue-500/5" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span>{icons[output.type]}</span>
          <span className="text-white/80 text-sm font-medium">{output.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/20 text-xs">{new Date(output.generatedAt).toLocaleTimeString()}</span>
          <button onClick={(e) => { e.stopPropagation(); onDelete() }} className="text-white/20 hover:text-red-400 text-xs px-1">✕</button>
          <span className="text-white/30 text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-blue-500/10">
          <pre className="text-white/70 text-xs leading-relaxed whitespace-pre-wrap font-sans mt-3">{output.content}</pre>
        </div>
      )}
    </div>
  )
}

function SourceItem({ source, selected, onToggle, onDelete }: { source: Source; selected: boolean; onToggle: () => void; onDelete: () => void }) {
  const icons: Record<string, string> = { pdf: "📄", url: "🌐", text: "📝", sec: "🏛️" }
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

export default function WorkspacesInner() {
  const [workspace, setWorkspace] = useState<Workspace>({ id: "default", title: "New Research Workspace", sources: [], createdAt: new Date().toISOString() })
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set())
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([])
  const [isAddingSource, setIsAddingSource] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  const [tickerInput, setTickerInput] = useState("")
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"chat" | "studio">("chat")
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState("New Research Workspace")
  const fileRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const activeSources = workspace.sources.filter(s => selectedSources.has(s.id) && s.status === "ready")
  const activeSourceIds = activeSources.map(s => s.id)

  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/workspaces/chat",
    body: { sourceIds: activeSourceIds },
  }), [activeSourceIds.join(",")])

  const { messages, input, handleInputChange, handleSubmit, status, setInput } = useChat({
    transport,
    onError: () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100),
  })

  const addSource = useCallback(async (type: Source["type"], data: { name: string; url?: string; text?: string; file?: File; size?: string }) => {
    const id = Math.random().toString(36).slice(2)
    const newSource: Source = { id, name: data.name, type, status: "processing", size: data.size, addedAt: new Date().toISOString() }
    setWorkspace(w => ({ ...w, sources: [...w.sources, newSource] }))
    setSelectedSources(s => new Set([...s, id]))

    try {
      const formData = new FormData()
      formData.append("sourceId", id)
      formData.append("type", type)
      formData.append("name", data.name)
      if (data.url) formData.append("url", data.url)
      if (data.text) formData.append("text", data.text)
      if (data.file) formData.append("file", data.file)

      const res = await fetch("/api/workspaces/ingest", { method: "POST", body: formData })
      const result = await res.json()

      setWorkspace(w => ({
        ...w,
        sources: w.sources.map(s => s.id === id ? { ...s, status: result.success ? "ready" : "error", chunkCount: result.chunkCount, size: result.size || data.size } : s),
      }))
    } catch {
      setWorkspace(w => ({ ...w, sources: w.sources.map(s => s.id === id ? { ...s, status: "error" } : s) }))
    }
  }, [])

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      addSource("pdf", { name: file.name, file, size: `${(file.size / 1024 / 1024).toFixed(1)}MB` })
    })
    setIsAddingSource(false)
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
        body: JSON.stringify({ type, sourceIds: activeSources.map(s => s.id), sourceNames: activeSources.map(s => s.name) }),
      })
      const data = await res.json()
      setStudioOutputs(prev => [{ id: Math.random().toString(36).slice(2), type, title: `${titles[type]}`, content: data.content || data.error || "Generation failed", generatedAt: new Date().toISOString() }, ...prev])
      setActiveTab("studio")
    } catch (e) {
      setStudioOutputs(prev => [{ id: Math.random().toString(36).slice(2), type, title: titles[type], content: "Error generating output", generatedAt: new Date().toISOString() }, ...prev])
    } finally {
      setIsGenerating(null)
    }
  }

  const toggleSource = (id: string) => setSelectedSources(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const deleteSource = (id: string) => { setWorkspace(w => ({ ...w, sources: w.sources.filter(s => s.id !== id) })); setSelectedSources(prev => { const n = new Set(prev); n.delete(id); return n }) }

  return (
    <div className="flex h-screen bg-[#080d1a] text-white overflow-hidden">
      {/* LEFT: Sources */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-blue-500/10">
        <div className="px-4 py-4 border-b border-blue-500/10">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-blue-300/50 uppercase tracking-widest">Sources</span>
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
              <button onClick={() => fileRef.current?.click()} className="w-full py-1.5 border border-dashed border-blue-500/25 rounded-lg text-blue-300/50 text-xs hover:border-blue-500/50 hover:text-blue-300/80 transition-all">📎 Upload PDF / DOCX / TXT</button>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" multiple className="hidden" onChange={handleFileUpload} />
              <button onClick={() => setIsAddingSource(false)} className="w-full text-white/20 text-xs hover:text-white/40">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setIsAddingSource(true)} className="w-full py-2 bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/20 rounded-xl text-blue-300 text-xs font-medium transition-all">+ Add Source</button>
          )}
        </div>
      </div>

      {/* MIDDLE: Chat / Studio */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-blue-500/10">
        <div className="flex items-center gap-1 px-4 py-3 border-b border-blue-500/10">
          {(["chat", "studio"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize ${activeTab === tab ? "bg-blue-500/20 text-blue-300" : "text-white/30 hover:text-white/60"}`}>
              {tab === "chat" ? "💬 Chat" : `✨ Studio${studioOutputs.length > 0 ? ` (${studioOutputs.length})` : ""}`}
            </button>
          ))}
          <div className="ml-auto">
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
                      <button key={q} onClick={() => setInput(q)} className="text-left px-3 py-2.5 bg-[#0f1629] border border-blue-500/10 hover:border-blue-500/30 rounded-xl text-white/50 text-xs hover:text-white/70 transition-all">{q}</button>
                    ))}
                  </div>
                </div>
              ) : messages.map(msg => {
                const text = msg.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") ?? ""
                return (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold text-blue-300">F</div>}
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${msg.role === "user" ? "bg-blue-500/20 text-white/90 rounded-br-sm" : "bg-[#0f1629] border border-blue-500/10 text-white/80 rounded-bl-sm"}`}>
                    <p className="whitespace-pre-wrap">{text}</p>
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
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input value={input} onChange={handleInputChange}
                  placeholder={activeSources.length > 0 ? `Ask about ${activeSources.slice(0,2).map(s => s.name.split("—")[0].trim()).join(", ")}...` : "Add and select sources first..."}
                  disabled={activeSources.length === 0 || status === "streaming"}
                  className="flex-1 bg-[#0f1629] border border-blue-500/15 hover:border-blue-500/30 focus:border-blue-500/50 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-colors disabled:opacity-40" />
                <button type="submit" disabled={!(input ?? "").trim() || activeSources.length === 0 || status === "streaming"}
                  className="px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 disabled:opacity-30 border border-blue-500/20 rounded-xl text-blue-300 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {studioOutputs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                <span className="text-3xl">✨</span>
                <div><h3 className="text-white/80 font-semibold mb-1">Studio</h3><p className="text-white/30 text-sm max-w-xs">Generate structured outputs from your sources using the panel →</p></div>
              </div>
            ) : studioOutputs.map(o => <StudioCard key={o.id} output={o} onDelete={() => setStudioOutputs(p => p.filter(x => x.id !== o.id))} />)}
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
    </div>
  )
}
