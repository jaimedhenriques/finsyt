"use client";

import { useState, useEffect, useRef } from "react";

// Scrolling ticker component
function Ticker({ items, direction = "left", speed = 30 }: { items: string[]; direction?: "left" | "right"; speed?: number }) {
  const doubled = [...items, ...items, ...items];
  return (
    <div style={{ overflow: "hidden", whiteSpace: "nowrap", padding: "10px 0" }}>
      <div
        style={{
          display: "inline-flex",
          gap: 12,
          animation: `ticker-${direction} ${speed}s linear infinite`,
        }}
      >
        {doubled.map((item, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              background: "#1A1A18",
              color: "#E0DDD8",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "system-ui, -apple-system, sans-serif",
              letterSpacing: "-0.2px",
              whiteSpace: "nowrap",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {item}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes ticker-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        @keyframes ticker-right {
          0% { transform: translateX(-33.333%); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

export default function RogoHomeClone() {
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTestimonial(prev => (prev + 1) % testimonials.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const tickerRow1 = [
    "Earnings Comp Analysis", "Public Company Strip Profile", "Meeting Prep",
    "Private Company Profile", "Personal Bio", "Financial Sponsor Overview",
    "Public Company Profile", "News Run", "Secondaries Buyer Overview", "Proofread My Deck",
  ];
  const tickerRow2 = [
    "Financial Sponsor Overview", "Public Company Profile", "News Run",
    "Secondaries Buyer Overview", "Proofread My Deck", "Earnings Comp Analysis",
    "Public Company Strip Profile", "Meeting Prep", "Private Company Profile",
  ];

  const features = [
    {
      heading: "Powered by the Leading Financial Reasoning Model",
      body: "AI agents trained by the most sophisticated bankers, investors, and AI researchers.",
      ui: (
        <div style={{ background: "#F2F1EE", borderRadius: 12, padding: "24px 28px", border: "1px solid #E5E3DE" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 8, padding: "12px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
            <span style={{ fontSize: 14, color: "#555", fontFamily: "system-ui", flex: 1 }}>Mars / Kellanova precedent transactions</span>
            <button style={{ background: "#1A3028", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, fontFamily: "system-ui", cursor: "pointer" }}>
              Ask Rogo
            </button>
          </div>
        </div>
      ),
    },
    {
      heading: "Accurate, Grounded Research Across All Your Data",
      body: "Rogo seamlessly integrates internal and external data sources, maintaining accuracy, transparency and auditability.",
      ui: (
        <div style={{ background: "#F2F1EE", borderRadius: 12, padding: "24px 28px", border: "1px solid #E5E3DE" }}>
          <div style={{ fontSize: 13, color: "#888", fontFamily: "system-ui", marginBottom: 12 }}>Investor presentations</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["Q4 2024 Earnings.pptx", "Board Update Dec.pdf", "Investor Day 2024.pptx"].map(f => (
              <span key={f} style={{ background: "#fff", border: "1px solid #E5E3DE", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontFamily: "system-ui", color: "#333" }}>{f}</span>
            ))}
          </div>
        </div>
      ),
    },
    {
      heading: "Leverage Your Firm's Workflows",
      body: "Use agents designed to create work outputs exactly as you would across PowerPoint, Excel and Word.",
      ui: (
        <div style={{ background: "#F2F1EE", borderRadius: 12, padding: "20px", border: "1px solid #E5E3DE" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { icon: "📞", label: "Earnings Comp Analysis" },
              { icon: "📊", label: "Public Company Strip Profile" },
              { icon: "🏢", label: "Public Company Profile" },
              { icon: "📰", label: "News Run" },
            ].map(item => (
              <div key={item.label} style={{ background: "#fff", borderRadius: 8, padding: "14px 16px", border: "1px solid #E5E3DE" }}>
                <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontSize: 12, fontFamily: "system-ui", color: "#333", fontWeight: 500 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      heading: "Embed AI into Your Firm's DNA",
      body: "Rather than provide off-the-shelf tools, we collaborate closely with you to build custom models and give you a lasting competitive advantage.",
      ui: (
        <div style={{ background: "#1A1A18", borderRadius: 12, padding: "24px", border: "1px solid rgba(255,255,255,0.08)", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 48px)", gridTemplateRows: "repeat(3, 48px)", gap: 4 }}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} style={{
                width: 48, height: 48,
                border: "1.5px solid rgba(255,255,255,0.15)",
                borderRadius: 4,
                background: i === 6 ? "#1A3028" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {i === 6 && <span style={{ color: "#fff", fontSize: 18 }}>◎</span>}
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  const enterpriseFeatures = [
    {
      icon: "⊞",
      title: "Custom-Trained Models",
      desc: "LLMs built for finance, using professionally labeled data tailored to the standards of your firm's best analysts.",
    },
    {
      icon: "⬡",
      title: "Single Tenant Deployments",
      desc: "Flexible deployment options to meet the security & infrastructure needs for the most conscious firms.",
    },
    {
      icon: "⊕",
      title: "Admin Governance & Permissions",
      desc: "Granular permission controls, role-based access management, comprehensive audit trails, & customizable governance policies.",
    },
  ];

  const testimonials = [
    {
      quote: "The Rogo platform is by far the most advanced AI tool in this space. It is improving the way we do research and making our team far more productive.",
      name: "Pieter Taselaar",
      title: "FOUNDING PARTNER & PORTFOLIO MANAGER AT LUCERNE CAPITAL",
      img: "PT",
    },
    {
      quote: "Rogo helped me find relevant precedent data from a number of filings that I wouldn't have found otherwise. It completely changed how I evaluated the opportunity.",
      name: "Sean Warneke",
      title: "SENIOR ANALYST AT SCHONFELD",
      img: "SW",
    },
    {
      quote: "Our strategic integration of Rogo transforms how we deliver value to clients. Rogo enables our teams to analyze market data and identify opportunities with unprecedented speed and precision, while allowing our bankers to focus more deeply on client relationships and strategic advisory.",
      name: "Patrice Maffre",
      title: "INTERNATIONAL HEAD OF INVESTMENT BANKING, NOMURA",
      img: "PM",
    },
  ];

  const clients = ["Moelis", "NOMURA", "Rothschild & Co", "RAYMOND JAMES", "TRUIST", "LEERINK PARTNERS"];

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#fff", color: "#0D0D0B", margin: 0, padding: 0 }}>

      {/* ANNOUNCEMENT BANNER */}
      <div style={{ background: "#0D0D0B", color: "#fff", padding: "12px 40px", textAlign: "center", fontSize: 13, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80", display: "inline-block", flexShrink: 0 }} />
        <span>How Baird Equity Research is Sharpening its Edge with Rogo</span>
        <a href="#" style={{ color: "#fff", fontWeight: 600, textDecoration: "underline" }}>Case Study</a>
      </div>

      {/* NAV */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: scrollY > 80 ? "1px solid #E5E3DE" : "1px solid transparent",
        padding: "0 40px",
        height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "border-color 0.3s",
      }}>
        <span style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.5px", fontFamily: "'Georgia', serif" }}>rogo</span>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          {["Product", "Security", "Company", "Customers", "News", "Careers"].map(link => (
            <a key={link} href="#" style={{ color: "#0D0D0B", fontSize: 15, textDecoration: "none", fontFamily: "system-ui, sans-serif", fontWeight: 400 }}
              onMouseEnter={e => (e.currentTarget.style.opacity = "0.6")}
              onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >{link}</a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href="#" style={{ color: "#0D0D0B", fontSize: 15, textDecoration: "none", fontFamily: "system-ui, sans-serif" }}>Log in</a>
          <button style={{ background: "#0D0D0B", color: "#fff", border: "none", borderRadius: 9999, padding: "10px 22px", fontSize: 14, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer", letterSpacing: "-0.2px" }}>
            Request Demo
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section
        ref={heroRef}
        style={{
          position: "relative",
          minHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          overflow: "hidden",
          padding: "80px 40px 120px",
        }}
      >
        {/* Background image (NYC skyline) */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, #2C2A28 0%, #1A1510 40%, #0D0D0B 100%)",
          transform: `translateY(${scrollY * 0.3}px)`,
        }} />
        {/* Photo-realistic city overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `
            radial-gradient(ellipse at 50% 60%, rgba(255,140,40,0.12) 0%, transparent 60%),
            radial-gradient(ellipse at 30% 100%, rgba(255,100,30,0.08) 0%, transparent 40%)
          `,
        }} />
        {/* Skyline silhouette */}
        <div style={{
          position: "absolute",
          bottom: 0, left: 0, right: 0,
          height: "45%",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 1440 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill='%23080806' d='M0 400 L0 280 L40 280 L40 220 L60 220 L60 180 L80 180 L80 160 L100 160 L100 120 L110 120 L110 100 L120 100 L120 80 L130 80 L130 100 L140 100 L140 140 L160 140 L160 200 L180 200 L180 240 L200 240 L200 260 L220 260 L220 220 L240 220 L240 200 L260 200 L260 160 L270 160 L270 140 L280 140 L280 120 L290 120 L290 100 L300 100 L300 80 L310 80 L310 60 L320 60 L320 40 L330 40 L330 60 L340 60 L340 80 L350 80 L350 100 L360 100 L360 120 L380 120 L380 160 L400 160 L400 200 L420 200 L420 240 L440 240 L440 260 L480 260 L480 240 L500 240 L500 200 L520 200 L520 160 L540 160 L540 140 L560 140 L560 120 L580 120 L580 100 L590 100 L590 80 L600 80 L600 100 L610 100 L610 120 L640 120 L640 160 L660 160 L660 200 L680 200 L680 240 L720 240 L720 220 L740 220 L740 200 L760 200 L760 180 L780 180 L780 160 L790 160 L790 140 L800 140 L800 120 L810 120 L810 100 L820 100 L820 80 L830 80 L830 100 L840 100 L840 120 L860 120 L860 160 L880 160 L880 200 L920 200 L920 240 L960 240 L960 260 L1000 260 L1000 240 L1020 240 L1020 220 L1040 220 L1040 200 L1060 200 L1060 180 L1080 180 L1080 200 L1100 200 L1100 220 L1120 220 L1120 240 L1160 240 L1160 260 L1200 260 L1200 280 L1240 280 L1240 300 L1280 300 L1280 320 L1320 320 L1320 300 L1360 300 L1360 280 L1400 280 L1400 320 L1440 320 L1440 400 Z'/%3E%3C/svg%3E")`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          opacity: 0.9,
        }} />
        {/* Gradient overlay for text legibility */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.7) 100%)" }} />

        {/* Content */}
        <div style={{ position: "relative", zIndex: 2, maxWidth: 800 }}>
          <h1 style={{ fontSize: "clamp(52px, 7vw, 88px)", fontWeight: 400, lineHeight: 1.05, color: "#fff", margin: "0 0 28px", letterSpacing: "-2px", fontFamily: "'Georgia', serif" }}>
            The AI Platform<br />for Finance.
          </h1>
          <p style={{ fontSize: 18, color: "rgba(255,255,255,0.75)", fontFamily: "system-ui, sans-serif", margin: "0 0 48px", lineHeight: 1.5 }}>
            Purpose-built AI that helps bankers and investors work smarter, move faster, and win more deals
          </p>
          <button style={{ background: "#fff", color: "#0D0D0B", border: "none", borderRadius: 9999, padding: "16px 40px", fontSize: 16, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer", letterSpacing: "-0.3px" }}>
            Request a Demo
          </button>
        </div>
      </section>

      {/* TRUSTED BY + CLIENT LOGOS */}
      <section style={{ padding: "80px 40px 60px", textAlign: "center", background: "#fff" }}>
        <p style={{ fontSize: 15, color: "#9B9B96", fontFamily: "system-ui, sans-serif", marginBottom: 48, letterSpacing: "0.3px" }}>
          Trusted by leading financial institutions
        </p>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 56, flexWrap: "wrap" }}>
          {clients.map(client => (
            <span key={client} style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.5px", color: "#C0BDB6", fontFamily: "system-ui, sans-serif", textTransform: "uppercase" }}>
              {client}
            </span>
          ))}
        </div>
      </section>

      {/* STAT CALLOUT */}
      <section style={{ background: "#0D0D0B", padding: "80px 40px", textAlign: "center" }}>
        <p style={{ fontSize: "clamp(20px, 3vw, 28px)", color: "rgba(255,255,255,0.75)", fontFamily: "'Georgia', serif", lineHeight: 1.5, maxWidth: 720, margin: "0 auto", letterSpacing: "-0.5px" }}>
          Over <span style={{ color: "#fff", fontWeight: 400 }}>$3.5 trillion</span> in annual deal volume still runs on manual work and obsolete technology. Rogo changes that.
        </p>
      </section>

      {/* FEATURE SECTIONS — alternating left/right */}
      {features.map((feature, i) => (
        <section key={i} style={{
          display: "grid",
          gridTemplateColumns: i % 2 === 0 ? "1fr 1fr" : "1fr 1fr",
          gap: 0,
          minHeight: 520,
          background: "#fff",
        }}>
          {i % 2 === 0 ? (
            <>
              {/* Left: text */}
              <div style={{ padding: "80px 80px 80px 80px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <h2 style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 400, lineHeight: 1.15, letterSpacing: "-1px", margin: "0 0 20px" }}>{feature.heading}</h2>
                <p style={{ fontSize: 16, color: "#6B6B68", fontFamily: "system-ui, sans-serif", lineHeight: 1.7 }}>{feature.body}</p>
              </div>
              {/* Right: UI mockup on photo bg */}
              <div style={{ position: "relative", overflow: "hidden", minHeight: 480 }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: i === 0
                    ? "linear-gradient(135deg, #1C2A35 0%, #2A3A2A 100%)"
                    : i === 2
                    ? "linear-gradient(135deg, #1A2818 0%, #2C3820 100%)"
                    : "linear-gradient(135deg, #1A2A20 0%, #243322 100%)",
                }} />
                <div style={{ position: "relative", zIndex: 1, padding: "60px 48px", display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                  {feature.ui}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Left: UI mockup on photo bg */}
              <div style={{ position: "relative", overflow: "hidden", minHeight: 480 }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #1A2820 0%, #243A2A 100%)" }} />
                <div style={{ position: "relative", zIndex: 1, padding: "60px 48px", display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                  {feature.ui}
                </div>
              </div>
              {/* Right: text */}
              <div style={{ padding: "80px 80px 80px 80px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <h2 style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 400, lineHeight: 1.15, letterSpacing: "-1px", margin: "0 0 20px" }}>{feature.heading}</h2>
                <p style={{ fontSize: 16, color: "#6B6B68", fontFamily: "system-ui, sans-serif", lineHeight: 1.7 }}>{feature.body}</p>
              </div>
            </>
          )}
        </section>
      ))}

      {/* SCROLLING TICKERS */}
      <section style={{ background: "#0D0D0B", padding: "40px 0", overflow: "hidden" }}>
        <Ticker items={tickerRow1} direction="left" speed={35} />
        <div style={{ height: 10 }} />
        <Ticker items={tickerRow2} direction="right" speed={28} />
      </section>

      {/* ENTERPRISE DEPLOYMENT */}
      <section style={{ padding: "96px 40px", textAlign: "center", background: "#fff" }}>
        <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 400, letterSpacing: "-1.5px", marginBottom: 16 }}>Built for Enterprise Deployment</h2>
        <p style={{ fontSize: 17, color: "#6B6B68", fontFamily: "system-ui, sans-serif", marginBottom: 64, maxWidth: 480, margin: "0 auto 64px" }}>
          Rogo keeps your data safe with world-class security and data privacy measures.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, maxWidth: 1200, margin: "0 auto" }}>
          {enterpriseFeatures.map((f, i) => (
            <div key={i} style={{ background: "#F5F4F1", borderRadius: 16, padding: "40px 36px", textAlign: "left" }}>
              <div style={{ width: 52, height: 52, background: "#0D0D0B", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 28, fontSize: 22, color: "#fff" }}>
                {f.icon}
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 12, fontFamily: "'Georgia', serif" }}>{f.title}</h3>
              <p style={{ fontSize: 15, color: "#6B6B68", fontFamily: "system-ui, sans-serif", lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SECURITY SECTION */}
      <section style={{ margin: "0 40px 80px", borderRadius: 24, overflow: "hidden", background: "#0D0D0B" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {/* Left: text */}
          <div style={{ padding: "80px 64px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
                <div style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.3)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.6)", fontSize: 16 }}>🔒</div>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontFamily: "system-ui", letterSpacing: "2px", fontWeight: 600 }}>SECURITY</span>
              </div>
              <h2 style={{ fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 400, color: "rgba(255,255,255,0.4)", letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 8px", fontFamily: "'Georgia', serif" }}>
                Built for Enterprise
              </h2>
              <h2 style={{ fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 400, color: "#fff", letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 40px", fontFamily: "'Georgia', serif" }}>
                Secure by Design
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { icon: "☁", label: "Modern & secure data practices" },
                  { icon: "🛡", label: "End to end encryption" },
                  { icon: "</>", label: "Audited & tested" },
                ].map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, width: 20 }}>{item.icon}</span>
                    <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 15, fontFamily: "system-ui" }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 48 }}>
              <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", textDecoration: "none", fontSize: 15, fontFamily: "system-ui" }}>
                Find out more
                <span style={{ width: 28, height: 28, background: "rgba(255,255,255,0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>↗</span>
              </a>
            </div>
          </div>
          {/* Right: compliance grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              { label: "SOC2", icon: "🏛", desc: "AICPA SOC 2" },
              { label: "CCPA", icon: "🗺", desc: "California State" },
              { label: "ISO 27001", icon: "🌐", desc: "International" },
              { label: "GDPR", icon: "⭐", desc: "European Union" },
            ].map((cert, i) => (
              <div key={cert.label} style={{
                padding: "48px 40px",
                borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
                display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 200,
              }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
                  {cert.icon}
                </div>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, fontFamily: "system-ui", letterSpacing: "1.5px", marginTop: 32 }}>{cert.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section style={{ padding: "96px 0", background: "#fff" }}>
        <h2 style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 400, letterSpacing: "-1px", textAlign: "center", marginBottom: 64, fontFamily: "'Georgia', serif" }}>
          What Customers Say<br />
          <span style={{ color: "#9B9B96" }}>About Rogo</span>
        </h2>

        {/* Testimonials carousel */}
        <div style={{ overflow: "hidden" }}>
          <div style={{
            display: "flex",
            transform: `translateX(${-currentTestimonial * 100}%)`,
            transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
          }}>
            {[...testimonials, ...testimonials].map((t, i) => (
              <div key={i} style={{
                flexShrink: 0,
                width: "100%",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                minHeight: 420,
              }}>
                <div style={{
                  background: "#F5F3EE",
                  padding: "64px 80px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}>
                  <p style={{ fontSize: "clamp(18px, 2vw, 26px)", fontFamily: "'Georgia', serif", lineHeight: 1.55, letterSpacing: "-0.5px", color: "#0D0D0B", margin: 0 }}>
                    "{t.quote}"
                  </p>
                  <div>
                    <p style={{ fontFamily: "'Georgia', serif", fontSize: 18, margin: "0 0 4px", color: "#0D0D0B" }}>{t.name}</p>
                    <p style={{ fontFamily: "system-ui", fontSize: 11, letterSpacing: "1.5px", color: "#9B9B96", margin: 0 }}>{t.title}</p>
                  </div>
                </div>
                {/* Right: blurred photo placeholder */}
                <div style={{
                  background: "linear-gradient(135deg, #D4CFC4 0%, #B8B2A5 100%)",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    background: "linear-gradient(135deg, rgba(200,190,175,0.8), rgba(160,155,145,0.8))",
                    backdropFilter: "blur(2px)",
                  }} />
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, color: "rgba(255,255,255,0.8)", fontFamily: "system-ui", fontWeight: 600 }}>
                      {t.img}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 40 }}>
          {testimonials.map((_, i) => (
            <button key={i} onClick={() => setCurrentTestimonial(i)} style={{
              width: i === currentTestimonial ? 24 : 8,
              height: 8,
              borderRadius: 4,
              background: i === currentTestimonial ? "#0D0D0B" : "#D4D2CC",
              border: "none",
              cursor: "pointer",
              transition: "width 0.3s, background 0.3s",
              padding: 0,
            }} />
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={{ padding: "80px 80px 96px", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            {/* Rogo bracket logo */}
            <div style={{ width: 40, height: 40, borderLeft: "3px solid #0D0D0B", borderTop: "3px solid #0D0D0B", borderRadius: "4px 0 0 0", marginBottom: 4 }} />
            <div style={{ width: 24, height: 24, borderLeft: "3px solid #0D0D0B", borderBottom: "3px solid #0D0D0B", borderRadius: "0 0 0 4px", marginBottom: 40 }} />
            <h2 style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 400, letterSpacing: "-2px", lineHeight: 1.05, margin: 0, fontFamily: "'Georgia', serif" }}>
              Unlock Financial AI<br />
              <span style={{ color: "#9B9B96" }}>For Your Firm</span>
            </h2>
          </div>
          <div style={{ paddingTop: 20 }}>
            <button style={{ background: "#0D0D0B", color: "#fff", border: "none", borderRadius: 9999, padding: "14px 32px", fontSize: 15, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer" }}>
              Request Demo
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#fff", borderTop: "1px solid #E5E3DE", padding: "64px 80px 48px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 48, marginBottom: 64 }}>
          {[
            { title: "OVERVIEW", links: ["Product", "Features", "Security"] },
            { title: "COMPANY", links: ["About", "Careers", "Security Advisory Board"] },
            { title: "LEGAL", links: ["Terms of Use", "Privacy Policy"] },
            { title: "CONTACT", links: ["Request Demo", "Sales", "LinkedIn", "Press"] },
          ].map(col => (
            <div key={col.title}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", color: "#9B9B96", marginBottom: 20, fontFamily: "system-ui" }}>{col.title}</p>
              {col.links.map(link => (
                <div key={link} style={{ marginBottom: 12 }}>
                  <a href="#" style={{ color: "#0D0D0B", fontSize: 14, textDecoration: "none", fontFamily: "system-ui" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#6B6B68")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#0D0D0B")}>
                    {link}
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #E5E3DE", paddingTop: 24, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <p style={{ color: "#9B9B96", fontSize: 13, fontFamily: "system-ui", letterSpacing: "1px" }}>© 2026 &nbsp;&nbsp; ROGO AI</p>
        </div>
      </footer>

    </div>
  );
}
