"use client";

import { useState, useEffect, useRef } from "react";

// ─── Shared Nav (same as homepage) ────────────────────────────────────────────
function Nav({ scrollY }: { scrollY: number }) {
  return (
    <>
      {/* Announcement banner */}
      <div style={{ background: "#0D0D0B", color: "#fff", padding: "12px 40px", textAlign: "center", fontSize: 13, fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ADE80", display: "inline-block", flexShrink: 0 }} />
        <span>How Baird Equity Research is Sharpening its Edge with Rogo</span>
        <a href="#" style={{ color: "#fff", fontWeight: 600, textDecoration: "underline" }}>Case Study</a>
      </div>
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(12px)",
        borderBottom: scrollY > 40 ? "1px solid #E5E3DE" : "1px solid transparent",
        padding: "0 40px",
        height: 64,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        transition: "border-color 0.3s",
      }}>
        <span style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.5px", fontFamily: "'Georgia', serif" }}>rogo</span>
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          {["Product", "Security", "Company", "Customers", "News", "Careers"].map(link => (
            <a key={link} href="#" style={{ color: link === "Product" ? "#0D0D0B" : "#6B6B68", fontSize: 15, textDecoration: "none", fontFamily: "system-ui, sans-serif", fontWeight: link === "Product" ? 600 : 400 }}>{link}</a>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <a href="#" style={{ color: "#0D0D0B", fontSize: 15, textDecoration: "none", fontFamily: "system-ui, sans-serif" }}>Log in</a>
          <button style={{ background: "#0D0D0B", color: "#fff", border: "none", borderRadius: 9999, padding: "10px 22px", fontSize: 14, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer" }}>
            Request Demo
          </button>
        </div>
      </nav>
    </>
  );
}

// ─── Feature card mock UIs ─────────────────────────────────────────────────────
function WorkflowMockup() {
  const steps = ["Identifying companies", "Searching sources", "Retrieving company metrics", "Creating table", "Finalizing citations..."];
  const [active, setActive] = useState(4);
  useEffect(() => {
    const t = setInterval(() => setActive(p => (p + 1) % steps.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", minWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: "#1A3028", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff" }}>⊞</div>
        <span style={{ fontSize: 13, fontFamily: "system-ui", fontWeight: 500, color: "#333" }}>Benchmark Precedent Transactions</span>
      </div>
      {steps.map((step, i) => (
        <div key={step} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
          <span style={{ fontSize: 13, color: i < active ? "#1A3028" : i === active ? "#1A3028" : "#C0BDB6", fontFamily: "system-ui" }}>
            {i < active ? "✓" : i === active ? "⟳" : "·"}
          </span>
          <span style={{ fontSize: 13, fontFamily: "system-ui", color: i <= active ? "#0D0D0B" : "#C0BDB6", fontStyle: i === active ? "italic" : "normal" }}>{step}</span>
        </div>
      ))}
    </div>
  );
}

function TableMockup() {
  const rows = [
    { name: "General Electric", val: 85 },
    { name: "Boeing", val: 62 },
    { name: "Caterpillar", val: 44 },
  ];
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
      <div style={{ fontSize: 12, color: "#9B9B96", fontFamily: "system-ui", marginBottom: 16, letterSpacing: "0.5px" }}>Top data sources</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "system-ui" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 8px", color: "#9B9B96", fontWeight: 500, fontSize: 12 }}>Company</th>
            <th style={{ textAlign: "left", padding: "6px 8px", color: "#9B9B96", fontWeight: 500, fontSize: 12 }}>% Revenue from Im...</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.name} style={{ borderTop: "1px solid #F0EEEA" }}>
              <td style={{ padding: "10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" style={{ width: 14, height: 14, accentColor: "#1A3028" }} readOnly />
                <span style={{ color: "#0D0D0B" }}>{row.name}</span>
              </td>
              <td style={{ padding: "10px 8px" }}>
                <div style={{ width: `${row.val}%`, height: 8, background: "#E5E3DE", borderRadius: 4, position: "relative" }}>
                  <div style={{ width: "60%", height: "100%", background: "#C5C0B8", borderRadius: 4 }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportMockup() {
  return (
    <div style={{ background: "#fff", borderRadius: 10, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)", maxWidth: 320 }}>
      <p style={{ fontSize: 14, fontFamily: "system-ui", color: "#333", marginBottom: 16, lineHeight: 1.5 }}>
        Here is your requested deck. I customized your presentation template and included file with the backup data.
      </p>
      <div style={{ fontSize: 12, color: "#9B9B96", fontFamily: "system-ui", marginBottom: 10, letterSpacing: "0.5px" }}>Exports (2)</div>
      {[
        { icon: "🔴", name: "TMT Market Overview.pptx", ext: "pptx" },
        { icon: "🟢", name: "Tech Multiples Backup.xlsx", ext: "xlsx" },
      ].map(f => (
        <div key={f.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "#F8F7F5", borderRadius: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>{f.icon}</span>
            <span style={{ fontSize: 12, fontFamily: "system-ui", color: "#333" }}>{f.name}</span>
          </div>
          <span style={{ fontSize: 14, color: "#9B9B96", cursor: "pointer" }}>↓</span>
        </div>
      ))}
    </div>
  );
}

export default function RogoProductClone() {
  const [scrollY, setScrollY] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTestimonial(p => (p + 1) % testimonials.length), 5000);
    return () => clearInterval(t);
  }, []);

  const features = [
    { num: "01", label: "All your content in one place" },
    { num: "02", label: "Transparent, auditable sources" },
    { num: "03", label: "Automate your workflows" },
    { num: "04", label: "Proprietary document interrogation" },
  ];

  const workflowCards = [
    {
      title: "Firm-Specific Workflows",
      desc: "Create and automate workflows tailored to your needs, reducing manual tasks and integrating seamlessly with your existing tools. Optimize processes for research, analysis, and reporting to improve efficiency and accuracy.",
      mockup: <WorkflowMockup />,
    },
    {
      title: "AI Table Interface",
      desc: "Organize and manage data effortlessly with an interactive table interface. Sort, filter, and update information in real time, enabling structured analysis and seamless decision-making.",
      mockup: <TableMockup />,
    },
    {
      title: "Material Creation",
      desc: "Generate reports, summaries, and presentations with AI-powered automation. Transform raw data into polished, professional materials while ensuring clarity and consistency.",
      mockup: <ExportMockup />,
    },
  ];

  const dataProviders = [
    { name: "Your Firm's Data", icon: "🗄", color: "#E8E6E0", textColor: "#333" },
    { name: "LSEG", icon: "🏛", color: "#1E3A8A", textColor: "#fff" },
    { name: "Dow Jones", icon: "D", color: "#003087", textColor: "#fff" },
    { name: "FactSet", icon: "F", color: "#E3F0FF", textColor: "#0050A0" },
    { name: "Capital IQ", icon: "S&P", color: "#C8001E", textColor: "#fff" },
    { name: "PitchBook", icon: "P", color: "#003B5C", textColor: "#fff" },
    { name: "Preqin", icon: "P", color: "#5B2D8E", textColor: "#fff" },
    { name: "Real-time Web & News", icon: "🌐", color: "#E8E6E0", textColor: "#333" },
    { name: "SEC Filings", icon: "🏛", color: "#E8E6E0", textColor: "#333" },
    { name: "Transcripts", icon: "📞", color: "#E8E6E0", textColor: "#333" },
    { name: "Quartr", icon: "Q", color: "#0D0D0B", textColor: "#fff" },
    { name: "International Filings", icon: "🌐", color: "#E8E6E0", textColor: "#333" },
  ];

  const aiLearnCards = [
    {
      title: "Integrations",
      desc: "Connect seamlessly with your existing providers and file systems. Enhance your workflows by interacting with internal & external data sources.",
      visual: (
        <div style={{ display: "grid", gridTemplateColumns: "56px 56px 56px", gridTemplateRows: "56px 56px", gap: 8, marginBottom: 24 }}>
          {[
            { bg: "#E8E6E0", icon: "🗄" },
            { bg: "#2B5CE6", icon: "W" },
            { bg: "#1A73E8", icon: "▲" },
            { bg: "#D62B2B", icon: "P" },
            { bg: "#107C41", icon: "S" },
            { bg: "#217346", icon: "X" },
          ].map((app, i) => (
            <div key={i} style={{ width: 56, height: 56, background: app.bg, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: app.icon.length > 1 ? 13 : 20, color: ["W","▲","P","S","X"].includes(app.icon) ? "#fff" : "#333", fontWeight: 700, fontFamily: "system-ui" }}>
              {app.icon}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Prompt Library",
      desc: "Choose from our library of professionally written prompts aimed at automating your common workflows end-to-end.",
      visual: (
        <div style={{ marginBottom: 24 }}>
          {["Earnings Comp Analysis", "Public Company Strip Profile", "Meeting Prep", "Private Company Profile", "Personal Bio", "Financial Sponsor Overview", "News Run", "Secondaries Buyer Overview", "Proofread My Deck"].map((p, i) => (
            <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < 8 ? "1px solid #F0EEEA" : "none" }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#C0BDB6", display: "inline-block" }} />
              <span style={{ fontSize: 12, fontFamily: "system-ui", color: "#555" }}>{p}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Guided Implementation",
      desc: "White-glove engagement and implementation with our team of ex-bankers and private equity investors.",
      visual: (
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24, paddingTop: 16 }}>
          {[
            { bg: "#B8D4E8", initials: "👤" },
            { bg: "#D4A574", initials: "👨" },
            { bg: "#B0C4B8", initials: "👤" },
          ].map((p, i) => (
            <div key={i} style={{ width: 60, height: 60, borderRadius: "50%", background: p.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginLeft: i > 0 ? -12 : 0, border: "3px solid #F5F4F1", zIndex: 3 - i }}>
              {p.initials}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Custom-Trained Models",
      desc: "Custom-trained LLMs built for finance, using professionally labeled data tailored to the workflows and precision standards of investment banking.",
      visual: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 32px)", gridTemplateRows: "repeat(3, 32px)", gap: 6, marginBottom: 24 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ width: 32, height: 32, border: `2px solid ${i === 9 ? "#1A3028" : "#D4D0C8"}`, borderRadius: 4, background: i === 9 ? "#1A3028" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {i === 9 && <span style={{ color: "#fff", fontSize: 12 }}>⊞</span>}
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Governance & Permissions",
      desc: "Granular permission controls, role-based access management, comprehensive audit trails, and customizable governance policies to streamline compliance and safeguard your data.",
      visual: (
        <div style={{ marginBottom: 24 }}>
          {[
            { label: "Web", val: 90 },
            { label: "SEC Filings", val: 72 },
            { label: "Market Data", val: 55 },
            { label: "Earnings Transcripts", val: 45 },
            { label: "File Library", val: 30 },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontFamily: "system-ui", color: "#9B9B96", width: 120, flexShrink: 0 }}>{item.label}</span>
              <div style={{ flex: 1, height: 6, background: "#E5E3DE", borderRadius: 3 }}>
                <div style={{ width: `${item.val}%`, height: "100%", background: "#1A3028", borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Single Tenant Deployment",
      desc: "Flexible deployment options to meet your security and infrastructure needs.",
      visual: (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 40px)", gridTemplateRows: "repeat(3, 40px)", gap: 8, marginBottom: 24 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ width: 40, height: 40, borderRadius: "50%", border: `2px solid ${i === 1 ? "#1A3028" : "#D4D0C8"}`, background: i === 1 ? "#1A3028" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {i === 1 && <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", display: "inline-block" }} />}
            </div>
          ))}
        </div>
      ),
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

  return (
    <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", background: "#fff", color: "#0D0D0B", margin: 0, padding: 0 }}>

      <Nav scrollY={scrollY} />

      {/* ── HERO ── */}
      <section style={{ padding: "120px 40px 0", textAlign: "center", background: "#fff" }}>
        <h1 style={{ fontSize: "clamp(44px, 6vw, 80px)", fontWeight: 400, letterSpacing: "-2px", lineHeight: 1.05, margin: "0 0 24px", maxWidth: 860, marginLeft: "auto", marginRight: "auto" }}>
          Built for Real Financial Work
        </h1>
        <p style={{ fontSize: 18, color: "#6B6B68", fontFamily: "system-ui, sans-serif", margin: "0 auto 48px", maxWidth: 520, lineHeight: 1.6 }}>
          Accelerate firm productivity, automate workflows, and unify financial data at scale with one secure platform
        </p>
        <button style={{ background: "#0D0D0B", color: "#fff", border: "none", borderRadius: 9999, padding: "14px 36px", fontSize: 16, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer", marginBottom: 80 }}>
          Request a Demo
        </button>
      </section>

      {/* ── HERO PRODUCT SCREENSHOT ── */}
      <section style={{ position: "relative", background: "#fff" }}>
        {/* Building photo bg strip */}
        <div style={{ width: "100%", height: 320, overflow: "hidden", position: "relative" }}>
          {/* Skyscraper grid pattern */}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #B8CDD4 0%, #8AAAB5 50%, #6A8C96 100%)" }}>
            {/* Glass facade grid lines */}
            {Array.from({ length: 9 }).map((_, col) => (
              <div key={col} style={{ position: "absolute", top: 0, bottom: 0, left: `${col * 11.11}%`, width: "10.5%", borderRight: "1px solid rgba(255,255,255,0.15)" }}>
                {Array.from({ length: 12 }).map((_, row) => (
                  <div key={row} style={{ height: "8.33%", borderBottom: "1px solid rgba(255,255,255,0.1)", background: `rgba(180,210,225,${0.1 + Math.random() * 0.15})` }} />
                ))}
              </div>
            ))}
          </div>
          {/* Gradient fade bottom */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 160, background: "linear-gradient(to bottom, transparent, #fff)" }} />
        </div>

        {/* Floating chat UI */}
        <div style={{
          position: "absolute",
          bottom: -20,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(560px, 85vw)",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
          padding: "20px 24px",
          border: "1px solid #E5E3DE",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "#1A3028", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", flexShrink: 0 }}>⊞</div>
            <span style={{ fontSize: 14, fontFamily: "system-ui", color: "#333", flex: 1 }}>expected ebitda figures for NVDA in q3</span>
            <button style={{ width: 32, height: 32, borderRadius: 8, background: "#1A3028", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>→</button>
          </div>
          <div style={{ fontSize: 12, color: "#9B9B96", fontFamily: "system-ui", borderTop: "1px solid #F0EEEA", paddingTop: 10 }}>
            compare valuation multiples for enterprise software…
          </div>
        </div>
      </section>

      <div style={{ height: 80 }} />

      {/* ── BLOOMBERG QUOTE ── */}
      <section style={{ padding: "80px 80px 0" }}>
        <p style={{ fontSize: "clamp(24px, 3.5vw, 44px)", fontFamily: "'Georgia', serif", lineHeight: 1.3, letterSpacing: "-1px", margin: 0, maxWidth: 900 }}>
          <span style={{ color: "#C0BDB6" }}>Just as Bloomberg digitized financial data in the</span><br />
          <span style={{ color: "#C0BDB6" }}>1980s, </span>
          <span style={{ color: "#0D0D0B" }}>Rogo is now transforming financial workflows.</span>
        </p>
      </section>

      {/* ── INTEGRATED PLATFORM FEATURES ── */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, padding: "80px 80px", alignItems: "start" }}>
        {/* Left: dark building photo + mockup */}
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
          {/* Dark building bg */}
          <div style={{ width: "100%", paddingBottom: "80%", position: "relative", background: "linear-gradient(180deg, #1A1814 0%, #2A2520 100%)" }}>
            {/* Building silhouette */}
            <div style={{ position: "absolute", inset: 0 }}>
              <svg viewBox="0 0 500 400" style={{ width: "100%", height: "100%", opacity: 0.6 }}>
                <rect x="150" y="80" width="80" height="320" fill="#2C2820" />
                <rect x="200" y="50" width="40" height="350" fill="#332C25" />
                <rect x="280" y="100" width="60" height="300" fill="#2C2820" />
                <rect x="320" y="60" width="30" height="340" fill="#3A322A" />
                {/* windows */}
                {Array.from({ length: 15 }).map((_, i) => (
                  <rect key={i} x={155 + (i % 5) * 14} y={90 + Math.floor(i / 5) * 40} width={10} height={14} fill={Math.random() > 0.3 ? "#F5C842" : "#1A1814"} opacity={0.7} />
                ))}
              </svg>
            </div>
            {/* Card overlay */}
            <div style={{ position: "absolute", bottom: 24, left: 24, right: 24, background: "rgba(255,255,255,0.95)", borderRadius: 10, padding: "16px 20px", backdropFilter: "blur(4px)" }}>
              <div style={{ fontSize: 12, color: "#9B9B96", fontFamily: "system-ui", marginBottom: 8 }}>Filings and earnings</div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ width: 28, height: 28, background: "#1A3028", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>⊞</div>
                <div style={{ flex: 1, height: 28, background: "#F0EEEA", borderRadius: 4 }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: numbered feature list */}
        <div style={{ paddingLeft: 64, paddingTop: 24 }}>
          <h2 style={{ fontSize: "clamp(22px, 2.5vw, 32px)", fontWeight: 400, letterSpacing: "-0.8px", lineHeight: 1.2, marginBottom: 48 }}>
            An Integrated, Secure Platform<br />Built to Drive Your Firm Forward
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {features.map((f, i) => (
              <button key={f.num} onClick={() => setActiveFeature(i)} style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: "16px 20px",
                background: activeFeature === i ? "#F5F4F1" : "transparent",
                border: "none", borderRadius: 10, cursor: "pointer", textAlign: "left",
                transition: "background 0.2s",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  border: `2px solid ${activeFeature === i ? "#1A3028" : "#D4D0C8"}`,
                  background: activeFeature === i ? "#1A3028" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, fontFamily: "system-ui",
                  color: activeFeature === i ? "#fff" : "#9B9B96",
                  flexShrink: 0,
                }}>
                  {f.num}
                </div>
                <span style={{
                  fontSize: 16,
                  fontFamily: "'Georgia', serif",
                  fontWeight: 400,
                  color: activeFeature === i ? "#0D0D0B" : "#9B9B96",
                  letterSpacing: "-0.3px",
                }}>
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── STREAMLINE & AUTOMATE WORKFLOWS ── */}
      <section style={{ padding: "0 80px 96px" }}>
        <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 400, letterSpacing: "-1.5px", lineHeight: 1.05, marginBottom: 48 }}>
          Streamline & Automate<br />Your Workflows
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
          {workflowCards.map((card, i) => (
            <div key={card.title} style={{ background: "#1A2818", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Dark mockup area */}
              <div style={{ padding: "32px 28px 28px", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
                {card.mockup}
              </div>
              {/* Text below */}
              <div style={{ padding: "0 28px 32px" }}>
                <h3 style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.5px", color: "#fff", marginBottom: 10, fontFamily: "'Georgia', serif" }}>{card.title}</h3>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", fontFamily: "system-ui", lineHeight: 1.65 }}>{card.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRUSTED DATA ── */}
      <section style={{ padding: "0 80px 96px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 80, alignItems: "start" }}>
          <div>
            <h2 style={{ fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 400, letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 20px" }}>Trusted Data</h2>
            <p style={{ fontSize: 15, color: "#6B6B68", fontFamily: "system-ui", lineHeight: 1.7 }}>
              We partner with trusted data providers to bring the highest-quality financial information to our platform. Their expertise, combined with Rogo's technology, gives customers the clarity and confidence they need to move fast.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {dataProviders.map((provider, i) => (
              <div key={provider.name} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 18px",
                background: "#fff",
                border: "1px solid #E5E3DE",
                borderRadius: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: provider.color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: provider.icon.length > 2 ? 9 : provider.icon.length > 1 ? 11 : 16,
                  color: provider.textColor,
                  fontWeight: 700, fontFamily: "system-ui",
                  flexShrink: 0,
                }}>
                  {provider.icon}
                </div>
                <span style={{ fontSize: 13, fontFamily: "system-ui", fontWeight: 500, color: "#0D0D0B" }}>{provider.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AI THAT LEARNS ── */}
      <section style={{ padding: "0 80px 96px" }}>
        <h2 style={{ fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 400, letterSpacing: "-1.5px", lineHeight: 1.05, marginBottom: 64 }}>
          AI That Learns How Your<br />Firm Thinks and Works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
          {/* Row 1: top 3 */}
          {aiLearnCards.slice(0, 3).map((card, i) => (
            <div key={card.title} style={{ background: "#F5F4F1", borderRadius: 16, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
              {card.visual}
              <h3 style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 10, fontFamily: "'Georgia', serif" }}>{card.title}</h3>
              <p style={{ fontSize: 14, color: "#6B6B68", fontFamily: "system-ui", lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
            </div>
          ))}
          {/* Row 2: bottom 3 */}
          {aiLearnCards.slice(3, 6).map((card, i) => (
            <div key={card.title} style={{ background: "#F5F4F1", borderRadius: 16, padding: "32px 28px", display: "flex", flexDirection: "column" }}>
              {card.visual}
              <h3 style={{ fontSize: 20, fontWeight: 400, letterSpacing: "-0.5px", marginBottom: 10, fontFamily: "'Georgia', serif" }}>{card.title}</h3>
              <p style={{ fontSize: 14, color: "#6B6B68", fontFamily: "system-ui", lineHeight: 1.65, margin: 0 }}>{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECURITY ── */}
      <section style={{ margin: "0 80px 96px", borderRadius: 24, overflow: "hidden", background: "#0D0D0B" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ padding: "72px 64px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
                <div style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.25)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontSize: 14 }}>🔒</div>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontFamily: "system-ui", letterSpacing: "2.5px", fontWeight: 700 }}>SECURITY</span>
              </div>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 400, color: "rgba(255,255,255,0.35)", letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 6px", fontFamily: "'Georgia', serif" }}>Built for Enterprise</h2>
              <h2 style={{ fontSize: "clamp(24px, 3vw, 40px)", fontWeight: 400, color: "#fff", letterSpacing: "-1px", lineHeight: 1.1, margin: "0 0 40px", fontFamily: "'Georgia', serif" }}>Secure by Design</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {["No training on your data", "Modern & secure data practices", "End to end encryption", "Audited & tested"].map(item => (
                  <div key={item} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>·</span>
                    <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontFamily: "system-ui" }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 40 }}>
              <a href="#" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#fff", textDecoration: "none", fontSize: 14, fontFamily: "system-ui" }}>
                Find out more
                <span style={{ width: 26, height: 26, background: "rgba(255,255,255,0.1)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>↗</span>
              </a>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
            {[
              { label: "SOC2", badge: "SOC2" },
              { label: "CCPA", badge: "🗺" },
              { label: "ISO 27001", badge: "ISO" },
              { label: "GDPR", badge: "⭐" },
            ].map((cert, i) => (
              <div key={cert.label} style={{
                padding: "48px 36px",
                borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
                display: "flex", flexDirection: "column", justifyContent: "space-between", minHeight: 180,
              }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: cert.badge.length > 2 ? 11 : 22, color: "rgba(255,255,255,0.5)", fontWeight: 700, fontFamily: "system-ui" }}>
                  {cert.badge}
                </div>
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "system-ui", letterSpacing: "1.5px", marginTop: 24 }}>{cert.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: "0 0 96px" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{
            display: "flex",
            transform: `translateX(${-currentTestimonial * 100}%)`,
            transition: "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
          }}>
            {[...testimonials, ...testimonials].map((t, i) => (
              <div key={i} style={{
                flexShrink: 0, width: "100%",
                display: "grid", gridTemplateColumns: "1fr 1fr",
                minHeight: 380,
              }}>
                <div style={{ background: "#F5F3EE", padding: "56px 80px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <p style={{ fontSize: "clamp(17px, 2vw, 24px)", fontFamily: "'Georgia', serif", lineHeight: 1.55, letterSpacing: "-0.4px", color: "#0D0D0B", margin: 0 }}>
                    "{t.quote}"
                  </p>
                  <div>
                    <p style={{ fontFamily: "'Georgia', serif", fontSize: 17, margin: "0 0 4px" }}>{t.name}</p>
                    <p style={{ fontFamily: "system-ui", fontSize: 10, letterSpacing: "1.5px", color: "#9B9B96", margin: 0 }}>{t.title}</p>
                  </div>
                </div>
                <div style={{ background: "linear-gradient(135deg, #C8C0B4 0%, #A8A094 100%)", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontFamily: "system-ui", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                      {t.img}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 32 }}>
          {testimonials.map((_, i) => (
            <button key={i} onClick={() => setCurrentTestimonial(i)} style={{
              width: i === currentTestimonial ? 24 : 8, height: 8, borderRadius: 4,
              background: i === currentTestimonial ? "#0D0D0B" : "#D4D2CC",
              border: "none", cursor: "pointer", padding: 0,
              transition: "width 0.3s, background 0.3s",
            }} />
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{ padding: "64px 80px 80px", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ width: 36, height: 36, borderLeft: "3px solid #0D0D0B", borderTop: "3px solid #0D0D0B", borderRadius: "4px 0 0 0", marginBottom: 4 }} />
            <div style={{ width: 22, height: 22, borderLeft: "3px solid #0D0D0B", borderBottom: "3px solid #0D0D0B", borderRadius: "0 0 0 4px", marginBottom: 36 }} />
            <h2 style={{ fontSize: "clamp(32px, 4.5vw, 60px)", fontWeight: 400, letterSpacing: "-2px", lineHeight: 1.05, margin: 0, fontFamily: "'Georgia', serif" }}>
              Unlock Financial AI<br />
              <span style={{ color: "#9B9B96" }}>For Your Firm</span>
            </h2>
          </div>
          <div style={{ paddingTop: 16 }}>
            <button style={{ background: "#0D0D0B", color: "#fff", border: "none", borderRadius: 9999, padding: "13px 28px", fontSize: 15, fontWeight: 500, fontFamily: "system-ui, sans-serif", cursor: "pointer" }}>
              Request Demo
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: "#fff", borderTop: "1px solid #E5E3DE", padding: "56px 80px 40px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40, marginBottom: 56 }}>
          {[
            { title: "OVERVIEW", links: ["Product", "Features", "Security"] },
            { title: "COMPANY", links: ["About", "Careers", "Security Advisory Board"] },
            { title: "LEGAL", links: ["Terms of Use", "Privacy Policy"] },
            { title: "CONTACT", links: ["Request Demo", "Sales", "LinkedIn", "Press"] },
          ].map(col => (
            <div key={col.title}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "2.5px", color: "#9B9B96", marginBottom: 18, fontFamily: "system-ui" }}>{col.title}</p>
              {col.links.map(link => (
                <div key={link} style={{ marginBottom: 10 }}>
                  <a href="#" style={{ color: "#0D0D0B", fontSize: 14, textDecoration: "none", fontFamily: "system-ui" }}>{link}</a>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #E5E3DE", paddingTop: 22, display: "flex", justifyContent: "center" }}>
          <p style={{ color: "#9B9B96", fontSize: 12, fontFamily: "system-ui", letterSpacing: "1px" }}>© 2026 &nbsp;&nbsp; ROGO AI</p>
        </div>
      </footer>

    </div>
  );
}
