"use client"

import { useState, useRef, useEffect, useCallback } from "react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message { id: string; role: "user" | "assistant"; content: string; ts: number }

// ─── Prompt library ───────────────────────────────────────────────────────────
const PROMPT_LIBRARY = [
  {
    category: "Company Analysis", icon: "🏢", color: "#1B4FFF",
    prompts: [
      { label: "Deep dive", text: "Full deep dive on NVDA — revenue model, margins, valuation vs peers, recent catalysts, key risks, analyst consensus" },
      { label: "Earnings breakdown", text: "Analyze AAPL's last earnings report — beat/miss vs estimates, key metrics, guidance, and stock reaction" },
      { label: "Bull vs bear", text: "What's the bull case and bear case for TSLA? Give me 3 arguments each with supporting data" },
    ],
  },
  {
    category: "Competitive Intel", icon: "⚔️", color: "#7C3AED",
    prompts: [
      { label: "Peer comparison", text: "Compare MSFT vs GOOGL vs AMZN on cloud revenue, growth rates, operating margins, and market position" },
      { label: "Market share", text: "How is NVDA's GPU market share trending vs AMD and Intel? Who are the biggest threats?" },
      { label: "SWOT analysis", text: "Do a detailed SWOT analysis for AAPL using the latest available data and filings" },
    ],
  },
  {
    category: "SEC Filings", icon: "📑", color: "#0891B2",
    prompts: [
      { label: "10-K summary", text: "Summarize AMZN's latest 10-K — business model, revenue drivers, risk factors, and MD&A highlights" },
      { label: "Risk factors", text: "Extract and rank the top 10 risk factors from META's latest 10-K by severity and likelihood" },
      { label: "Red flags", text: "Scan TSLA's recent SEC filings for red flags — accounting changes, auditor concerns, related-party transactions" },
    ],
  },
  {
    category: "Macro & Markets", icon: "🌍", color: "#059669",
    prompts: [
      { label: "US macro snapshot", text: "Give me the current US macro picture — GDP growth, CPI trend, unemployment rate, PMI readings, and Fed outlook" },
      { label: "Sector rotation", text: "Where is smart money rotating right now? Map the current macro regime to sector implications" },
      { label: "Rate sensitivity", text: "Which S&P 500 sectors benefit most from the current interest rate environment and why?" },
    ],
  },
  {
    category: "Private Markets", icon: "🏗️", color: "#D97706",
    prompts: [
      { label: "Startup discovery", text: "Find AI infrastructure startups in the US with $50M–$500M in funding raised since 2022 — include founders, investors, traction signals" },
      { label: "M&A targets", text: "Identify potential acquisition targets in fintech — profitable, sub-$500M revenue, strategic fit for a large acquirer" },
      { label: "VC activity", text: "What's the latest venture activity in AI? Show recent rounds, notable investors, and emerging themes" },
    ],
  },
  {
    category: "Screening", icon: "🔍", color: "#E11D48",
    prompts: [
      { label: "Value screen", text: "Screen for US value stocks: P/E under 15, revenue growth over 8%, positive FCF, debt/equity under 1x, market cap $1B+" },
      { label: "Momentum screen", text: "Find stocks with strong price momentum, earnings beats for 3+ consecutive quarters, and rising analyst estimates" },
      { label: "Insider buying", text: "Which S&P 500 companies have seen the most significant insider buying in the past 30 days? Show dollar amounts" },
    ],
  },
]

// ─── Agentic step indicator ───────────────────────────────────────────────────
const RESEARCH_STEPS = [
  "Parsing query…",
  "Searching SEC EDGAR…",
  "Fetching market data…",
  "Querying FRED macro…",
  "Cross-referencing sources…",
  "Synthesising answer…",
]

const SUGGESTED = [
  { icon: "📊", text: "NVDA deep dive" },
  { icon: "📑", text: "AAPL 10-K summary" },
  { icon: "🌍", text: "US macro outlook" },
  { icon: "⚔️", text: "MSFT vs GOOGL cloud" },
  { icon: "🏗️", text: "AI startup funding" },
  { icon: "🔍", text: "Value stock screen" },
  { icon: "📅", text: "Earnings calendar" },
  { icon: "💹", text: "Insider buying" },
]

function getSourceBadges(content: string): string[] {
  const sources: string[] = []
  if (/SEC|EDGAR|10-K|10-Q|8-K|filing/i.test(content)) sources.push("SEC EDGAR")
  if (/revenue|earnings|EPS|margin|balance sheet|income statement/i.test(content)) sources.push("Financials")
  if (/price|market cap|52.week|P\/E|P\/S|EV\/EBITDA/i.test(content)) sources.push("Market Data")
  if (/GDP|CPI|Fed|inflation|unemployment|PMI|FRED/i.test(content)) sources.push("FRED Macro")
  if (/announced|reported|news|said|according/i.test(content)) sources.push("News")
  return sources
}

const SOURCE_COLORS: Record<string, string> = {
  "SEC EDGAR": "#1B4FFF", "Financials": "#059669",
  "Market Data": "#7C3AED", "FRED Macro": "#D97706", "News": "#0891B2",
}

// ─── Inline markdown renderer (no extra deps) ─────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n")
  const nodes: React.ReactNode[] = []
  let key = 0
  let tableRows: string[][] = []
  let tableHeader: string[] = []
  let inTable = false

  const flushTable = () => {
    if (!inTable) return
    nodes.push(
      <div key={key++} style={{ overflowX: "auto", marginBottom: 14 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{tableHeader.map((h, i) => <th key={i} style={{ padding: "7px 12px", background: "rgba(27,79,255,0.1)", border: "1px solid rgba(255,255,255,0.07)", textAlign: "left", color: "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 11, letterSpacing: "0.05em" }}>{h.trim()}</th>)}</tr>
          </thead>
          <tbody>
            {tableRows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                {row.map((cell, j) => <td key={j} style={{ padding: "7px 12px", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.8)" }}>{cell.trim()}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    inTable = false; tableRows = []; tableHeader = []
  }

  const inlineFormat = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = []
    let remaining = text; let k = 0
    while (remaining.length > 0) {
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      const codeMatch = remaining.match(/`(.+?)`/)
      const firstIdx = Math.min(boldMatch ? remaining.indexOf("**") : Infinity, codeMatch ? remaining.indexOf("`") : Infinity)
      if (firstIdx === Infinity) { parts.push(remaining); break }
      if (firstIdx > 0) parts.push(remaining.slice(0, firstIdx))
      if (boldMatch && remaining.indexOf("**") === firstIdx) {
        parts.push(<strong key={k++} style={{ color: "#fff", fontWeight: 700 }}>{boldMatch[1]}</strong>)
        remaining = remaining.slice(firstIdx + boldMatch[0].length)
      } else if (codeMatch && remaining.indexOf("`") === firstIdx) {
        parts.push(<code key={k++} style={{ background: "rgba(27,79,255,0.12)", border: "1px solid rgba(27,79,255,0.2)", borderRadius: 4, padding: "1px 5px", fontSize: 12, color: "#93B4FF", fontFamily: "monospace" }}>{codeMatch[1]}</code>)
        remaining = remaining.slice(firstIdx + codeMatch[0].length)
      } else break
    }
    return <>{parts}</>
  }

  lines.forEach(line => {
    if (line.startsWith("|")) {
      const cells = line.split("|").filter((c, i, a) => i > 0 && i < a.length - 1)
      if (!inTable) { inTable = true; tableHeader = cells }
      else if (/^[\s\-|]+$/.test(line)) { /* separator */ }
      else tableRows.push(cells)
      return
    } else { flushTable() }

    if (line.startsWith("### ")) nodes.push(<h3 key={key++} style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6, marginTop: 14 }}>{inlineFormat(line.slice(4))}</h3>)
    else if (line.startsWith("## ")) nodes.push(<h2 key={key++} style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 8, marginTop: 16 }}>{inlineFormat(line.slice(3))}</h2>)
    else if (line.startsWith("# ")) nodes.push(<h1 key={key++} style={{ fontSize: 18, fontWeight: 900, color: "#fff", marginBottom: 10, marginTop: 16 }}>{inlineFormat(line.slice(2))}</h1>)
    else if (line.startsWith("- ") || line.startsWith("* ")) nodes.push(<div key={key++} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}><span style={{ color: "#1B4FFF", marginTop: 1, flexShrink: 0 }}>•</span><span style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.6, fontSize: 14 }}>{inlineFormat(line.slice(2))}</span></div>)
    else if (/^\d+\. /.test(line)) { const m = line.match(/^(\d+)\. (.*)/)!; nodes.push(<div key={key++} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 4 }}><span style={{ color: "#1B4FFF", fontWeight: 700, flexShrink: 0, width: 16, fontSize: 13 }}>{m[1]}.</span><span style={{ color: "rgba(255,255,255,0.82)", lineHeight: 1.6, fontSize: 14 }}>{inlineFormat(m[2])}</span></div>) }
    else if (line.startsWith("> ")) nodes.push(<blockquote key={key++} style={{ borderLeft: "3px solid #1B4FFF", paddingLeft: 12, margin: "8px 0", color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{inlineFormat(line.slice(2))}</blockquote>)
    else if (line.trim() === "") nodes.push(<div key={key++} style={{ height: 8 }} />)
    else nodes.push(<p key={key++} style={{ marginBottom: 8, color: "rgba(255,255,255,0.82)", lineHeight: 1.75, fontSize: 14 }}>{inlineFormat(line)}</p>)
  })
  flushTable()
  return nodes
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ResearchPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [query, setQuery] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState("")
  const [agentSteps, setAgentSteps] = useState<number>(-1)
  const [showPromptLib, setShowPromptLib] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const promptLibRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, streamingContent, agentSteps])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (promptLibRef.current && !promptLibRef.current.contains(e.target as Node)) setShowPromptLib(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const submit = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim(), ts: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setQuery("")
    setIsLoading(true)
    setStreamingContent("")
    setAgentSteps(0)
    setShowPromptLib(false)

    // Animate through agentic steps
    RESEARCH_STEPS.forEach((_, i) => {
      setTimeout(() => setAgentSteps(i), i * 550)
    })

    abortRef.current = new AbortController()
    try {
      const history = messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
      const res = await fetch("/api/ai-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text.trim(), messages: history }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const ct = res.headers.get("content-type") || ""
      let finalContent = ""

      if (ct.includes("text/event-stream") || ct.includes("text/plain")) {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value)
          // Handle SSE or plain text
          const lines = chunk.split("\n")
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") continue
              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta?.content || parsed.text || ""
                finalContent += delta
                setStreamingContent(finalContent)
              } catch { finalContent += data; setStreamingContent(finalContent) }
            } else if (line && !line.startsWith("data:")) {
              finalContent += line; setStreamingContent(finalContent)
            }
          }
        }
      } else {
        const json = await res.json()
        finalContent = json.response || json.text || json.content || JSON.stringify(json)
      }

      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: finalContent, ts: Date.now() }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errMsg: Message = { id: (Date.now() + 1).toString(), role: "assistant", content: `⚠️ ${err.message || "Something went wrong. Please try again."}`, ts: Date.now() }
        setMessages(prev => [...prev, errMsg])
      }
    } finally {
      setIsLoading(false)
      setStreamingContent("")
      setAgentSteps(-1)
    }
  }, [isLoading, messages])

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(query) }
  }

  const hasMessages = messages.length > 0

  return (
    <div style={{ display: "flex", height: "100%", background: "#07101F", overflow: "hidden" }}>
      <style>{`
        @keyframes fadeSlideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulseDot { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
        @keyframes spin { to{transform:rotate(360deg);} }
        .msg-in { animation: fadeSlideUp 0.3s ease; }
        .step-in { animation: fadeSlideUp 0.2s ease; }
        .promptlib::-webkit-scrollbar { width:3px; }
        .promptlib::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.08); border-radius:3px; }
        .msglist::-webkit-scrollbar { width:4px; }
        .msglist::-webkit-scrollbar-thumb { background:rgba(27,79,255,0.15); border-radius:4px; }
        textarea::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>

      {/* ── PROMPT LIBRARY PANEL ── */}
      <div ref={promptLibRef} style={{ width: showPromptLib ? 288 : 0, minWidth: showPromptLib ? 288 : 0, overflow: "hidden", background: "#0A1525", borderRight: "1px solid rgba(255,255,255,0.05)", transition: "all 0.25s cubic-bezier(0.4,0,0.2,1)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)" }}>PROMPT LIBRARY</span>
          <button onClick={() => setShowPromptLib(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.25)", padding: 2, display: "flex" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="promptlib" style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
          {PROMPT_LIBRARY.map(cat => (
            <div key={cat.category} style={{ marginBottom: 2 }}>
              <button
                onClick={() => setActiveCategory(activeCategory === cat.category ? null : cat.category)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, background: activeCategory === cat.category ? `${cat.color}12` : "transparent", border: `1px solid ${activeCategory === cat.category ? `${cat.color}25` : "transparent"}`, cursor: "pointer", color: activeCategory === cat.category ? "#fff" : "rgba(255,255,255,0.45)", fontFamily: "inherit", transition: "all 0.15s" }}
              >
                <span style={{ fontSize: 13 }}>{cat.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1, textAlign: "left" }}>{cat.category}</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition: "transform 0.2s", transform: activeCategory === cat.category ? "rotate(180deg)" : "none" }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {activeCategory === cat.category && cat.prompts.map((p, i) => (
                <button key={i}
                  onClick={() => { setQuery(p.text); setShowPromptLib(false); inputRef.current?.focus() }}
                  style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 7, padding: "6px 10px 6px 14px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: "rgba(255,255,255,0.45)", fontFamily: "inherit", transition: "all 0.12s" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)" }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.45)" }}
                >
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: cat.color, marginTop: 6, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, lineHeight: 1.5 }}>{p.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header bar */}
        <div style={{ flexShrink: 0, height: 50, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setShowPromptLib(p => !p)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: showPromptLib ? "rgba(27,79,255,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${showPromptLib ? "rgba(27,79,255,0.25)" : "rgba(255,255,255,0.07)"}`, borderRadius: 7, color: showPromptLib ? "#93B4FF" : "rgba(255,255,255,0.4)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 500 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h8M4 18h12"/></svg>
              Prompt library
            </button>
            {hasMessages && (
              <button onClick={() => setMessages([])}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 7, color: "rgba(255,255,255,0.35)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 4v16m8-8H4"/></svg>
                New search
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981", animation: "pulseDot 2s infinite" }} />
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontWeight: 500, letterSpacing: "0.03em" }}>EDGAR · FMP · FRED · EODHD</span>
          </div>
        </div>

        {/* Messages / Hero */}
        <div className="msglist" style={{ flex: 1, overflowY: "auto", padding: hasMessages ? "28px 28px 0" : 0 }}>
          {!hasMessages ? (
            // ── HERO ─────────────────────────────────────────────────────────
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: "0 24px", animation: "fadeSlideUp 0.5s ease" }}>
              <div style={{ marginBottom: 20, position: "relative" }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#1B4FFF,#06B6D4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 26, boxShadow: "0 0 48px rgba(27,79,255,0.25)" }}>F</div>
                <div style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "linear-gradient(135deg,#7C3AED,#EC4899)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(124,58,237,0.4)" }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M12 2l2.09 6.26L20 9.27l-4 3.87.94 5.46L12 16l-4.94 2.6.94-5.46-4-3.87 5.91-.01L12 2z"/></svg>
                </div>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 8, letterSpacing: "-0.03em", textAlign: "center" }}>What do you want to research?</h1>
              <p style={{ fontSize: 13.5, color: "rgba(255,255,255,0.35)", marginBottom: 28, textAlign: "center", maxWidth: 460, lineHeight: 1.6 }}>
                Search SEC filings, live market data, macro indicators, private company databases, and news — synthesised into a source-cited answer in seconds.
              </p>

              {/* Suggested chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center", maxWidth: 580, marginBottom: 20 }}>
                {SUGGESTED.map(s => (
                  <button key={s.text} onClick={() => submit(s.text)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12.5, fontFamily: "inherit", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(27,79,255,0.1)"; e.currentTarget.style.borderColor = "rgba(27,79,255,0.2)"; e.currentTarget.style.color = "#fff" }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)" }}
                  >{s.icon} {s.text}</button>
                ))}
              </div>

              {/* Data source pills */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                {[{i:"📑",l:"SEC Filings",c:"#1B4FFF"},{i:"📡",l:"Live Prices",c:"#059669"},{i:"🏗️",l:"Private Co.",c:"#D97706"},{i:"🌍",l:"Macro Data",c:"#7C3AED"},{i:"📰",l:"News Intel",c:"#0891B2"},{i:"📊",l:"AI Tables",c:"#E11D48"}].map(x => (
                  <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", background: `${x.c}0f`, border: `1px solid ${x.c}20`, borderRadius: 6, fontSize: 11, color: `${x.c}bb`, fontWeight: 600 }}>{x.i} {x.l}</div>
                ))}
              </div>
            </div>
          ) : (
            // ── CONVERSATION ─────────────────────────────────────────────────
            <div style={{ maxWidth: 820, margin: "0 auto" }}>
              {messages.map((msg) => (
                <div key={msg.id} className="msg-in">
                  {msg.role === "user" ? (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
                      <div style={{ maxWidth: "72%", background: "linear-gradient(135deg,#1B4FFF,#2563EB)", borderRadius: "16px 16px 4px 16px", padding: "11px 16px", color: "#fff", fontSize: 14, lineHeight: 1.6 }}>{msg.content}</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1B4FFF,#06B6D4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 10, flexShrink: 0, marginTop: 2 }}>F</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Source badges */}
                        {getSourceBadges(msg.content).length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                            {getSourceBadges(msg.content).map(s => (
                              <span key={s} style={{ display: "inline-flex", alignItems: "center", padding: "2px 7px", borderRadius: 4, background: `${SOURCE_COLORS[s]}18`, border: `1px solid ${SOURCE_COLORS[s]}30`, fontSize: 9, fontWeight: 800, color: SOURCE_COLORS[s], letterSpacing: "0.07em" }}>{s.toUpperCase()}</span>
                            ))}
                          </div>
                        )}
                        {/* Content */}
                        <div>{renderMarkdown(msg.content)}</div>
                        {/* Actions */}
                        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                          {["Copy", "Export CSV", "Export PDF"].map(a => (
                            <button key={a}
                              onClick={() => a === "Copy" && navigator.clipboard.writeText(msg.content)}
                              style={{ padding: "3px 9px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 6, color: "rgba(255,255,255,0.3)", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
                              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.65)" }}
                              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.color = "rgba(255,255,255,0.3)" }}
                            >{a}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming + agentic steps */}
              {isLoading && (
                <div className="msg-in" style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#1B4FFF,#06B6D4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 10, flexShrink: 0, marginTop: 2 }}>F</div>
                  <div style={{ flex: 1 }}>
                    {!streamingContent && agentSteps >= 0 && (
                      <div style={{ background: "rgba(27,79,255,0.05)", border: "1px solid rgba(27,79,255,0.1)", borderRadius: 10, padding: "12px 14px", marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>RESEARCHING</div>
                        {RESEARCH_STEPS.slice(0, agentSteps + 1).map((step, i) => (
                          <div key={i} className="step-in" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 16, height: 16, borderRadius: "50%", background: i < agentSteps ? "rgba(16,185,129,0.15)" : "rgba(27,79,255,0.12)", border: `1.5px solid ${i < agentSteps ? "#10B981" : "#1B4FFF"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {i < agentSteps
                                ? <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                : <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#1B4FFF", animation: "pulseDot 1s infinite" }} />
                              }
                            </div>
                            <span style={{ fontSize: 11.5, color: i < agentSteps ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.75)", fontFamily: "monospace" }}>{step}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {streamingContent && <div>{renderMarkdown(streamingContent)}<span style={{ display: "inline-block", width: 8, height: 16, background: "#1B4FFF", animation: "pulseDot 0.6s infinite", borderRadius: 2, verticalAlign: "bottom", marginLeft: 2 }} /></div>}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} style={{ height: 24 }} />
            </div>
          )}
        </div>

        {/* ── SEARCH BAR ── */}
        <div style={{ flexShrink: 0, padding: "14px 20px 18px" }}>
          <div style={{ maxWidth: hasMessages ? 820 : 660, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, background: "#0D1B2E", border: "1.5px solid rgba(27,79,255,0.18)", borderRadius: 14, padding: "11px 13px", boxShadow: "0 4px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(27,79,255,0.04)" }}>
              <svg style={{ flexShrink: 0, marginBottom: 1, color: isLoading ? "#1B4FFF" : "rgba(255,255,255,0.18)", animation: isLoading ? "spin 1.5s linear infinite" : "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {isLoading
                  ? <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round"/>
                  : <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>
                }
              </svg>
              <textarea ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}
                placeholder={hasMessages ? "Ask a follow-up…" : "Ask about any company, market, filing, or macro trend…"}
                rows={1}
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14, fontFamily: "inherit", resize: "none", lineHeight: 1.55, maxHeight: 110, overflowY: "auto" }}
                onInput={e => { const el = e.currentTarget; el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 110) + "px" }}
              />
              <div style={{ flexShrink: 0 }}>
                {isLoading ? (
                  <button onClick={() => { abortRef.current?.abort(); setIsLoading(false); setStreamingContent(""); setAgentSteps(-1) }}
                    style={{ padding: "5px 12px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, color: "#FCA5A5", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Stop</button>
                ) : (
                  <button onClick={() => submit(query)} disabled={!query.trim()}
                    style={{ width: 32, height: 32, background: query.trim() ? "linear-gradient(135deg,#1B4FFF,#2563EB)" : "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, color: "#fff", cursor: query.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", opacity: query.trim() ? 1 : 0.4, transition: "all 0.15s", boxShadow: query.trim() ? "0 2px 12px rgba(27,79,255,0.35)" : "none" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                )}
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.14)" }}>
              ↵ Enter to search · Shift+Enter for new line ·{" "}
              <button onClick={() => setShowPromptLib(p => !p)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.22)", fontSize: 11, fontFamily: "inherit" }}>Browse prompt library →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
