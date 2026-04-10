import { useState } from "react";

const TIERS = [
  {
    name: "Free",
    price: { monthly: 0, annual: 0 },
    desc: "For individuals getting started with financial intelligence.",
    cta: "Get started free",
    highlight: false,
    features: [
      "5 watchlist items",
      "Daily AI summaries",
      "10 data explorer searches/mo",
      "Basic alerts (email)",
      "1 connected source",
      "Community support",
    ],
    missing: ["Advanced AI insights", "Team collaboration", "API access", "Custom dashboards"],
  },
  {
    name: "Pro",
    price: { monthly: 49, annual: 39 },
    desc: "For founders and analysts who need the full signal picture.",
    cta: "Start Pro trial",
    highlight: true,
    badge: "Most Popular",
    features: [
      "Unlimited watchlist items",
      "Real-time AI insights",
      "Unlimited data explorer",
      "Advanced alerts (email + Slack)",
      "10 connected sources",
      "World Bank Data360 integration",
      "Custom dashboards",
      "CSV / JSON exports",
      "Priority support",
    ],
    missing: ["Team collaboration", "API access"],
  },
  {
    name: "Team",
    price: { monthly: 149, annual: 119 },
    desc: "For investment teams and operators who move together.",
    cta: "Talk to sales",
    highlight: false,
    features: [
      "Everything in Pro",
      "Up to 15 team members",
      "Shared watchlists & dashboards",
      "Team alerts & annotations",
      "Unlimited connected sources",
      "Full API access",
      "SSO / SAML",
      "Audit logs",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    missing: [],
  },
];

const COMPARISON = [
  { feature: "Watchlist items", free: "5", pro: "Unlimited", team: "Unlimited" },
  { feature: "AI summaries", free: "Daily", pro: "Real-time", team: "Real-time" },
  { feature: "Data explorer searches", free: "10/mo", pro: "Unlimited", team: "Unlimited" },
  { feature: "Alert types", free: "Email", pro: "Email + Slack", team: "Email + Slack + Webhook" },
  { feature: "Connected sources", free: "1", pro: "10", team: "Unlimited" },
  { feature: "World Bank Data360", free: false, pro: true, team: true },
  { feature: "Custom dashboards", free: false, pro: true, team: true },
  { feature: "Team collaboration", free: false, pro: false, team: true },
  { feature: "API access", free: false, pro: false, team: true },
  { feature: "SSO / SAML", free: false, pro: false, team: true },
  { feature: "Support", free: "Community", pro: "Priority", team: "Dedicated" },
];

export default function Pricing() {
  const [annual, setAnnual] = useState(true);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0e1a", color: "#e8eaf0", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .gradient-text { background: linear-gradient(135deg, #3b82f6, #14b8a6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .btn-primary { background: linear-gradient(135deg, #2563eb, #0d9488); color: white; border: none; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; width: 100%; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-outline { background: transparent; color: #e8eaf0; border: 1px solid #1e2a42; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 500; cursor: pointer; transition: all 0.2s; width: 100%; }
        .btn-outline:hover { border-color: #3b82f6; }
        nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(10,14,26,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #1e2a42; }
        .check { color: #14b8a6; font-size: 15px; }
        .cross { color: #374151; font-size: 15px; }
      `}</style>

      {/* NAV */}
      <nav>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>F</div>
            <span style={{ fontWeight: 700, fontSize: 18 }}>Finsyt</span>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn-outline" style={{ width: "auto", padding: "8px 20px", fontSize: 14 }}>Sign in</button>
            <button className="btn-primary" style={{ width: "auto", padding: "8px 20px", fontSize: 14 }}>Get started</button>
          </div>
        </div>
      </nav>

      {/* HEADER */}
      <div style={{ paddingTop: 120, paddingBottom: 60, textAlign: "center", maxWidth: 700, margin: "0 auto", padding: "120px 24px 60px" }}>
        <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Pricing</div>
        <h1 style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 20 }}>
          Simple, transparent<br /><span className="gradient-text">pricing that scales</span>
        </h1>
        <p style={{ color: "#8892aa", fontSize: 17, lineHeight: 1.7, marginBottom: 40 }}>Start free. Upgrade when you're ready. No hidden fees, no surprises.</p>

        {/* Toggle */}
        <div style={{ display: "inline-flex", background: "#131929", border: "1px solid #1e2a42", borderRadius: 100, padding: 4, gap: 4 }}>
          {["Monthly", "Annual"].map((t, i) => (
            <button key={t} onClick={() => setAnnual(i === 1)} style={{ padding: "8px 24px", borderRadius: 100, border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", transition: "all 0.2s", background: (i === 1) === annual ? "linear-gradient(135deg, #2563eb, #0d9488)" : "transparent", color: (i === 1) === annual ? "white" : "#8892aa" }}>
              {t} {i === 1 && <span style={{ fontSize: 11, opacity: 0.9 }}>Save 20%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* CARDS */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 80px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start" }}>
        {TIERS.map((tier, i) => (
          <div key={i} style={{ background: tier.highlight ? "#0f1d3a" : "#131929", border: `1px solid ${tier.highlight ? "#2563eb" : "#1e2a42"}`, borderRadius: 20, padding: 32, position: "relative", boxShadow: tier.highlight ? "0 0 40px rgba(37,99,235,0.15)" : "none" }}>
            {tier.badge && (
              <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #2563eb, #0d9488)", padding: "4px 16px", borderRadius: 100, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{tier.badge}</div>
            )}
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{tier.name}</div>
            <div style={{ fontSize: 13, color: "#8892aa", marginBottom: 24, lineHeight: 1.5 }}>{tier.desc}</div>
            <div style={{ marginBottom: 32 }}>
              <span style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.03em" }}>
                ${annual ? tier.price.annual : tier.price.monthly}
              </span>
              {tier.price.monthly > 0 && <span style={{ color: "#8892aa", fontSize: 15 }}>/mo</span>}
              {tier.price.monthly === 0 && <span style={{ color: "#8892aa", fontSize: 15 }}> forever</span>}
              {annual && tier.price.monthly > 0 && <div style={{ fontSize: 12, color: "#14b8a6", marginTop: 4 }}>Billed annually (save ${(tier.price.monthly - tier.price.annual) * 12}/yr)</div>}
            </div>
            <button className={tier.highlight ? "btn-primary" : "btn-outline"}>{tier.cta}</button>
            <div style={{ marginTop: 32, borderTop: "1px solid #1e2a42", paddingTop: 24 }}>
              {tier.features.map((f, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 14, color: "#c8cdd8" }}>
                  <span className="check">✓</span> {f}
                </div>
              ))}
              {tier.missing.map((f, j) => (
                <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, fontSize: 14, color: "#374151" }}>
                  <span className="cross">✕</span> {f}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* COMPARISON TABLE */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px 100px" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 40, textAlign: "center", letterSpacing: "-0.02em" }}>Full feature comparison</h2>
        <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "16px 24px", background: "#0f1628", borderBottom: "1px solid #1e2a42" }}>
            <div style={{ fontSize: 13, color: "#8892aa", fontWeight: 600 }}>Feature</div>
            {["Free", "Pro", "Team"].map(t => <div key={t} style={{ fontSize: 13, color: "#8892aa", fontWeight: 600, textAlign: "center" }}>{t}</div>)}
          </div>
          {COMPARISON.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", padding: "14px 24px", borderBottom: i < COMPARISON.length - 1 ? "1px solid #1e2a4222" : "none", background: i % 2 === 0 ? "transparent" : "#0a0e1a22" }}>
              <div style={{ fontSize: 14, color: "#c8cdd8" }}>{row.feature}</div>
              {[row.free, row.pro, row.team].map((val, j) => (
                <div key={j} style={{ textAlign: "center", fontSize: 14 }}>
                  {typeof val === "boolean" ? (
                    val ? <span style={{ color: "#14b8a6" }}>✓</span> : <span style={{ color: "#374151" }}>—</span>
                  ) : (
                    <span style={{ color: "#c8cdd8" }}>{val}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div style={{ background: "#0f1628", borderTop: "1px solid #1e2a42", padding: "80px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, marginBottom: 16, letterSpacing: "-0.02em" }}>Still have questions?</h2>
          <p style={{ color: "#8892aa", marginBottom: 32 }}>Our team is happy to help you find the right plan.</p>
          <button className="btn-primary" style={{ width: "auto", padding: "14px 40px" }}>Talk to us →</button>
        </div>
      </div>
    </div>
  );
}
