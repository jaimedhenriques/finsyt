"use client";

import { useState, useEffect } from "react";

export default function RogoFelixClone() {
  const [animStep, setAnimStep] = useState(0);
  // 0 = empty email, 1 = email filled, 2 = files appear

  useEffect(() => {
    const t1 = setTimeout(() => setAnimStep(1), 800);
    const t2 = setTimeout(() => setAnimStep(2), 2400);
    const t3 = setTimeout(() => setAnimStep(0), 5000);
    const loop = setInterval(() => {
      setAnimStep(0);
      setTimeout(() => setAnimStep(1), 800);
      setTimeout(() => setAnimStep(2), 2400);
    }, 5500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearInterval(loop); };
  }, []);

  return (
    <div style={{
      fontFamily: "'Georgia', 'Times New Roman', serif",
      background: "#F0F0EE",
      color: "#0D0D0B",
      minHeight: "100vh",
      margin: 0,
      padding: 0,
    }}>

      {/* NAV */}
      <nav style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 40px",
      }}>
        <span style={{ fontSize: 18, fontWeight: 400, letterSpacing: "-0.5px", fontFamily: "'Georgia', serif" }}>rogo</span>
        <button style={{
          background: "#1A3028",
          color: "#fff",
          border: "none",
          borderRadius: 9999,
          padding: "10px 22px",
          fontSize: 14,
          fontWeight: 500,
          fontFamily: "system-ui, sans-serif",
          cursor: "pointer",
          letterSpacing: "-0.2px",
        }}>
          Request Access
        </button>
      </nav>

      {/* HERO */}
      <section style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: 180,
        paddingBottom: 80,
        textAlign: "center",
        maxWidth: 800,
        margin: "0 auto",
        padding: "180px 40px 80px",
      }}>
        <h1 style={{
          fontSize: "clamp(56px, 8vw, 96px)",
          fontWeight: 400,
          lineHeight: 1.02,
          letterSpacing: "-3px",
          margin: "0 0 28px",
          fontFamily: "'Georgia', 'Playfair Display', serif",
        }}>
          Meet Felix.<br />
          Your new colleague.
        </h1>
        <p style={{
          fontSize: 18,
          color: "#9B9B96",
          fontFamily: "system-ui, -apple-system, sans-serif",
          fontWeight: 400,
          margin: "0 0 48px",
          lineHeight: 1.5,
        }}>
          Delegate tasks to Felix. Available 24/7 by email.
        </p>
        <button style={{
          background: "#1A3028",
          color: "#fff",
          border: "none",
          borderRadius: 9999,
          padding: "16px 40px",
          fontSize: 16,
          fontWeight: 500,
          fontFamily: "system-ui, sans-serif",
          cursor: "pointer",
          letterSpacing: "-0.3px",
        }}>
          Request Access
        </button>
      </section>

      {/* EMAIL DEMO */}
      <section style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "0 40px 120px",
      }}>
        {/* Email compose */}
        <div style={{
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 4px 40px rgba(0,0,0,0.08)",
          overflow: "hidden",
          marginBottom: 16,
          transition: "opacity 0.4s",
        }}>
          {/* Email header */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #F3F3F1" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, color: "#9B9B96", fontFamily: "system-ui, sans-serif", marginRight: 4 }}>To:</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#F0F0EE", borderRadius: 6, padding: "4px 10px 4px 6px" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#1A3028", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "system-ui" }}>F</span>
                </div>
                <span style={{ fontSize: 13, fontFamily: "system-ui, sans-serif", fontWeight: 500 }}>Felix by Rogo</span>
                <span style={{ color: "#9B9B96", fontSize: 14, cursor: "pointer", fontFamily: "system-ui" }}>×</span>
              </div>
            </div>
          </div>
          {/* Subject */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid #F3F3F1" }}>
            <span style={{ fontSize: 14, fontFamily: "system-ui, sans-serif", color: animStep >= 1 ? "#0D0D0B" : "transparent", transition: "color 0.4s ease" }}>
              AAPL Deepdive
            </span>
          </div>
          {/* Body */}
          <div style={{ padding: "20px 24px", minHeight: 100 }}>
            <p style={{ fontSize: 14, fontFamily: "system-ui, sans-serif", color: animStep >= 1 ? "#374151" : "transparent", lineHeight: 1.7, margin: 0, transition: "color 0.5s ease 0.1s" }}>
              Hey Felix,<br /><br />
              We got this product deepdive for Apple. Can you build us a presentation and operating model?
            </p>
          </div>
        </div>

        {/* Output files */}
        <div style={{
          opacity: animStep >= 2 ? 1 : 0,
          transform: animStep >= 2 ? "translateY(0)" : "translateY(12px)",
          transition: "opacity 0.5s ease, transform 0.5s ease",
        }}>
          {[
            { icon: "🟥", name: "AAPL Discussion materials.pptx", type: "PPTX", size: "813KB" },
            { icon: "🟩", name: "AAPL Operating Model.xlsx", type: "XLSX", size: "89KB" },
          ].map((file, i) => (
            <div key={i} style={{
              background: "#fff",
              borderRadius: 12,
              padding: "16px 20px",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              gap: 16,
              boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
              opacity: animStep >= 2 ? 1 : 0,
              transform: animStep >= 2 ? "translateY(0)" : "translateY(8px)",
              transition: `opacity 0.4s ease ${i * 0.15}s, transform 0.4s ease ${i * 0.15}s`,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: file.type === "PPTX" ? "#FFF1F0" : "#F0FFF4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                {file.icon}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 500, fontFamily: "system-ui, sans-serif", color: "#0D0D0B" }}>{file.name}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#9B9B96", fontFamily: "system-ui, sans-serif" }}>
                  {file.type} <span style={{ margin: "0 6px" }}>■</span> {file.size}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FELIX WATERMARK SECTION */}
      <section style={{
        position: "relative",
        padding: "80px 0 40px",
        overflow: "hidden",
        minHeight: 400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <div style={{
          fontSize: "clamp(140px, 22vw, 280px)",
          fontWeight: 400,
          fontFamily: "'Georgia', 'Playfair Display', serif",
          letterSpacing: "-8px",
          lineHeight: 1,
          color: "transparent",
          WebkitTextStroke: "2px #E8E8E5",
          userSelect: "none",
          textShadow: "4px 4px 12px rgba(0,0,0,0.04)",
          whiteSpace: "nowrap",
        }}>
          Felix
        </div>
        <div style={{
          position: "absolute",
          bottom: 40,
          right: 48,
          fontSize: 14,
          color: "#9B9B96",
          fontFamily: "'Georgia', serif",
          fontStyle: "italic",
          letterSpacing: "-0.3px",
        }}>
          by Rogo
        </div>
      </section>

    </div>
  );
}
