"use client"

import { useState, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { AgentChat, createAgentChat } from "@21st-sdk/react"
import type { ChatTheme } from "@21st-sdk/react"

const FINSYT_THEME: ChatTheme = {
  theme: {
    "--font-family": "'Inter', system-ui, -apple-system, sans-serif",
    "--border-radius": "12px",
    "--border-radius-sm": "8px",
    "--border-radius-lg": "16px",
  },
  dark: {
    "--bg-primary": "#060e1e",
    "--bg-secondary": "#0a1525",
    "--bg-tertiary": "#0d1b32",
    "--bg-input": "#0a1525",
    "--border-color": "rgba(27,79,255,0.12)",
    "--border-color-focus": "rgba(27,79,255,0.4)",
    "--text-primary": "#ffffff",
    "--text-secondary": "rgba(255,255,255,0.5)",
    "--text-tertiary": "rgba(255,255,255,0.25)",
    "--accent-primary": "#1B4FFF",
    "--accent-primary-hover": "#2563eb",
    "--accent-secondary": "#06b6d4",
    "--user-message-bg": "#1B4FFF",
    "--user-message-text": "#ffffff",
    "--assistant-message-bg": "#0d1b32",
    "--assistant-message-text": "#ffffff",
    "--tool-bg": "#060e1e",
    "--tool-border": "rgba(27,79,255,0.15)",
    "--tool-text": "rgba(255,255,255,0.7)",
    "--input-bg": "#0a1525",
    "--input-text": "#ffffff",
    "--input-placeholder": "rgba(255,255,255,0.25)",
    "--send-button-bg": "#1B4FFF",
    "--send-button-hover": "#2563eb",
    "--send-button-text": "#ffffff",
    "--scrollbar-thumb": "rgba(27,79,255,0.2)",
    "--scrollbar-track": "transparent",
    "--code-bg": "#030712",
    "--code-border": "rgba(27,79,255,0.1)",
    "--code-text": "#93c5fd",
  },
  light: {
    "--bg-primary": "#f8fafc",
    "--bg-secondary": "#ffffff",
    "--text-primary": "#0f172a",
    "--accent-primary": "#1B4FFF",
  },
}

export function MagicChatBubble() {
  const [open, setOpen] = useState(false)

  const chat = useMemo(
    () =>
      createAgentChat({
        agent: "finsyt-intelligence",
        tokenUrl: "/api/an-token",
      }),
    [],
  )

  const { messages, sendMessage, status, stop, error } = useChat({ chat })

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 50,
          width: 52,
          height: 52,
          borderRadius: 14,
          background: open
            ? "#0a1525"
            : "linear-gradient(135deg,#1B4FFF,#06B6D4)",
          border: open ? "1.5px solid rgba(27,79,255,0.3)" : "none",
          boxShadow: open ? "none" : "0 4px 24px rgba(27,79,255,0.35)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: open ? "rotate(45deg)" : "none",
          transition: "all 0.25s",
        }}
      >
        <svg
          width={open ? 16 : 20}
          height={open ? 16 : 20}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          )}
        </svg>
      </button>

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 88,
            right: 24,
            zIndex: 50,
            width: 400,
            height: 540,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow:
              "0 16px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(27,79,255,0.06)",
            animation: "slideUp 0.2s ease",
          }}
        >
          <style>{`@keyframes slideUp { from {opacity:0;transform:translateY(10px)} to {opacity:1;transform:none} }`}</style>

          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#0A1525",
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "linear-gradient(135deg,#1B4FFF,#06B6D4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                color: "#fff",
                fontSize: 10,
              }}
            >
              F
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                Finsyt AI
              </div>
              <div
                style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}
              >
                Powered by 21st.dev
              </div>
            </div>
            <div
              style={{
                marginLeft: "auto",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "#10B981",
                }}
              />
              <span style={{ fontSize: 10, color: "#10B981" }}>Live</span>
            </div>
          </div>

          {/* Agent Chat from 21st SDK */}
          <AgentChat
            messages={messages}
            onSend={(msg) =>
              sendMessage({
                parts: [{ type: "text", text: msg.content }],
              })
            }
            status={status}
            onStop={stop}
            error={error ?? undefined}
            theme={FINSYT_THEME}
            colorMode="dark"
            classNames={{
              root: "finsyt-chat-root",
              messageList: "finsyt-chat-messages",
              inputBar: "finsyt-chat-input",
            }}
            style={{ height: "calc(100% - 50px)" }}
          />
        </div>
      )}
    </>
  )
}
