"use client";

import { useState, useEffect, useRef } from "react";

export default function AlphaSenseClone() {
  const [activeSection, setActiveSection] = useState(0);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers = sectionRefs.current.map((ref, i) => {
      if (!ref) return null;
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(i); },
        { threshold: 0.5 }
      );
      observer.observe(ref);
      return observer;
    });
    return () => observers.forEach(o => o?.disconnect());
  }, []);

  const contentSections = [
    {
      num: "01",
      title: "500+ million premium financial and business documents",
      body: "Derive proprietary insights from an unrivaled content set including Tegus expert transcripts, broker research, company filings, private and public financial data — alongside your firm's internal content.",
    },
    {
      num: "02",
      title: "Integrated workflows, not isolated insights",
      body: "AlphaSense unifies your entire research workflow in one intuitive platform, eliminating fragmented sources and giving you streamlined, connected insights.",
    },
    {
      num: "03",
      title: "Decisions made with confidence, not hesitance",
      body: "GenAI provides real-time insights that ground your most important decisions in reliable expertise, and position you to consistently outpace your competitors.",
    },
    {
      num: "04",
      title: "Highly synthesized insights for hard-to-answer questions",
      body: "AlphaSense uses the most advanced AI models available, focused on high-quality content that can't be found anywhere else to generate outputs you can trust, with sentence-level citations and no hallucinations.",
    },
  ];

  const solutions = [
    ["Investment Banking", "Life Sciences & Healthcare"],
    ["Hedge Funds", "Tech, Media, & Telecom"],
    ["Private Equity", "Energy"],
    ["Asset Management", "Industrials"],
    ["Consulting", "Consumer Goods & Retail"],
  ];

  const customerStories = [
    { label: "Powering Competitive Intelligence", company: "Salesforce", desc: "Salesforce gains a competitive edge with AlphaSense by surfacing competitive and market insights in real time." },
    { label: "Faster Innovation for Smarter Strategy", company: "Dow", desc: "Dow's teams harness AlphaSense to quickly ramp up on new markets and trends, spot risks, and drive innovation." },
    { label: "Boost Investment Confidence", company: "ODDO BHF", desc: "ODDO BHF accelerates and streamlines research for faster, more informed investment decisions." },
    { label: "Defy the Unknown and Drive Conviction", company: "YH2 Capital", desc: "YH2 Capital leverages AlphaSense to streamline intelligence and surface internal knowledge with record speed." },
  ];

  const resources = [
    { type: "PRODUCT ARTICLE", title: "Introducing Deep Research in AlphaSense", desc: "AlphaSense's Deep Research gives users access to leading-edge generative AI reasoning models." },
    { type: "REPORT", title: "A Deep Dive into Deep Research Tools", desc: "Deep research tools use AI to create comprehensive reports from complex data. Compare leading platforms." },
    { type: "REPORT", title: "Generative AI's Impact: Revolutionizing Research", desc: "AlphaSense finds information on companies, data and themes from within millions of research documents." },
  ];

  const summitSessions = [
    { type: "WEBINARS & VIDEOS", tag: "ON-DEMAND", title: "Unlocking Emerging Investment Themes With AI-Driven Discovery", desc: "Mira Witzig Borja of Citi and Sam Alvarado of BDO share practical approaches to accelerating discovery workflows." },
    { type: "WEBINARS & VIDEOS", tag: "ON-DEMAND", title: "Humans in the Loop: The Banker's Edge in an Agentic World", desc: "Stefano Combi of Evercore discusses how deal teams are using AI today, what's changing in diligence." },
    { type: "WEBINARS & VIDEOS", tag: "ON-DEMAND", title: "AlphaSummit 2025 - Product Keynote", desc: "Chris Ackerson, Margaret Jatrebski, and Stephen Lynch discuss how AlphaSense helps customers make complex decisions." },
  ];

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#fff", color: "#0D1117", margin: 0, padding: 0 }}>

      {/* NAV */}
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "0 40px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.5px" }}>AlphaSense</span>
          {["Platform", "Solutions", "Resources", "About", "Pricing"].map(link => (
            <button key={link} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, color: "#374151", padding: "4px 0", display: "flex", alignItems: "center", gap: 4 }}>
              {link} {["Platform","Solutions","Resources","About"].includes(link) && <span style={{ fontSize: 10 }}>▾</span>}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#374151" }}>🔍</button>
          <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#374151" }}>Log In ↗</button>
          <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#374151" }}>Customer Support</button>
          <button style={{ background: "#1A56FF", color: "#fff", border: "none", borderRadius: 6, padding: "10px 20px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
            Get Started for Free →
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "80px 40px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, margin: "0 0 24px", letterSpacing: "-1.5px" }}>
            Accelerate your workflow with{" "}
            <span style={{ color: "#1A56FF" }}>AI insights you can trust</span>
          </h1>
          <p style={{ fontSize: 18, color: "#4B5563", lineHeight: 1.7, margin: "0 0 40px", maxWidth: 480 }}>
            Your biggest decisions deserve the most trusted AI platform for actionable insights. See why the best choose AlphaSense.
          </p>
          <div style={{ display: "flex", gap: 16 }}>
            <button style={{ background: "#1A56FF", color: "#fff", border: "none", borderRadius: 6, padding: "14px 28px", fontWeight: 600, fontSize: 16, cursor: "pointer" }}>
              Start Free Trial
            </button>
            <button style={{ background: "transparent", color: "#0D1117", border: "1.5px solid #0D1117", borderRadius: 6, padding: "14px 28px", fontWeight: 600, fontSize: 16, cursor: "pointer" }}>
              Take the Tour
            </button>
          </div>
        </div>
        <div style={{ background: "#1A56FF", borderRadius: 16, padding: 32, minHeight: 360, position: "relative", overflow: "hidden" }}>
          <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <div style={{ width: 3, height: 24, background: "#fff", borderRadius: 2 }} />
              <span style={{ color: "#fff", fontSize: 20, fontWeight: 600 }}>Ask AlphaSense</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,255,255,0.1)", borderRadius: 8, padding: "12px 16px" }}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>🌐</span>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>▾ Sources</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                {["Auto", "Think Longer", "Deep Research"].map(tag => (
                  <span key={tag} style={{ background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 500 }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120, background: "linear-gradient(to bottom, transparent, rgba(0,60,200,0.3))" }} />
        </div>
      </section>

      {/* TRUST STRIP */}
      <section style={{ background: "#F9FAFB", padding: "32px 40px", textAlign: "center", borderTop: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB" }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", margin: "0 0 24px" }}>Trusted by 6,500+ of the world's largest enterprises</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap" }}>
          {["Goldman Sachs", "Salesforce", "Dow", "Morgan Stanley", "Bain & Co", "ODDO BHF"].map(co => (
            <span key={co} style={{ color: "#9CA3AF", fontWeight: 600, fontSize: 14, letterSpacing: "0.5px" }}>{co.toUpperCase()}</span>
          ))}
        </div>
      </section>

      {/* SOLUTIONS */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "96px 40px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "2px", color: "#6B7280", marginBottom: 24 }}>EXPLORE SOLUTIONS</p>
        <h2 style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1px", marginBottom: 48, maxWidth: 560 }}>AI workflows that speak your market's language</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          {solutions.map(([left, right], i) => (
            <div key={i} style={{ display: "contents" }}>
              {[left, right].map(item => (
                <div key={item} style={{ padding: "20px 0", borderBottom: "1px solid #E5E7EB", fontSize: 18, fontWeight: 500, cursor: "pointer", color: "#0D1117", transition: "color 0.2s" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#1A56FF")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#0D1117")}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* NUMBERED CONTENT SECTIONS */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px 96px" }}>
        <h2 style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1px", marginBottom: 80, maxWidth: 680 }}>
          The most expansive collection of curated sources, all in one place
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 48 }}>
          {/* Number sidebar */}
          <div style={{ position: "relative" }}>
            {contentSections.map((s, i) => (
              <div key={i} ref={el => { sectionRefs.current[i] = el; }} style={{ marginBottom: 120, paddingTop: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: activeSection === i ? "#1A56FF" : "#9CA3AF", borderLeft: `3px solid ${activeSection === i ? "#1A56FF" : "transparent"}`, paddingLeft: 12, transition: "all 0.3s" }}>
                  {s.num}
                </span>
              </div>
            ))}
          </div>
          {/* Content */}
          <div>
            {contentSections.map((s, i) => (
              <div key={i} style={{ marginBottom: 120 }}>
                <h3 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, marginBottom: 16, letterSpacing: "-0.5px" }}>{s.title}</h3>
                <p style={{ fontSize: 16, color: "#4B5563", lineHeight: 1.7 }}>{s.body}</p>
              </div>
            ))}
          </div>
          {/* UI mockup panel (sticky) */}
          <div style={{ position: "sticky", top: 80, height: "fit-content", background: "#F9FAFB", borderRadius: 16, padding: 24, border: "1px solid #E5E7EB", minHeight: 360 }}>
            <div style={{ background: "#fff", borderRadius: 10, padding: 16, marginBottom: 12, border: "1px solid #E5E7EB" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {["All", "Transcripts", "Earnings Calls"].map((tab, ti) => (
                  <span key={tab} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: ti === 0 ? "#0D1117" : "transparent", color: ti === 0 ? "#fff" : "#6B7280", border: ti === 0 ? "none" : "1px solid #E5E7EB" }}>{tab}</span>
                ))}
              </div>
              {["Energy", "Technology", "Healthcare"].map(tag => (
                <div key={tag} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "1px solid #F3F4F6", fontSize: 14, color: "#374151" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#1A56FF", flexShrink: 0 }} />
                  {tag}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center" }}>Powered by AlphaSense</p>
          </div>
        </div>
      </section>

      {/* FEATURE CALLOUT */}
      <section style={{ background: "#F9FAFB", padding: "96px 40px", borderTop: "1px solid #E5E7EB" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "2px", color: "#6B7280", marginBottom: 20 }}>FEATURE CALLOUT</p>
            <h2 style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1px", lineHeight: 1.15 }}>
              The Next Generation of AlphaSense's Generative Search
            </h2>
          </div>
          <div>
            <p style={{ fontSize: 17, color: "#4B5563", lineHeight: 1.75, marginBottom: 32 }}>
              Eliminate fragmented workflows with the next generation of Generative Search in AlphaSense. Our new multi-agent architecture connects qualitative insights with structured financial data, providing a 360-degree view of markets and companies.
            </p>
            <p style={{ fontSize: 17, color: "#4B5563", lineHeight: 1.75, marginBottom: 32 }}>
              Beyond search, you can now deploy customizable agents to automate repeatable research tasks and instantly transform findings into executive-ready reports and slides.
            </p>
            <button style={{ background: "none", color: "#1A56FF", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600 }}>
              Explore Deep Research →
            </button>
          </div>
        </div>
      </section>

      {/* CUSTOMER STORIES */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "96px 40px" }}>
        <h2 style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-1px", marginBottom: 16 }}>Our customers instantly gain a competitive edge</h2>
        <p style={{ fontSize: 17, color: "#4B5563", marginBottom: 56, maxWidth: 640 }}>
          AlphaSense gives thousands of teams the precise answers, unique perspectives, and critical updates they need to make bold moves with confidence and speed.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
          {customerStories.map((story, i) => (
            <div key={i} style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: 32, cursor: "pointer", transition: "box-shadow 0.2s" }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "1.5px", color: "#6B7280", marginBottom: 12 }}>{story.label.toUpperCase()}</p>
              <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#1A56FF" }}>{story.company}</h3>
              <p style={{ fontSize: 15, color: "#4B5563", lineHeight: 1.6, marginBottom: 20 }}>{story.desc}</p>
              <button style={{ background: "none", border: "none", color: "#0D1117", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
                Read Full Story →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* RESOURCES */}
      <section style={{ background: "#F9FAFB", padding: "96px 40px", borderTop: "1px solid #E5E7EB" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 48 }}>
            GenAI from AlphaSense redefines what market intelligence can achieve
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32 }}>
            {resources.map((r, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E5E7EB", overflow: "hidden" }}>
                <div style={{ height: 160, background: `linear-gradient(135deg, #1A56FF ${i * 20}%, #0A2FBF)` }} />
                <div style={{ padding: 24 }}>
                  <span style={{ background: "#F0F4FF", color: "#1A56FF", borderRadius: 4, padding: "4px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "1px" }}>{r.type}</span>
                  <h3 style={{ fontSize: 18, fontWeight: 700, margin: "12px 0 8px", lineHeight: 1.3 }}>{r.title}</h3>
                  <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6 }}>{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ALPHASUMMIT */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "96px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
          <h2 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-1px" }}>Insights from AlphaSummit 2025</h2>
          <button style={{ background: "none", border: "none", color: "#1A56FF", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
            Watch All Session Recordings →
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32 }}>
          {summitSessions.map((s, i) => (
            <div key={i} style={{ cursor: "pointer" }}>
              <div style={{ height: 180, background: `linear-gradient(135deg, #0D1117, #1a2035)`, borderRadius: 12, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: 48 }}>▶</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <span style={{ background: "#F0F4FF", color: "#1A56FF", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>{s.type}</span>
                <span style={{ background: "#F3F4F6", color: "#6B7280", borderRadius: 4, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}>{s.tag}</span>
              </div>
              <h3 style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.5 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={{ background: "#0D1117", padding: "96px 40px", textAlign: "center" }}>
        <h2 style={{ fontSize: 48, fontWeight: 700, color: "#fff", letterSpacing: "-1.5px", marginBottom: 20 }}>Transform intelligence into advantage</h2>
        <p style={{ fontSize: 18, color: "rgba(255,255,255,0.6)", marginBottom: 40, maxWidth: 480, margin: "0 auto 40px" }}>
          Develop bold strategies, seize opportunities, and lead with clarity and confidence.
        </p>
        <button style={{ background: "#1A56FF", color: "#fff", border: "none", borderRadius: 6, padding: "16px 36px", fontWeight: 600, fontSize: 17, cursor: "pointer" }}>
          Get Started for Free
        </button>
      </section>

      {/* FOOTER */}
      <footer style={{ background: "#0D1117", borderTop: "1px solid rgba(255,255,255,0.08)", padding: "64px 40px 40px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 48, marginBottom: 64 }}>
            {[
              { title: "PLATFORM", links: ["The AlphaSense Platform", "Financial Data", "Content & Partners", "Enterprise Intelligence", "Why AlphaSense", "Security"] },
              { title: "SOLUTIONS", links: ["Consulting", "Life Sciences & Healthcare", "Tech, Media, & Telecom", "Energy", "Industrials", "All Solutions"] },
              { title: "CUSTOMERS", links: ["Getting Started", "Customer Support", "Developer Portal", "Trust Center", "Training Sessions"] },
              { title: "ABOUT", links: ["About AlphaSense", "Careers", "Newsroom", "Contact"] },
            ].map(col => (
              <div key={col.title}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "2px", color: "rgba(255,255,255,0.4)", marginBottom: 20 }}>{col.title}</p>
                {col.links.map(link => (
                  <div key={link} style={{ marginBottom: 12 }}>
                    <a href="#" style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, textDecoration: "none" }} onMouseEnter={e => (e.currentTarget.style.color = "#fff")} onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}>{link}</a>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>AlphaSense Inc. 2026. All Rights Reserved</p>
            <div style={{ display: "flex", gap: 24 }}>
              {["Legal & Compliance", "Privacy Policy", "Terms & Conditions"].map(link => (
                <a key={link} href="#" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textDecoration: "none" }}>{link}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
