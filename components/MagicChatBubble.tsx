"use client"

import { useState } from "react"
import { useChat } from "@ai-sdk/react"

export function MagicChatBubble() {
  const [open, setOpen] = useState(false)
  const { messages, append, status, stop } = useChat({ api: "/api/ai-research" })
  const isLoading = status === "streaming" || status === "submitted"

  return (
    <>
      <button onClick={() => setOpen(!open)}
        style={{ position: "fixed", bottom: 24, right: 24, zIndex: 50, width: 52, height: 52, borderRadius: 14, background: open ? "#0a1525" : "linear-gradient(135deg,#1B4FFF,#06B6D4)", border: open ? "1.5px solid rgba(27,79,255,0.3)" : "none", boxShadow: open ? "none" : "0 4px 24px rgba(27,79,255,0.35)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transform: open ? "rotate(45deg)" : "none", transition: "all 0.25s" }}>
        <svg width={open ? 16 : 20} height={open ? 16 : 20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {open
            ? <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            : <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          }
        </svg>
      </button>

      {open && (
        <div style={{ position: "fixed", bottom: 88, right: 24, zIndex: 50, width: 360, height: 480, borderRadius: 18, background: "#07101F", border: "1.5px solid rgba(27,79,255,0.12)", boxShadow: "0 16px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(27,79,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideUp 0.2s ease" }}>
          <style>{`@keyframes slideUp { from {opacity:0;transform:translateY(10px)} to {opacity:1;transform:none} }`}</style>
          {/* Header */}
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 10, background: "#0A1525" }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: "linear-gradient(135deg,#1B4FFF,#06B6D4)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: 10 }}>F</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>Finsyt AI</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Ask anything financial</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10B981" }} />
              <span style={{ fontSize: 10, color: "#10B981" }}>Live</span>
            </div>
          </div>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, textAlign: "center", marginTop: 40 }}>Ask about any stock, market, or macro trend…</div>
            )}
            {messages.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "85%", padding: "8px 12px", borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px", background: m.role === "user" ? "linear-gradient(135deg,#1B4FFF,#2563EB)" : "rgba(255,255,255,0.06)", color: "#fff", fontSize: 12.5, lineHeight: 1.6 }}>
                  {typeof m.content === "string" ? m.content : ""}
                </div>
              </div>
            ))}
            {isLoading && <div style={{ color: "rgba(27,79,255,0.8)", fontSize: 12 }}>Researching…</div>}
          </div>
          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <form onSubmit={e => { e.preventDefault(); const inp = (e.currentTarget.querySelector("input") as HTMLInputElement); if (inp.value.trim()) { append({ role: "user", content: inp.value }); inp.value = "" } }}
              style={{ display: "flex", gap: 8 }}>
              <input placeholder="Ask a financial question…" style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 11px", color: "#fff", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
              <button type="submit" style={{ width: 30, height: 30, background: "#1B4FFF", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
