"use client"

import { useState, useRef, useEffect } from "react"
import { createAgentChat } from "@21st-sdk/nextjs"
import { useChat } from "@ai-sdk/react"

// ─── Suggested prompts ────────────────────────────────────────────────────────
const SUGGESTED = [
  { icon: "📊", label: "Revenue breakdown", prompt: "Break down AAPL's revenue by segment for the last 4 quarters with YoY growth rates" },
  { icon: "🔍", label: "Peer comparison", prompt: "Compare NVDA, AMD and INTC on PE ratio, gross margin, revenue growth and market cap" },
  { icon: "🏦", label: "Insider activity", prompt: "Show me recent insider buying and selling for TSLA over the last 3 months" },
  { icon: "📈", label: "Macro snapshot", prompt: "Give me the current US macro picture — GDP growth, inflation, unemployment and PMI" },
  { icon: "📋", label: "Earnings preview", prompt: "What companies are reporting earnings in the next 7 days? Highlight the biggest ones" },
  { icon: "⚖️", label: "ESG analysis", prompt: "What are Microsoft's ESG scores and how do they compare to industry peers?" },
]

// ─── Tool trace visualiser ───────────────────────────────────────────────────
function ToolTrace({ name, input, output }: { name: string; input?: any; output?: string }) {
  const [open, setOpen] = useState(false)
  const icons: Record<string, string> = {
    getLiveQuote: "💹",
    getFinancials: "📊",
    getInsiderTransactions: "🏦",
    getNews: "📰",
    getMacroIndicator: "🌍",
    getEarningsCalendar: "📅",
    comparePeers: "⚖️",
    searchFilings: "📋",
    getESGData: "🌱",
    Bash: "⚡",
    Read: "📖",
    Write: "✍️",
    WebSearch: "🔎",
    WebFetch: "🌐",
  }
  const icon = icons[name] || "🔧"
  return (
    <div className="my-1 rounded-lg border border-white/10 bg-white/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span>{icon}</span>
        <span className="text-xs font-mono text-blue-400">{name}</span>
        {input && (
          <span className="text-xs text-slate-400 truncate">
            ({Object.values(input).join(", ")})
          </span>
        )}
        <span className="ml-auto text-slate-500 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          {input && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Input</div>
              <pre className="text-xs text-slate-300 bg-black/30 rounded p-2 overflow-x-auto">{JSON.stringify(input, null, 2)}</pre>
            </div>
          )}
          {output && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Output</div>
              <pre className="text-xs text-slate-300 bg-black/30 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">{
                (() => { try { return JSON.stringify(JSON.parse(output), null, 2) } catch { return output } })()
              }</pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Message bubble ──────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: any }) {
  const isUser = message.role === "user"
  const parts  = message.parts || (message.content ? [{ type: "text", text: message.content }] : [])

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} mb-4`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold
        ${isUser ? "bg-blue-600 text-white" : "bg-gradient-to-br from-blue-500 to-teal-400 text-white"}`}>
        {isUser ? "U" : "F"}
      </div>

      {/* Content */}
      <div className={`max-w-[80%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {parts.map((part: any, i: number) => {
          if (part.type === "text") {
            return (
              <div key={i}
                className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                  ${isUser
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : "bg-white/8 border border-white/10 text-slate-100 rounded-tl-sm"
                  }`}
              >
                {part.text}
              </div>
            )
          }
          if (part.type === "tool-invocation") {
            const ti = part.toolInvocation
            return (
              <ToolTrace
                key={i}
                name={ti.toolName}
                input={ti.args}
                output={ti.state === "result" ? JSON.stringify(ti.result) : undefined}
              />
            )
          }
          return null
        })}

        {/* Timestamp */}
        <div className="text-xs text-slate-600 px-1">
          {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ResearchPage() {
  const [sandboxId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const chat = createAgentChat({
    agent: "finsyt-intelligence",
    tokenUrl: "/api/an-token",
    // sandboxId is optional on first load — 21st creates one automatically
  })

  const { messages, input, handleInputChange, handleSubmit, status, stop, error } = useChat({ chat })

  const isStreaming = status === "streaming" || status === "submitted"

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendPrompt = (prompt: string) => {
    handleInputChange({ target: { value: prompt } } as any)
    setTimeout(() => {
      const form = document.getElementById("chat-form") as HTMLFormElement
      form?.requestSubmit()
    }, 50)
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0e1a] text-white">

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8 bg-[#0d1120]/80 backdrop-blur flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-sm font-bold">F</div>
        <div>
          <h1 className="font-semibold text-sm">Finsyt Intelligence</h1>
          <p className="text-xs text-slate-400">AI financial analyst · Powered by Claude + EODHD</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isStreaming ? "bg-yellow-400 animate-pulse" : "bg-emerald-400"}`} />
          <span className="text-xs text-slate-400">{isStreaming ? "Thinking..." : "Ready"}</span>
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 pb-24">
            {/* Hero */}
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-3xl mx-auto">🧠</div>
              <h2 className="text-2xl font-bold">Finsyt Intelligence</h2>
              <p className="text-slate-400 max-w-md text-sm leading-relaxed">
                Your AI financial analyst. Ask anything — live quotes, financial statements, insider activity, macro data, peer comparisons, and SEC filings.
              </p>
            </div>

            {/* Suggested prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
              {SUGGESTED.map((s) => (
                <button
                  key={s.label}
                  onClick={() => sendPrompt(s.prompt)}
                  className="flex items-start gap-3 p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-500/50 transition-all text-left group"
                >
                  <span className="text-xl">{s.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-slate-200 group-hover:text-white">{s.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{s.prompt}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {/* Streaming indicator */}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 flex items-center justify-center text-sm font-bold flex-shrink-0">F</div>
            <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white/8 border border-white/10">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-auto max-w-md p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error.message || "Something went wrong. Please try again."}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-4 pb-6 pt-3 border-t border-white/8 bg-[#0d1120]/80 backdrop-blur">
        <form
          id="chat-form"
          onSubmit={handleSubmit}
          className="flex gap-3 max-w-4xl mx-auto"
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about any company, macro indicator, filing, or market trend..."
            disabled={isStreaming}
            className="flex-1 bg-white/8 border border-white/12 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500
              focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
              disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors text-sm font-medium"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                text-white text-sm font-medium transition-colors flex items-center gap-2"
            >
              <span>Send</span>
              <span>→</span>
            </button>
          )}
        </form>
        <p className="text-center text-xs text-slate-600 mt-2">
          Finsyt Intelligence · Data from EODHD, SEC EDGAR · Not financial advice
        </p>
      </div>
    </div>
  )
}
