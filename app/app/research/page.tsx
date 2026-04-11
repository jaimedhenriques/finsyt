"use client"

import { useChat } from "@ai-sdk/react"
import { createAgentChat, AgentChat } from "@21st-sdk/nextjs"
import "@21st-sdk/react/styles.css"
import theme from "./theme.json"
import { useState, useEffect } from "react"

const FINANCE_PROMPTS = [
  { icon: "📊", label: "Stock deep dive", prompt: "Deep dive on NVDA — fundamentals, valuation, insider activity and news sentiment" },
  { icon: "⚖️", label: "Peer comparison", prompt: "Compare AAPL, MSFT and GOOGL on PE ratio, revenue growth and net margins" },
  { icon: "🌍", label: "Macro overview", prompt: "Give me the current US macro picture — GDP, CPI, unemployment and PMI with trend direction" },
  { icon: "📅", label: "Earnings calendar", prompt: "What major earnings are coming up in the next 2 weeks?" },
  { icon: "🔍", label: "Insider activity", prompt: "Show me TSLA insider transactions — net sentiment, who's buying vs selling" },
  { icon: "📑", label: "SEC filings", prompt: "Find AMZN's latest 10-K filing from SEC EDGAR" },
]

const MAGIC_PROMPTS = [
  { icon: "✨", label: "Build a widget", prompt: "/ui build a real-time stock price card with change indicator, market cap and 52-week range for Finsyt" },
  { icon: "📈", label: "Chart component", prompt: "/ui create a financial line chart component with candlestick toggle and volume bars, dark theme" },
  { icon: "🏦", label: "Earnings table", prompt: "/ui design an earnings calendar table with beat/miss indicators, EPS estimates vs actual" },
  { icon: "🎨", label: "Dashboard panel", prompt: "/ui build a macro indicators dashboard panel showing GDP, CPI, unemployment as gauge charts" },
]

function createChat() {
  return createAgentChat({
    agent: "finsyt-intelligence",
    tokenUrl: "/api/an-token",
  })
}

export default function ResearchPage() {
  const [chat] = useState(() => createChat())
  const { messages, handleSubmit, status, stop, error } = useChat({ chat })
  const [started, setStarted] = useState(false)
  const [activeTab, setActiveTab] = useState<"finance" | "magic">("finance")

  useEffect(() => {
    if (messages.length > 0) setStarted(true)
  }, [messages])

  const sendPrompt = (prompt: string) => {
    setStarted(true)
    handleSubmit(undefined, { body: { content: prompt } })
  }

  return (
    <div className="flex flex-col h-screen bg-[#080d1a]">
      {/* Header */}
      <div className="border-b border-blue-500/10 px-6 py-4 flex items-center gap-3 bg-[#080d1a]/95 backdrop-blur-sm">
        <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a5 5 0 01-7.072 0l-.347-.347z" />
          </svg>
        </div>
        <div>
          <h1 className="text-white font-semibold text-sm tracking-tight">Finsyt Intelligence</h1>
          <p className="text-blue-300/40 text-xs">Financial analysis · UI generation · Real-time data</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {status === "streaming" && (
            <div className="flex items-center gap-1.5 text-blue-400/70 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              Thinking...
            </div>
          )}
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-white/30">Live data</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
              <span className="text-white/30">Magic UI</span>
            </div>
          </div>
        </div>
      </div>

      {/* Welcome / Chat */}
      {!started ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8 overflow-y-auto py-8">
          {/* Hero */}
          <div className="text-center max-w-xl">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2 tracking-tight">
              What would you like to do?
            </h2>
            <p className="text-blue-200/40 text-sm leading-relaxed">
              Analyse stocks, run financial models, and build UI components — all in one place.
              Use <span className="text-purple-400/80 font-mono text-xs bg-purple-500/10 px-1.5 py-0.5 rounded">/ui</span> to trigger Magic component generation.
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 p-1 bg-[#0f1629] rounded-xl border border-blue-500/10">
            <button
              onClick={() => setActiveTab("finance")}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === "finance"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/25"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              📊 Financial Analysis
            </button>
            <button
              onClick={() => setActiveTab("magic")}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === "magic"
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/25"
                  : "text-white/40 hover:text-white/60"
              }`}
            >
              ✨ Magic UI Builder
            </button>
          </div>

          {/* Prompts grid */}
          {activeTab === "finance" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
              {FINANCE_PROMPTS.map((item) => (
                <button
                  key={item.prompt}
                  onClick={() => sendPrompt(item.prompt)}
                  className="text-left px-4 py-3.5 rounded-xl bg-[#0f1629] border border-blue-500/10 hover:border-blue-500/30 hover:bg-[#162040] transition-all duration-150 group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{item.icon}</span>
                    <span className="text-blue-300/60 text-xs font-medium group-hover:text-blue-300/80">{item.label}</span>
                  </div>
                  <p className="text-white/50 text-xs leading-relaxed group-hover:text-white/70 transition-colors line-clamp-2">
                    {item.prompt}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              {MAGIC_PROMPTS.map((item) => (
                <button
                  key={item.prompt}
                  onClick={() => sendPrompt(item.prompt)}
                  className="text-left px-4 py-3.5 rounded-xl bg-[#0f1629] border border-purple-500/15 hover:border-purple-500/35 hover:bg-[#1a1040] transition-all duration-150 group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">{item.icon}</span>
                    <span className="text-purple-300/60 text-xs font-medium group-hover:text-purple-300/80">{item.label}</span>
                  </div>
                  <p className="text-white/50 text-xs leading-relaxed group-hover:text-white/70 transition-colors line-clamp-2">
                    {item.prompt}
                  </p>
                </button>
              ))}
              <div className="col-span-full px-4 py-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center">
                <p className="text-purple-300/50 text-xs">
                  Type <span className="font-mono bg-purple-500/15 px-1.5 py-0.5 rounded text-purple-300/70">/ui [description]</span> anytime to generate 5 component variants with Magic
                </p>
              </div>
            </div>
          )}

          {/* Capability chips */}
          <div className="flex flex-wrap gap-2 justify-center max-w-2xl">
            {[
              "Live quotes", "Financials", "Peer comparison", "Technicals",
              "Insider data", "News sentiment", "Macro indicators", "SEC filings",
              "Component generation", "SVG icon search", "5 UI variants",
            ].map((cap) => (
              <span key={cap} className="px-2.5 py-1 rounded-full bg-blue-500/6 border border-blue-500/12 text-blue-300/50 text-xs">
                {cap}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <AgentChat
            messages={messages}
            onSend={(msg) => handleSubmit(undefined, { body: msg })}
            status={status}
            onStop={stop}
            error={error ?? undefined}
            colorMode="dark"
            theme={theme}
          />
        </div>
      )}
    </div>
  )
}
