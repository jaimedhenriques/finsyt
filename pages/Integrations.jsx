import { useState } from "react";

const SOURCES = [
  { id: 1, name: "World Bank Data360", category: "Economic", status: "connected", icon: "🌍", desc: "Access 1,600+ global development indicators across 190+ countries.", datasets: "1,600+", lastSync: "2 minutes ago", color: "#3b82f6" },
  { id: 2, name: "IMF Data", category: "Economic", status: "connected", icon: "🏛", desc: "International Monetary Fund — World Economic Outlook, IFS, and more.", datasets: "400+", lastSync: "5 minutes ago", color: "#0d9488" },
  { id: 3, name: "BIS Statistics", category: "Monetary", status: "connected", icon: "🏦", desc: "Bank for International Settlements — credit, derivatives, and FX data.", datasets: "120+", lastSync: "1 hour ago", color: "#8b5cf6" },
  { id: 4, name: "Bloomberg Terminal", category: "Markets", status: "available", icon: "📈", desc: "Real-time market data, news, and analytics from Bloomberg.", datasets: "Millions", lastSync: null, color: "#f59e0b" },
  { id: 5, name: "Refinitiv Eikon", category: "Markets", status: "available", icon: "📊", desc: "Financial market data and infrastructure from LSEG.", datasets: "Extensive", lastSync: null, color: "#ef4444" },
  { id: 6, name: "FRED (St. Louis Fed)", category: "Economic", status: "available", icon: "🇺🇸", desc: "Federal Reserve Economic Data — 800,000+ US economic time series.", datasets: "800,000+", lastSync: null, color: "#22c55e" },
  { id: 7, name: "Eurostat", category: "Economic", status: "available", icon: "🇪🇺", desc: "Statistical data for the European Union and member states.", datasets: "3,000+", lastSync: null, color: "#6366f1" },
  { id: 8, name: "Alpha Vantage", category: "Markets", status: "available", icon: "⚡", desc: "Stock, forex, and crypto market data via API.", datasets: "Global equities", lastSync: null, color: "#14b8a6" },
];

const CATEGORIES = ["All", "Economic", "Markets", "Monetary"];

export default function Integrations() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [connectingId, setConnectingId] = useState(null);
  const [connectedIds, setConnectedIds] = useState([1, 2, 3]);

  const handleConnect = (id) => {
    setConnectingId(id);
    setTimeout(() => {
      setConnectedIds(prev => [...prev, id]);
      setConnectingId(null);
    }, 2000);
  };

  const filtered = SOURCES.filter(s => activeCategory === "All" || s.category === activeCategory);
  const connected = SOURCES.filter(s => connectedIds.includes(s.id));

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0e1a", color: "#e8eaf0", minHeight: "100vh", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .gradient-text { background: linear-gradient(135deg, #3b82f6, #14b8a6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 10px; cursor: pointer; transition: all 0.15s; font-size: 14px; font-weight: 500; color: #8892aa; }
        .sidebar-item:hover { background: #131929; color: #e8eaf0; }
        .sidebar-item.active { background: linear-gradient(135deg, #2563eb22, #0d948822); color: #3b82f6; border: 1px solid #2563eb33; }
        .chip { padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #1e2a42; background: transparent; color: #8892aa; transition: all 0.15s; }
        .chip.active { background: linear-gradient(135deg, #2563eb22, #0d948822); border-color: #3b82f644; color: #3b82f6; }
        .btn-connect { background: linear-gradient(135deg, #2563eb, #0d9488); border: none; color: white; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-connect:hover { opacity: 0.9; }
        .btn-disconnect { background: transparent; border: 1px solid #1e2a42; color: #8892aa; padding: 8px 18px; border-radius: 8px; font-size: 13px; cursor: pointer; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #1e2a42; border-radius: 2px; }
      `}</style>

      {/* SIDEBAR */}
      <div style={{ width: 240, background: "#0f1628", borderRight: "1px solid #1e2a42", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, minHeight: "100vh" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32, padding: "0 8px" }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>F</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Finsyt</span>
        </div>
        {[
          { icon: "⬛", label: "Overview", key: "overview" },
          { icon: "👁", label: "Watchlist", key: "watchlist" },
          { icon: "💡", label: "Insights", key: "insights" },
          { icon: "🔔", label: "Alerts", key: "alerts" },
          { icon: "🗺", label: "Data Explorer", key: "data" },
          { icon: "🔗", label: "Integrations", key: "integrations" },
        ].map(item => (
          <div key={item.key} className={`sidebar-item ${item.key === "integrations" ? "active" : ""}`}>
            <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="sidebar-item"><span>⚙️</span> Settings</div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Integrations & Sources</h1>
          <p style={{ color: "#8892aa", fontSize: 14 }}>Connect your data sources to power Finsyt's intelligence engine.</p>
        </div>

        {/* Connected sources summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Connected Sources", value: connectedIds.length, icon: "🔗", color: "#22c55e" },
            { label: "Available Sources", value: SOURCES.length - connectedIds.length, icon: "⚡", color: "#3b82f6" },
            { label: "Data Points/Day", value: "2.4M+", icon: "📊", color: "#0d9488" },
          ].map((m, i) => (
            <div key={i} style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 14, padding: "20px 24px", display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: `${m.color}22`, border: `1px solid ${m.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{m.icon}</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>{m.value}</div>
                <div style={{ fontSize: 12, color: "#8892aa" }}>{m.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Active connections */}
        {connected.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 13, color: "#8892aa", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>Active Connections</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {connected.map(src => (
                <div key={src.id} style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 14, padding: "20px 24px", display: "flex", gap: 16, alignItems: "center" }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `${src.color}22`, border: `1px solid ${src.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{src.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{src.name}</span>
                      <span style={{ fontSize: 11, background: "#22c55e22", color: "#22c55e", padding: "2px 8px", borderRadius: 100, fontWeight: 700 }}>● Connected</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#8892aa" }}>{src.datasets} datasets · Last synced {src.lastSync}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button style={{ background: "transparent", border: "1px solid #1e2a42", color: "#8892aa", padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>⚙ Configure</button>
                    <button className="btn-disconnect">Disconnect</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available sources */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#8892aa", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Available Sources</div>
            <div style={{ display: "flex", gap: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c} className={`chip ${activeCategory === c ? "active" : ""}`} onClick={() => setActiveCategory(c)}>{c}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {filtered.filter(s => !connectedIds.includes(s.id)).map(src => (
              <div key={src.id} style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, padding: 24, transition: "all 0.2s" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: `${src.color}22`, border: `1px solid ${src.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>{src.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{src.name}</div>
                    <span style={{ fontSize: 11, background: "#1e2a42", color: "#8892aa", padding: "2px 8px", borderRadius: 100, fontWeight: 600 }}>{src.category}</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#8892aa", lineHeight: 1.6, marginBottom: 16 }}>{src.desc}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#4a5568" }}>{src.datasets} datasets</span>
                  <button className="btn-connect" onClick={() => handleConnect(src.id)} disabled={connectingId === src.id} style={{ opacity: connectingId === src.id ? 0.7 : 1 }}>
                    {connectingId === src.id ? "Connecting..." : "Connect →"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
