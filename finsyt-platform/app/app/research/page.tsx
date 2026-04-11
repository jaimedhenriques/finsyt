"use client"

import { useChat } from "@ai-sdk/react"
import { createAgentChat, AgentChat } from "@21st-sdk/nextjs"
import "@21st-sdk/react/styles.css"
import theme from "./theme.json"
import { useState, useEffect } from "react"

const STARTER_PROMPTS = [
  "Deep dive on NVDA — fundamentals, valuation, insider activity",
  "Compare AAPL, MSFT, GOOGL on PE, margins and growth",
  "What's the macro outlook? Give me GDP, CPI and PMI for the US",
  "Show me earnings calendar for the next 2 weeks",
  "Analyse TSLA insider transactions — are executives buying or selling?",
  "Give me META's income statement for the last 5 years",
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
      <div className="border-b border-blue-500/10 px-6 py-4 flex items-center gap-3 bg-[#0a1020]">
        <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a5 5 0 01-7.072 0l-.347-.347z" />
          </svg>
        </div>
        <div>
          <h1 className="text-white font-semibold text-sm tracking-tight">Finsyt Intelligence</h1>
          <p className="text-blue-300/40 text-xs">AI-powered financial analysis · Real-time data</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {status === "streaming" && (
            <div className="flex items-center gap-1.5 text-blue-400/70 text-xs">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
              Analysing...
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-white/30 text-xs">Live</span>
          </div>
        </div>
      </div>

      {/* Welcome / Chat */}
      {!started ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-8">
          {/* Hero */}
          <div className="text-center max-w-lg">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-2 tracking-tight">
              What would you like to analyse?
            </h2>
            <p className="text-blue-200/40 text-sm leading-relaxed">
              Ask anything about stocks, financials, macro data, insider activity, or SEC filings.
              Powered by EODHD real-time data + Claude.
            </p>
          </div>

          {/* Starter prompts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full max-w-3xl">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendPrompt(prompt)}
                className="text-left px-4 py-3 rounded-xl bg-[#0f1629] border border-blue-500/10 hover:border-blue-500/30 hover:bg-[#162040] transition-all duration-150 group"
              >
                <p className="text-white/70 text-xs leading-relaxed group-hover:text-white/90 transition-colors">
                  {prompt}
                </p>
              </button>
            ))}
          </div>

          {/* Capabilities */}
          <div className="flex flex-wrap gap-2 justify-center">
            {["Live quotes", "Financials", "Peer comparison", "Technicals", "Insider data", "News sentiment", "Macro indicators", "SEC filings"].map((cap) => (
              <span key={cap} className="px-2.5 py-1 rounded-full bg-blue-500/8 border border-blue-500/15 text-blue-300/60 text-xs">
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
