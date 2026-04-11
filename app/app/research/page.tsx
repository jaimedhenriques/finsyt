"use client"

import { useChat } from "@ai-sdk/react"
import { useState, useRef, useEffect } from "react"

const FINANCE_PROMPTS = [
  { icon: "📊", label: "Stock deep dive", prompt: "Deep dive on NVDA — fundamentals, valuation, insider activity and news sentiment" },
  { icon: "⚖️", label: "Peer comparison", prompt: "Compare AAPL, MSFT and GOOGL on PE ratio, revenue growth and net margins" },
  { icon: "🌍", label: "Macro overview", prompt: "Give me the current US macro picture — GDP, CPI, unemployment and PMI with trend direction" },
  { icon: "📅", label: "Earnings calendar", prompt: "What major earnings are coming up in the next 2 weeks?" },
  { icon: "🔍", label: "Insider activity", prompt: "Show me TSLA insider transactions — net sentiment, who's buying vs selling" },
  { icon: "📑", label: "SEC filings", prompt: "Find AMZN's latest 10-K filing from SEC EDGAR" },
]

export default function ResearchPage() {
  const { messages, input, handleInputChange, handleSubmit, status, stop, error, setInput } = useChat({
    api: "/api/ai-research",
  })
  const [started, setStarted] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendPrompt = (prompt: string) => {
    setInput(prompt)
    setStarted(true)
    setTimeout(() => {
      const form = document.getElementById("chat-form") as HTMLFormElement
      form?.requestSubmit()
    }, 50)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setStarted(true)
    handleSubmit(e)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0A1628", color: "#E2E8F0" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #1E2D45", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: 0 }}>AI Research</h1>
          <p style={{ fontSize: 12, color: "#5A6B82", margin: 0 }}>Powered by SEC EDGAR · Finnhub · FMP · FRED</p>
        </div>
        {started && (
          <button onClick={() => { setStarted(false); }} style={{ padding: "6px 14px", background: "#131F35", color: "#94A3B8", border: "1px solid #1E2D45", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
            New Chat
          </button>
        )}
      </div>

      {/* Messages / Welcome */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        {!started ? (
          <div style={{ maxWidth: 600, margin: "0 auto", paddingTop: 40 }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div style={{ width: 56, height: 56, background: "linear-gradient(135deg, #1B4FFF, #06B6D4)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>⚡</div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 8 }}>What would you like to research?</h2>
              <p style={{ fontSize: 14, color: "#5A6B82" }}>Ask anything about stocks, filings, macro data, or earnings</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {FINANCE_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => sendPrompt(p.prompt)}
                  style={{ background: "#131F35", border: "1px solid #1E2D45", borderRadius: 10, padding: "14px 16px", textAlign: "left", cursor: "pointer", transition: "border-color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "#1B4FFF")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "#1E2D45")}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{p.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E2E8F0", marginBottom: 4 }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: "#5A6B82", lineHeight: 1.4 }}>{p.prompt.slice(0, 60)}...</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: 20, display: "flex", gap: 12, flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: msg.role === "user" ? "#1B4FFF" : "linear-gradient(135deg, #1B4FFF44, #06B6D444)", border: "1px solid #1E2D45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                  {msg.role === "user" ? "U" : "⚡"}
                </div>
                <div style={{ maxWidth: "80%", background: msg.role === "user" ? "#1B4FFF22" : "#131F35", border: `1px solid ${msg.role === "user" ? "#1B4FFF44" : "#1E2D45"}`, borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: "#E2E8F0", whiteSpace: "pre-wrap" }}>
                    {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
                  </div>
                </div>
              </div>
            ))}
            {status === "streaming" && (
              <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #1B4FFF44, #06B6D444)", border: "1px solid #1E2D45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>⚡</div>
                <div style={{ background: "#131F35", border: "1px solid #1E2D45", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#1B4FFF", animation: `pulse 1s ${i*0.2}s infinite` }} />)}
                  </div>
                </div>
              </div>
            )}
            {error && <div style={{ padding: "12px 16px", background: "#EF444422", border: "1px solid #EF4444", borderRadius: 10, fontSize: 13, color: "#FCA5A5", marginBottom: 16 }}>Error: {error.message}</div>}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid #1E2D45" }}>
        <form id="chat-form" onSubmit={onSubmit} style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 10 }}>
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about any stock, filing, macro data..."
            style={{ flex: 1, background: "#131F35", border: "1px solid #1E2D45", borderRadius: 10, padding: "12px 16px", fontSize: 14, color: "#E2E8F0", outline: "none" }}
            onFocus={e => (e.target.style.borderColor = "#1B4FFF")}
            onBlur={e => (e.target.style.borderColor = "#1E2D45")}
          />
          {status === "streaming" ? (
            <button type="button" onClick={stop} style={{ padding: "12px 20px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Stop</button>
          ) : (
            <button type="submit" disabled={!input.trim()} style={{ padding: "12px 20px", background: "#1B4FFF", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: input.trim() ? 1 : 0.5 }}>Send</button>
          )}
        </form>
      </div>
    </div>
  )
}
