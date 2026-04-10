import { useState } from "react";

const SIGNALS = [
  { id: 1, ticker: "SPY", name: "S&P 500 ETF", price: "521.34", change: "+1.2%", up: true },
  { id: 2, ticker: "BTC", name: "Bitcoin", price: "68,420", change: "+3.4%", up: true },
  { id: 3, ticker: "EURUSD", name: "EUR/USD", price: "1.0842", change: "-0.3%", up: false },
  { id: 4, ticker: "GLD", name: "Gold ETF", price: "218.56", change: "+0.8%", up: true },
  { id: 5, ticker: "TLT", name: "20yr Treasury", price: "94.12", change: "-0.5%", up: false },
];

const INSIGHTS = [
  { time: "2m ago", tag: "MACRO", color: "#3b82f6", title: "US CPI beats expectations — markets reprice rate cuts", summary: "Core CPI came in at 3.1% YoY vs 3.0% expected. Treasury yields ticked up 8bps. Equity markets initially dipped but recovered intraday.", impact: "High" },
  { time: "18m ago", tag: "EARNINGS", color: "#8b5cf6", title: "NVIDIA Q1 beat: revenue +262% YoY", summary: "Data center revenue of $22.6B led the beat. Guidance for Q2 above consensus. Stock trading +8% AH.", impact: "High" },
  { time: "1h ago", tag: "GLOBAL", color: "#0d9488", title: "ECB signals pause in rate cuts amid sticky inflation", summary: "Lagarde indicated the ECB will hold rates steady at the June meeting, citing services inflation remaining elevated.", impact: "Medium" },
  { time: "3h ago", tag: "SIGNAL", color: "#f59e0b", title: "USD/JPY approaching 158 — intervention risk elevated", summary: "The pair has moved 2.3% this week. Japanese officials have issued verbal warnings. Watch for BOJ action.", impact: "Medium" },
];

const ALERTS = [
  { type: "price", icon: "📈", label: "SPY crossed $520", time: "4m ago", color: "#22c55e" },
  { type: "macro", icon: "🌍", label: "US Jobs report drops in 2 days", time: "1h ago", color: "#3b82f6" },
  { type: "risk", icon: "⚠️", label: "Volatility spike: VIX > 20", time: "3h ago", color: "#f59e0b" },
];

const CHART_DATA = [38, 42, 39, 51, 48, 62, 58, 70, 65, 78, 74, 88, 84, 92, 89, 96, 91, 100];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const tabs = ["overview", "watchlist", "insights", "alerts"];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0e1a", color: "#e8eaf0", minHeight: "100vh", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .gradient-text { background: linear-gradient(135deg, #3b82f6, #14b8a6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .card { background: #131929; border: 1px solid #1e2a42; border-radius: 16px; padding: 24px; }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 10px; cursor: pointer; transition: all 0.15s; font-size: 14px; font-weight: 500; color: #8892aa; }
        .sidebar-item:hover { background: #131929; color: #e8eaf0; }
        .sidebar-item.active { background: linear-gradient(135deg, #2563eb22, #0d948822); color: #3b82f6; border: 1px solid #2563eb33; }
        .tag { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }
        .metric-card { background: #131929; border: 1px solid #1e2a42; border-radius: 14px; padding: 20px 24px; }
        .up { color: #22c55e; }
        .down { color: #ef4444; }
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
          <div key={item.key} className={`sidebar-item ${activeTab === item.key ? "active" : ""}`} onClick={() => setActiveTab(item.key)}>
            <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="sidebar-item">
          <span>⚙️</span> Settings
        </div>
        <div style={{ padding: "12px 16px", background: "#131929", borderRadius: 10, border: "1px solid #1e2a42", marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "#8892aa", marginBottom: 4 }}>Pro Plan</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Jaime H.</div>
          <div style={{ fontSize: 11, color: "#3b82f6", marginTop: 2 }}>jaimedhenriques@gmail.com</div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Top bar */}
        <div style={{ padding: "20px 32px", borderBottom: "1px solid #1e2a42", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "#0a0e1a", zIndex: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>Good afternoon, Jaime 👋</h1>
            <p style={{ fontSize: 13, color: "#8892aa", marginTop: 2 }}>Friday, 10 April 2026 · Markets open</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "#ef4444", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>3</div>
              <button style={{ background: "#131929", border: "1px solid #1e2a42", color: "#e8eaf0", width: 38, height: 38, borderRadius: 10, cursor: "pointer", fontSize: 16 }}>🔔</button>
            </div>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>J</div>
          </div>
        </div>

        <div style={{ padding: 32 }}>

          {/* METRIC CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
            {[
              { label: "Portfolio Value", value: "$2.41M", change: "+$28.4K today", up: true, icon: "💼" },
              { label: "Active Signals", value: "47", change: "+12 since yesterday", up: true, icon: "📡" },
              { label: "AI Insights", value: "18 new", change: "Last updated 2m ago", up: null, icon: "🤖" },
              { label: "Alerts", value: "3 active", change: "2 high priority", up: false, icon: "🔔" },
            ].map((m, i) => (
              <div key={i} className="metric-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: "#8892aa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{m.label}</span>
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>{m.value}</div>
                <div style={{ fontSize: 12, color: m.up === true ? "#22c55e" : m.up === false ? "#ef4444" : "#8892aa" }}>{m.change}</div>
              </div>
            ))}
          </div>

          {/* CHART + ALERTS */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 28 }}>
            {/* Chart */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>Portfolio Performance</div>
                  <div style={{ fontSize: 12, color: "#8892aa" }}>Last 30 days</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {["1W", "1M", "3M", "1Y"].map((t, i) => (
                    <button key={t} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid", fontSize: 12, fontWeight: 600, cursor: "pointer", background: i === 1 ? "#2563eb" : "transparent", borderColor: i === 1 ? "#2563eb" : "#1e2a42", color: i === 1 ? "white" : "#8892aa" }}>{t}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 160 }}>
                {CHART_DATA.map((v, i) => (
                  <div key={i} style={{ flex: 1, height: `${v}%`, background: i === CHART_DATA.length - 1 ? "linear-gradient(180deg, #3b82f6, #0d9488)" : "linear-gradient(180deg, #3b82f644, #0d948844)", borderRadius: "3px 3px 0 0", transition: "all 0.2s" }} />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 11, color: "#4a5568" }}>
                <span>Mar 10</span><span>Mar 20</span><span>Apr 1</span><span>Apr 10</span>
              </div>
            </div>

            {/* Alerts */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Active Alerts</div>
              {ALERTS.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: i < ALERTS.length - 1 ? "1px solid #1e2a4244" : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${a.color}22`, border: `1px solid ${a.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{a.icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{a.label}</div>
                    <div style={{ fontSize: 11, color: "#8892aa" }}>{a.time}</div>
                  </div>
                </div>
              ))}
              <button style={{ width: "100%", marginTop: 16, padding: "10px", background: "transparent", border: "1px solid #1e2a42", borderRadius: 8, color: "#8892aa", fontSize: 13, cursor: "pointer" }}>View all alerts →</button>
            </div>
          </div>

          {/* WATCHLIST + INSIGHTS */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 20 }}>
            {/* Watchlist */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Watchlist</div>
                <button style={{ background: "linear-gradient(135deg, #2563eb, #0d9488)", border: "none", color: "white", padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Add</button>
              </div>
              {SIGNALS.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < SIGNALS.length - 1 ? "1px solid #1e2a4233" : "none" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "#0a0e1a", border: "1px solid #1e2a42", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 10, color: "#3b82f6" }}>{s.ticker}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.ticker}</div>
                      <div style={{ fontSize: 11, color: "#8892aa" }}>{s.name}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{s.price}</div>
                    <div style={{ fontSize: 12, color: s.up ? "#22c55e" : "#ef4444" }}>{s.change}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Insights */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>AI Insights Feed</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {INSIGHTS.map((ins, i) => (
                  <div key={i} style={{ padding: 16, background: "#0a0e1a", borderRadius: 12, border: "1px solid #1e2a42", cursor: "pointer" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span className="tag" style={{ background: `${ins.color}22`, color: ins.color }}>{ins.tag}</span>
                      <span className="tag" style={{ background: ins.impact === "High" ? "#ef444422" : "#f59e0b22", color: ins.impact === "High" ? "#ef4444" : "#f59e0b" }}>
                        {ins.impact} impact
                      </span>
                      <span style={{ fontSize: 11, color: "#4a5568", marginLeft: "auto" }}>{ins.time}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{ins.title}</div>
                    <div style={{ fontSize: 12, color: "#8892aa", lineHeight: 1.6 }}>{ins.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
