import { useState } from "react";

const INDICATORS = [
  { id: 1, name: "GDP Growth Rate", category: "Macro", source: "World Bank", countries: 190, frequency: "Annual", lastUpdate: "2024 Q4" },
  { id: 2, name: "Inflation (CPI)", category: "Macro", source: "IMF", countries: 185, frequency: "Monthly", lastUpdate: "Mar 2026" },
  { id: 3, name: "Unemployment Rate", category: "Labor", source: "World Bank", countries: 170, frequency: "Monthly", lastUpdate: "Feb 2026" },
  { id: 4, name: "Current Account Balance", category: "Trade", source: "World Bank Data360", countries: 175, frequency: "Annual", lastUpdate: "2024" },
  { id: 5, name: "Foreign Direct Investment", category: "Trade", source: "World Bank Data360", countries: 180, frequency: "Annual", lastUpdate: "2024" },
  { id: 6, name: "Government Debt (% GDP)", category: "Fiscal", source: "IMF", countries: 180, frequency: "Annual", lastUpdate: "2025 Q1" },
  { id: 7, name: "Interest Rate (Central Bank)", category: "Monetary", source: "BIS", countries: 45, frequency: "Monthly", lastUpdate: "Apr 2026" },
  { id: 8, name: "Stock Market Index", category: "Markets", source: "Bloomberg", countries: 60, frequency: "Daily", lastUpdate: "Apr 10, 2026" },
];

const REGIONS = ["Global", "Americas", "Europe", "Asia-Pacific", "Middle East", "Africa"];
const CATEGORIES = ["All", "Macro", "Labor", "Trade", "Fiscal", "Monetary", "Markets"];

const CHART_DATA = {
  US: [2.3, 2.9, 2.3, -2.8, 5.9, 2.1, 2.5, 2.8, 1.9, 2.5],
  EU: [1.8, 1.9, 1.6, -5.9, 5.2, 3.4, 0.5, 0.4, 1.1, 1.4],
  CN: [6.8, 6.7, 6.1, 2.3, 8.1, 3.0, 5.2, 4.6, 4.9, 5.0],
};

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

export default function DataExplorer() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeRegion, setActiveRegion] = useState("Global");
  const [selectedIndicator, setSelectedIndicator] = useState(INDICATORS[0]);
  const [selectedCountries, setSelectedCountries] = useState(["US", "EU", "CN"]);

  const COLORS = { US: "#3b82f6", EU: "#14b8a6", CN: "#f59e0b" };

  const filtered = INDICATORS.filter(ind => {
    const matchSearch = ind.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || ind.category === activeCategory;
    return matchSearch && matchCat;
  });

  const maxVal = Math.max(...Object.values(CHART_DATA).flat().map(Math.abs));

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
        input { background: #131929; border: 1px solid #1e2a42; color: #e8eaf0; padding: 10px 16px; border-radius: 10px; font-size: 14px; outline: none; width: 100%; }
        input:focus { border-color: #3b82f6; }
        .chip { padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid #1e2a42; background: transparent; color: #8892aa; transition: all 0.15s; }
        .chip.active { background: linear-gradient(135deg, #2563eb22, #0d948822); border-color: #3b82f644; color: #3b82f6; }
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
          <div key={item.key} className={`sidebar-item ${item.key === "data" ? "active" : ""}`}>
            <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="sidebar-item"><span>⚙️</span> Settings</div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Data Explorer</h1>
          <p style={{ color: "#8892aa", fontSize: 14 }}>Search and visualise 50+ global economic and financial indicators.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20 }}>
          {/* Left panel - indicator list */}
          <div>
            {/* Search */}
            <div style={{ position: "relative", marginBottom: 16 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#8892aa" }}>🔍</span>
              <input placeholder="Search indicators..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
            </div>

            {/* Categories */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
              {CATEGORIES.map(c => (
                <button key={c} className={`chip ${activeCategory === c ? "active" : ""}`} onClick={() => setActiveCategory(c)}>{c}</button>
              ))}
            </div>

            {/* Indicator list */}
            <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 14, overflow: "hidden" }}>
              {filtered.map((ind, i) => (
                <div key={ind.id} onClick={() => setSelectedIndicator(ind)} style={{ padding: "14px 16px", borderBottom: i < filtered.length - 1 ? "1px solid #1e2a4233" : "none", cursor: "pointer", background: selectedIndicator.id === ind.id ? "#2563eb11" : "transparent", borderLeft: selectedIndicator.id === ind.id ? "2px solid #3b82f6" : "2px solid transparent", transition: "all 0.15s" }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{ind.name}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "#3b82f6", background: "#3b82f611", padding: "2px 8px", borderRadius: 4 }}>{ind.category}</span>
                    <span style={{ fontSize: 11, color: "#8892aa" }}>{ind.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right panel - detail + chart */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Indicator detail */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>{selectedIndicator.name}</h2>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontSize: 12, color: "#8892aa" }}>Source: <span style={{ color: "#3b82f6" }}>{selectedIndicator.source}</span></span>
                    <span style={{ fontSize: 12, color: "#8892aa" }}>Frequency: {selectedIndicator.frequency}</span>
                    <span style={{ fontSize: 12, color: "#8892aa" }}>Last update: {selectedIndicator.lastUpdate}</span>
                    <span style={{ fontSize: 12, color: "#8892aa" }}>{selectedIndicator.countries} countries</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ background: "transparent", border: "1px solid #1e2a42", color: "#8892aa", padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>📥 Export</button>
                  <button style={{ background: "linear-gradient(135deg, #2563eb, #0d9488)", border: "none", color: "white", padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add to watchlist</button>
                </div>
              </div>

              {/* Region selector */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: "#8892aa", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Region</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {REGIONS.map(r => (
                    <button key={r} className={`chip ${activeRegion === r ? "active" : ""}`} onClick={() => setActiveRegion(r)}>{r}</button>
                  ))}
                </div>
              </div>

              {/* Country selector */}
              <div>
                <div style={{ fontSize: 12, color: "#8892aa", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Countries compared</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {Object.keys(COLORS).map(c => (
                    <div key={c} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: `1px solid ${COLORS[c]}44`, background: `${COLORS[c]}11`, cursor: "pointer" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[c] }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS[c] }}>{c}</span>
                    </div>
                  ))}
                  <button style={{ padding: "6px 14px", borderRadius: 8, border: "1px dashed #1e2a42", background: "transparent", color: "#8892aa", fontSize: 13, cursor: "pointer" }}>+ Add</button>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>GDP Growth Rate (% YoY) — 2016–2025</div>
              <div style={{ position: "relative", height: 220 }}>
                {/* Zero line */}
                <div style={{ position: "absolute", left: 0, right: 0, top: "50%", borderTop: "1px dashed #1e2a42" }} />
                {/* Chart bars */}
                <div style={{ display: "flex", gap: 12, height: "100%", alignItems: "center" }}>
                  {YEARS.map((year, yi) => (
                    <div key={year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%" }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", width: "100%", gap: 2 }}>
                        {Object.entries(CHART_DATA).map(([country, vals]) => {
                          const val = vals[yi];
                          const height = Math.abs(val) / maxVal * 45;
                          const isNeg = val < 0;
                          return (
                            <div key={country} style={{ width: "100%", height: `${height}%`, minHeight: 2, background: COLORS[country], borderRadius: 2, opacity: 0.85, marginTop: isNeg ? "auto" : 0, order: isNeg ? 1 : 0 }} title={`${country}: ${val}%`} />
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 10, color: "#4a5568", marginTop: 4 }}>{year}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
                {Object.entries(COLORS).map(([c, col]) => (
                  <div key={c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: col }} />
                    <span style={{ fontSize: 12, color: "#8892aa" }}>{c === "US" ? "United States" : c === "EU" ? "Eurozone" : "China"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Data table */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Data Table</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1e2a42" }}>
                      <th style={{ textAlign: "left", padding: "8px 12px", color: "#8892aa", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>Year</th>
                      {Object.keys(COLORS).map(c => <th key={c} style={{ textAlign: "right", padding: "8px 12px", color: COLORS[c], fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {YEARS.map((year, i) => (
                      <tr key={year} style={{ borderBottom: "1px solid #1e2a4222", background: i % 2 === 0 ? "transparent" : "#0a0e1a22" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600 }}>{year}</td>
                        {Object.entries(CHART_DATA).map(([c, vals]) => (
                          <td key={c} style={{ padding: "10px 12px", textAlign: "right", color: vals[i] >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                            {vals[i] > 0 ? "+" : ""}{vals[i]}%
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
