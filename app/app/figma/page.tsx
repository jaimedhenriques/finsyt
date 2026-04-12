"use client"

import { useState, useEffect, useCallback } from "react"

interface FigmaFile {
  name: string
  lastModified: string
  version: string
  thumbnailUrl: string
  pages: { id: string; name: string; type: string; childCount: number }[]
}

interface FigmaComponent {
  key: string
  name: string
  description: string
  thumbnailUrl: string
  containingFrame: { name: string } | null
  createdAt: string
  updatedAt: string
}

interface FigmaStyle {
  key: string
  name: string
  description: string
  styleType: string
  thumbnailUrl: string
  createdAt: string
  updatedAt: string
}

interface FigmaUser {
  id: string
  handle: string
  img_url: string
  email: string
}

const STYLE_TYPE_ICONS: Record<string, string> = { FILL: "🎨", TEXT: "🔤", EFFECT: "✨", GRID: "🔲" }

function FigmaLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 38 57" fill="currentColor">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  )
}

export default function FigmaPage() {
  const [fileKey, setFileKey] = useState("")
  const [activeTab, setActiveTab] = useState<"file" | "components" | "styles">("file")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [user, setUser] = useState<FigmaUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

  const [fileData, setFileData] = useState<FigmaFile | null>(null)
  const [components, setComponents] = useState<FigmaComponent[]>([])
  const [styles, setStyles] = useState<FigmaStyle[]>([])

  const clientId = process.env.NEXT_PUBLIC_FIGMA_CLIENT_ID || ""

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/figma?action=me")
      if (res.ok) {
        const data = await res.json()
        if (data.id || data.handle) setUser(data)
      }
    } catch {}
    setAuthChecked(true)
  }, [])

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("connected") === "true") {
      checkAuth()
      window.history.replaceState({}, "", "/app/figma")
    }
    if (params.get("error")) {
      setError(`OAuth error: ${params.get("error")}`)
      window.history.replaceState({}, "", "/app/figma")
    }
  }, [checkAuth])

  function startOAuth() {
    if (!clientId) {
      setError("FIGMA_CLIENT_ID not configured")
      return
    }
    const redirectUri = `${window.location.origin}/api/figma/callback`
    const state = Math.random().toString(36).slice(2)
    const url = `https://www.figma.com/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=files:read&state=${state}&response_type=code`
    window.location.href = url
  }

  function extractFileKey(input: string): string {
    const match = input.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/)
    return match ? match[1] : input.trim()
  }

  async function fetchData(tab?: string) {
    const key = extractFileKey(fileKey)
    if (!key) { setError("Enter a Figma file key or URL"); return }
    setLoading(true)
    setError("")
    const action = tab || activeTab

    try {
      if (action === "file" || !fileData) {
        const res = await fetch(`/api/figma?action=file&file_key=${key}`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setFileData(data)
      }
      if (action === "components") {
        const res = await fetch(`/api/figma?action=components&file_key=${key}`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setComponents(data.components || [])
      }
      if (action === "styles") {
        const res = await fetch(`/api/figma?action=styles&file_key=${key}`)
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setStyles(data.styles || [])
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch Figma data")
    } finally {
      setLoading(false)
    }
  }

  function handleTabChange(tab: "file" | "components" | "styles") {
    setActiveTab(tab)
    if (fileKey.trim()) fetchData(tab)
  }

  const isConnected = !!user

  return (
    <div className="page-content" style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#A259FF,#F24E1E)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
          <FigmaLogo />
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ margin: 0 }}>Figma</h1>
          <p style={{ fontSize: 12, color: "#7D8FA9", margin: 0 }}>Design system data — components, styles, file structure, and OAuth</p>
        </div>
        {/* Auth status */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isConnected ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8 }}>
              {user?.img_url && <img src={user.img_url} alt="" style={{ width: 22, height: 22, borderRadius: "50%" }} />}
              <span style={{ fontSize: 12, fontWeight: 600, color: "#059669" }}>{user?.handle || user?.email || "Connected"}</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981" }} />
            </div>
          ) : authChecked ? (
            <button onClick={startOAuth} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FigmaLogo size={14} />
              Connect Figma
            </button>
          ) : (
            <div className="skeleton" style={{ width: 120, height: 32 }} />
          )}
        </div>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <svg style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#B0BCD0", pointerEvents: "none" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input
            className="input"
            value={fileKey}
            onChange={e => setFileKey(e.target.value)}
            onKeyDown={e => e.key === "Enter" && fetchData()}
            placeholder="Paste Figma file URL or key (e.g. figma.com/design/abc123…)"
            style={{ paddingLeft: 36 }}
          />
        </div>
        <button className="btn btn-primary" onClick={() => fetchData()} disabled={loading || (!isConnected && !process.env.FIGMA_ACCESS_TOKEN)}>
          {loading ? "Loading…" : "Fetch"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, color: "#DC2626", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Tabs */}
      <div className="tab-bar">
        {(["file", "components", "styles"] as const).map(tab => (
          <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => handleTabChange(tab)} style={{ textTransform: "capitalize" }}>
            {tab === "file" ? "📄 File Info" : tab === "components" ? `🧩 Components${components.length ? ` (${components.length})` : ""}` : `🎨 Styles${styles.length ? ` (${styles.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* File Info */}
      {activeTab === "file" && fileData && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {fileData.thumbnailUrl && (
              <img src={fileData.thumbnailUrl} alt={fileData.name} style={{ width: 140, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #E8EDF4" }} />
            )}
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#0A1628", marginBottom: 4 }}>{fileData.name}</h2>
              <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#7D8FA9", marginBottom: 12, flexWrap: "wrap" }}>
                <span>Version: <strong style={{ color: "#1C2B4A" }}>{fileData.version}</strong></span>
                <span>Modified: <strong style={{ color: "#1C2B4A" }}>{new Date(fileData.lastModified).toLocaleDateString()}</strong></span>
                <span>Pages: <strong style={{ color: "#1C2B4A" }}>{fileData.pages?.length || 0}</strong></span>
              </div>
              {fileData.pages && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {fileData.pages.map(page => (
                    <span key={page.id} className="badge badge-blue" style={{ gap: 4, cursor: "default" }}>
                      📄 {page.name} <span style={{ opacity: 0.6 }}>({page.childCount})</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Components */}
      {activeTab === "components" && (
        <div>
          {components.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#B0BCD0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🧩</div>
              <p style={{ fontSize: 13 }}>{fileData ? "No published components in this file" : "Enter a Figma file URL and click Fetch"}</p>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {components.map(comp => (
              <div key={comp.key} className="card" style={{ padding: 14, display: "flex", gap: 12, alignItems: "flex-start", transition: "border-color 0.15s", cursor: "default" }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#A259FF")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#E2E8F2")}>
                {comp.thumbnailUrl ? (
                  <img src={comp.thumbnailUrl} alt={comp.name} style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 6, background: "#F7F9FC", border: "1px solid #E8EDF4", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 6, background: "linear-gradient(135deg,#A259FF15,#F24E1E15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>🧩</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0A1628", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{comp.name}</div>
                  {comp.description && (
                    <p style={{ fontSize: 11, color: "#7D8FA9", marginBottom: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{comp.description}</p>
                  )}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {comp.containingFrame && <span className="badge badge-gray" style={{ fontSize: 10 }}>📂 {comp.containingFrame.name}</span>}
                    {comp.updatedAt && <span style={{ fontSize: 10, color: "#B0BCD0" }}>{new Date(comp.updatedAt).toLocaleDateString()}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Styles */}
      {activeTab === "styles" && (
        <div>
          {styles.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "#B0BCD0" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎨</div>
              <p style={{ fontSize: 13 }}>{fileData ? "No published styles in this file" : "Enter a Figma file URL and click Fetch"}</p>
            </div>
          )}
          {styles.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Style</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th className="right">Updated</th>
                </tr>
              </thead>
              <tbody>
                {styles.map(style => (
                  <tr key={style.key}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {style.thumbnailUrl ? (
                          <img src={style.thumbnailUrl} alt="" style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #E8EDF4" }} />
                        ) : (
                          <span style={{ fontSize: 16 }}>{STYLE_TYPE_ICONS[style.styleType] || "🎨"}</span>
                        )}
                        <span style={{ fontWeight: 600 }}>{style.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${style.styleType === "FILL" ? "badge-blue" : style.styleType === "TEXT" ? "badge-green" : style.styleType === "EFFECT" ? "badge-amber" : "badge-gray"}`}>
                        {STYLE_TYPE_ICONS[style.styleType] || ""} {style.styleType}
                      </span>
                    </td>
                    <td style={{ color: "#7D8FA9", fontSize: 12 }}>{style.description || "—"}</td>
                    <td className="right" style={{ fontSize: 12, color: "#7D8FA9" }}>{style.updatedAt ? new Date(style.updatedAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Empty state */}
      {!fileData && !loading && !error && (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "linear-gradient(135deg,#A259FF20,#F24E1E20)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", color: "#A259FF" }}>
            <FigmaLogo size={28} />
          </div>
          {!isConnected ? (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1C2B4A", marginBottom: 6 }}>Connect your Figma account</h3>
              <p style={{ fontSize: 13, color: "#7D8FA9", maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.6 }}>
                Sign in with Figma OAuth to pull design system data — files, components, styles, images, and variables — directly into Finsyt.
              </p>
              <button onClick={startOAuth} className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 24px", fontSize: 14 }}>
                <FigmaLogo size={16} />
                Connect with Figma
              </button>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1C2B4A", marginBottom: 6 }}>Open a Figma file</h3>
              <p style={{ fontSize: 13, color: "#7D8FA9", maxWidth: 420, margin: "0 auto 20px", lineHeight: 1.6 }}>
                Paste a Figma file URL or key to pull design system data — components, styles, pages, images, and more.
              </p>
            </>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
            <div className="badge badge-blue">📄 File structure</div>
            <div className="badge badge-green">🧩 Components</div>
            <div className="badge badge-amber">🎨 Styles</div>
            <div className="badge badge-gray">🖼️ Image exports</div>
          </div>
        </div>
      )}

      {/* API Reference */}
      <div className="card" style={{ marginTop: 24, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#7D8FA9", letterSpacing: "0.08em", textTransform: "uppercase" }}>API Endpoints</span>
          <span className="badge badge-blue" style={{ fontSize: 10 }}>OAuth + PAT</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
          {[
            { path: "/api/figma?action=file&file_key=KEY", desc: "File info & pages" },
            { path: "/api/figma?action=components&file_key=KEY", desc: "Published components" },
            { path: "/api/figma?action=styles&file_key=KEY", desc: "Published styles" },
            { path: "/api/figma?action=component-sets&file_key=KEY", desc: "Component sets" },
            { path: "/api/figma?action=images&file_key=KEY&node_ids=IDS", desc: "Export images" },
            { path: "/api/figma?action=nodes&file_key=KEY&ids=IDS", desc: "Node data" },
            { path: "/api/figma?action=me", desc: "Current user" },
            { path: "/api/figma?action=team-projects&team_id=ID", desc: "Team projects" },
          ].map(ep => (
            <div key={ep.path} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#F7F9FC", borderRadius: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#059669", fontFamily: "monospace" }}>GET</span>
              <span style={{ color: "#1C2B4A", fontFamily: "monospace", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{ep.path}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
