import { useState } from "react";

const NAV_LINKS = ["Features", "How It Works", "Pricing", "Dashboard"];

export default function Landing() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email) setSubmitted(true);
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0e1a", color: "#e8eaf0", minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --navy: #0a0e1a;
          --navy2: #0f1628;
          --card: #131929;
          --border: #1e2a42;
          --blue: #2563eb;
          --blue-light: #3b82f6;
          --teal: #0d9488;
          --teal-light: #14b8a6;
          --text: #e8eaf0;
          --muted: #8892aa;
          --accent: linear-gradient(135deg, #2563eb, #0d9488);
        }
        a { color: inherit; text-decoration: none; }
        .gradient-text {
          background: linear-gradient(135deg, #3b82f6, #14b8a6);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .btn-primary {
          background: linear-gradient(135deg, #2563eb, #0d9488);
          color: white;
          border: none;
          padding: 14px 32px;
          border-radius: 10px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.01em;
        }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(37,99,235,0.3); }
        .btn-outline {
          background: transparent;
          color: #e8eaf0;
          border: 1px solid #1e2a42;
          padding: 12px 28px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-outline:hover { border-color: #3b82f6; color: #3b82f6; }
        .card {
          background: #131929;
          border: 1px solid #1e2a42;
          border-radius: 16px;
          padding: 28px;
          transition: all 0.2s;
        }
        .card:hover { border-color: #2563eb44; box-shadow: 0 8px 32px rgba(37,99,235,0.08); }
        nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(10,14,26,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid #1e2a42; }
        section { padding: 100px 24px; max-width: 1200px; margin: 0 auto; }
        .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-top: 60px; }
        .step { display: flex; gap: 20px; align-items: flex-start; padding: 32px; background: #131929; border: 1px solid #1e2a42; border-radius: 16px; }
        .testimonial-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; margin-top: 60px; }
        input[type="email"] {
          background: #131929;
          border: 1px solid #1e2a42;
          color: #e8eaf0;
          padding: 14px 20px;
          border-radius: 10px;
          font-size: 15px;
          outline: none;
          width: 300px;
          transition: border-color 0.2s;
        }
        input[type="email"]:focus { border-color: #3b82f6; }
        @media (max-width: 768px) {
          section { padding: 80px 20px; }
          input[type="email"] { width: 100%; }
          .hero-cta { flex-direction: column; }
        }
      `}</style>

      {/* NAV */}
      <nav>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 68, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>F</div>
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em" }}>Finsyt</span>
          </div>
          <div style={{ display: "flex", gap: 36, alignItems: "center" }}>
            {NAV_LINKS.map(l => <a key={l} href={`#${l.toLowerCase().replace(/ /g, "-")}`} style={{ color: "#8892aa", fontSize: 14, fontWeight: 500, transition: "color 0.2s" }}
              onMouseOver={e => e.target.style.color = "#e8eaf0"} onMouseOut={e => e.target.style.color = "#8892aa"}>{l}</a>)}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn-outline" style={{ padding: "8px 20px", fontSize: 14 }}>Sign in</button>
            <button className="btn-primary" style={{ padding: "8px 20px", fontSize: 14 }}>Get started</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <div style={{ paddingTop: 140, paddingBottom: 100, textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)", width: 800, height: 400, background: "radial-gradient(ellipse, rgba(37,99,235,0.12) 0%, transparent 70%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#131929", border: "1px solid #1e2a42", borderRadius: 100, padding: "6px 16px", marginBottom: 32 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#14b8a6", boxShadow: "0 0 8px #14b8a6" }} />
            <span style={{ fontSize: 13, color: "#8892aa", fontWeight: 500 }}>Now in private beta — join the waitlist</span>
          </div>
          <h1 style={{ fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", marginBottom: 24 }}>
            From data to decision.<br />
            <span className="gradient-text">At the speed of insight.</span>
          </h1>
          <p style={{ fontSize: 18, color: "#8892aa", lineHeight: 1.7, marginBottom: 48, maxWidth: 580, margin: "0 auto 48px" }}>
            Finsyt is the AI-powered financial intelligence workspace for founders, operators, and analysts who need to move fast on macro + company signals.
          </p>
          {!submitted ? (
            <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }} className="hero-cta">
              <input type="email" placeholder="Enter your work email" value={email} onChange={e => setEmail(e.target.value)} required />
              <button type="submit" className="btn-primary">Join the waitlist →</button>
            </form>
          ) : (
            <div style={{ background: "#131929", border: "1px solid #0d9488", borderRadius: 12, padding: "16px 32px", display: "inline-block" }}>
              <span style={{ color: "#14b8a6", fontWeight: 600 }}>✓ You're on the list! We'll be in touch soon.</span>
            </div>
          )}
          <p style={{ marginTop: 16, fontSize: 13, color: "#4a5568" }}>No credit card required · Cancel anytime</p>
        </div>

        {/* Mock dashboard preview */}
        <div style={{ maxWidth: 1000, margin: "80px auto 0", padding: "0 24px" }}>
          <div style={{ background: "#0f1628", border: "1px solid #1e2a42", borderRadius: 20, padding: 24, boxShadow: "0 40px 80px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["#ef4444","#f59e0b","#22c55e"].map((c,i) => <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
              {[
                { label: "Portfolio Value", value: "$2.4M", change: "+3.2%", up: true },
                { label: "Active Signals", value: "47", change: "+12 today", up: true },
                { label: "Risk Score", value: "Low", change: "Stable", up: null },
                { label: "Alerts", value: "3", change: "Action needed", up: false },
              ].map((m, i) => (
                <div key={i} style={{ background: "#131929", borderRadius: 12, padding: 16, border: "1px solid #1e2a42" }}>
                  <div style={{ fontSize: 11, color: "#8892aa", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{m.value}</div>
                  <div style={{ fontSize: 12, color: m.up === true ? "#22c55e" : m.up === false ? "#ef4444" : "#8892aa" }}>{m.change}</div>
                </div>
              ))}
            </div>
            <div style={{ height: 120, background: "#131929", borderRadius: 12, border: "1px solid #1e2a42", display: "flex", alignItems: "flex-end", padding: 16, gap: 4, overflow: "hidden" }}>
              {[40,55,48,70,62,80,75,90,85,95,88,100].map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: `linear-gradient(180deg, #3b82f6, #0d9488)`, borderRadius: "4px 4px 0 0", opacity: 0.8 }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <div id="features" style={{ background: "#0a0e1a" }}>
        <section>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Features</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 16 }}>Everything you need to move fast</h2>
            <p style={{ color: "#8892aa", fontSize: 17, maxWidth: 560, margin: "0 auto" }}>From real-time macro signals to AI-generated summaries, Finsyt gives you the full picture in one workspace.</p>
          </div>
          <div className="feature-grid">
            {[
              { icon: "📡", title: "Live Signal Monitoring", desc: "Track macro and company-level signals in real time. Get notified the moment something moves." },
              { icon: "🤖", title: "AI-Powered Summaries", desc: "Stop reading noise. Finsyt's AI distills thousands of data points into sharp, actionable insights." },
              { icon: "📊", title: "Data Explorer", desc: "Search, filter, and visualise datasets from World Bank, IMF, and 50+ global sources." },
              { icon: "⚡", title: "Workflow Tools", desc: "Move from insight to action. Build watchlists, set alerts, and collaborate with your team." },
              { icon: "🌍", title: "Global Coverage", desc: "190+ countries. Regional breakdowns. Sector-level drill-downs. No blind spots." },
              { icon: "🔗", title: "Integrations", desc: "Connect your existing tools. World Bank Data360, Bloomberg, and more." },
            ].map((f, i) => (
              <div key={i} className="card">
                <div style={{ fontSize: 32, marginBottom: 16 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10 }}>{f.title}</div>
                <div style={{ color: "#8892aa", fontSize: 14, lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* HOW IT WORKS */}
      <div id="how-it-works" style={{ background: "#0f1628" }}>
        <section>
          <div style={{ textAlign: "center", marginBottom: 60 }}>
            <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>How It Works</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Data to decision in 3 steps</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 780, margin: "0 auto" }}>
            {[
              { num: "01", title: "Connect your data sources", desc: "Link your existing tools and data feeds. Finsyt ingests signals from 50+ global financial and economic sources automatically." },
              { num: "02", title: "Surface insights with AI", desc: "Our AI models process the noise and surface what actually matters — ranked by relevance to your watchlist, portfolio, or focus areas." },
              { num: "03", title: "Act with confidence", desc: "Use Finsyt's workflow tools to document decisions, set alerts, and collaborate with your team — all in context." },
            ].map((s, i) => (
              <div key={i} className="step">
                <div style={{ minWidth: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg, #2563eb22, #0d948822)", border: "1px solid #2563eb44", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, color: "#3b82f6" }}>{s.num}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{s.title}</div>
                  <div style={{ color: "#8892aa", lineHeight: 1.7, fontSize: 15 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* TESTIMONIALS */}
      <div style={{ background: "#0a0e1a" }}>
        <section>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Social Proof</div>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Trusted by operators who move fast</h2>
          </div>
          <div className="testimonial-grid">
            {[
              { name: "Sarah K.", role: "CFO, Series B SaaS", quote: "Finsyt replaced three separate tools. Our weekly macro review went from 2 hours to 15 minutes." },
              { name: "Marcus T.", role: "Investment Analyst, VC", quote: "The AI summaries are actually useful. It's not just noise — it surfaces the signals I actually care about." },
              { name: "Priya M.", role: "Founder & CEO", quote: "I finally feel like I have the same information advantage as my investors. Game changer." },
            ].map((t, i) => (
              <div key={i} className="card" style={{ position: "relative" }}>
                <div style={{ fontSize: 40, color: "#2563eb22", position: "absolute", top: 20, right: 20, fontFamily: "serif" }}>"</div>
                <p style={{ color: "#c8cdd8", lineHeight: 1.7, fontSize: 15, marginBottom: 24 }}>"{t.quote}"</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15 }}>{t.name[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#8892aa" }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* CTA */}
      <div style={{ background: "#0f1628", borderTop: "1px solid #1e2a42", borderBottom: "1px solid #1e2a42" }}>
        <section style={{ textAlign: "center" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20 }}>
              Ready to move at the<br /><span className="gradient-text">speed of insight?</span>
            </h2>
            <p style={{ color: "#8892aa", fontSize: 17, marginBottom: 40 }}>Join hundreds of founders and analysts already on the waitlist.</p>
            {!submitted ? (
              <form onSubmit={handleSubmit} style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <input type="email" placeholder="Enter your work email" value={email} onChange={e => setEmail(e.target.value)} required />
                <button type="submit" className="btn-primary">Get early access →</button>
              </form>
            ) : (
              <div style={{ background: "#131929", border: "1px solid #0d9488", borderRadius: 12, padding: "16px 32px", display: "inline-block" }}>
                <span style={{ color: "#14b8a6", fontWeight: 600 }}>✓ You're on the list!</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* FOOTER */}
      <footer style={{ background: "#0a0e1a", padding: "40px 24px", textAlign: "center", borderTop: "1px solid #1e2a42" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>F</div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Finsyt</span>
        </div>
        <p style={{ color: "#4a5568", fontSize: 13 }}>© 2026 Finsyt. All rights reserved.</p>
      </footer>
    </div>
  );
}
