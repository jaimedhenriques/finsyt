import { useState } from "react";

const TABS = ["Profile", "Notifications", "Billing"];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("Profile");
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: "Jaime Henriques", email: "jaimedhenriques@gmail.com", role: "Founder & CEO", company: "Finsyt", timezone: "Europe/London" });
  const [notifications, setNotifications] = useState({ priceAlerts: true, aiInsights: true, macroEvents: true, weeklyDigest: true, emailAlerts: true, slackAlerts: true, pushAlerts: false });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0e1a", color: "#e8eaf0", minHeight: "100vh", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sidebar-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 10px; cursor: pointer; transition: all 0.15s; font-size: 14px; font-weight: 500; color: #8892aa; }
        .sidebar-item:hover { background: #131929; color: #e8eaf0; }
        .sidebar-item.active { background: linear-gradient(135deg, #2563eb22, #0d948822); color: #3b82f6; border: 1px solid #2563eb33; }
        .tab { padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; border: none; transition: all 0.15s; }
        .tab.active { background: linear-gradient(135deg, #2563eb, #0d9488); color: white; }
        .tab:not(.active) { background: transparent; color: #8892aa; }
        .tab:not(.active):hover { color: #e8eaf0; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-group label { font-size: 13px; font-weight: 600; color: #8892aa; }
        .form-group input, .form-group select { background: #131929; border: 1px solid #1e2a42; color: #e8eaf0; padding: 12px 16px; border-radius: 10px; font-size: 14px; outline: none; transition: border-color 0.2s; }
        .form-group input:focus, .form-group select:focus { border-color: #3b82f6; }
        .form-group select option { background: #131929; }
        .btn-primary { background: linear-gradient(135deg, #2563eb, #0d9488); color: white; border: none; padding: 12px 28px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .btn-primary:hover { opacity: 0.9; }
        .toggle { width: 44px; height: 24px; border-radius: 100px; border: none; cursor: pointer; position: relative; transition: background 0.2s; }
        .toggle::after { content: ''; position: absolute; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: white; transition: left 0.2s; }
        .toggle.on { background: linear-gradient(135deg, #2563eb, #0d9488); }
        .toggle.on::after { left: 23px; }
        .toggle.off { background: #1e2a42; }
        .toggle.off::after { left: 3px; }
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
          <div key={item.key} className="sidebar-item">
            <span style={{ fontSize: 16 }}>{item.icon}</span> {item.label}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="sidebar-item active"><span>⚙️</span> Settings</div>
        <div style={{ padding: "12px 16px", background: "#131929", borderRadius: 10, border: "1px solid #1e2a42", marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "#8892aa", marginBottom: 4 }}>Pro Plan</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Jaime H.</div>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, overflow: "auto", padding: 32 }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Settings</h1>
          <p style={{ color: "#8892aa", fontSize: 14 }}>Manage your account, notifications, and billing.</p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "#131929", border: "1px solid #1e2a42", borderRadius: 12, padding: 4, marginBottom: 32, width: "fit-content" }}>
          {TABS.map(t => (
            <button key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>{t}</button>
          ))}
        </div>

        {/* PROFILE TAB */}
        {activeTab === "Profile" && (
          <div style={{ maxWidth: 600 }}>
            {/* Avatar */}
            <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, padding: 28, marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 24, paddingBottom: 24, borderBottom: "1px solid #1e2a42" }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 28 }}>J</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>{profile.name}</div>
                  <div style={{ fontSize: 13, color: "#8892aa", marginBottom: 12 }}>{profile.email}</div>
                  <button style={{ background: "transparent", border: "1px solid #1e2a42", color: "#8892aa", padding: "6px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Change photo</button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div className="form-group">
                  <label>Full name</label>
                  <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Role / Title</label>
                  <input value={profile.role} onChange={e => setProfile(p => ({ ...p, role: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Company</label>
                  <input value={profile.company} onChange={e => setProfile(p => ({ ...p, company: e.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>Timezone</label>
                  <select value={profile.timezone} onChange={e => setProfile(p => ({ ...p, timezone: e.target.value }))}>
                    <option value="Europe/London">Europe/London (GMT+1)</option>
                    <option value="America/New_York">America/New_York (GMT-4)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (GMT-7)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Password */}
            <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, padding: 28, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Password</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {["Current password", "New password", "Confirm new password"].map((label, i) => (
                  <div key={i} className="form-group">
                    <label>{label}</label>
                    <input type="password" placeholder="••••••••" />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button className="btn-primary" onClick={handleSave}>Save changes</button>
              {saved && <span style={{ color: "#14b8a6", fontSize: 14, fontWeight: 600 }}>✓ Saved!</span>}
            </div>
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === "Notifications" && (
          <div style={{ maxWidth: 600 }}>
            <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, padding: 28, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Alert types</div>
              <div style={{ fontSize: 13, color: "#8892aa", marginBottom: 24 }}>Choose which events trigger notifications.</div>
              {[
                { key: "priceAlerts", label: "Price alerts", desc: "When a watchlist item crosses a threshold" },
                { key: "aiInsights", label: "AI insights", desc: "When new AI-generated insights are available" },
                { key: "macroEvents", label: "Macro events", desc: "Key economic releases and central bank decisions" },
                { key: "weeklyDigest", label: "Weekly digest", desc: "A weekly summary of your top signals" },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #1e2a4233" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 12, color: "#8892aa" }}>{desc}</div>
                  </div>
                  <button className={`toggle ${notifications[key] ? "on" : "off"}`} onClick={() => setNotifications(n => ({ ...n, [key]: !n[key] }))} />
                </div>
              ))}
            </div>

            <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, padding: 28, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Delivery channels</div>
              <div style={{ fontSize: 13, color: "#8892aa", marginBottom: 24 }}>Where to receive your notifications.</div>
              {[
                { key: "emailAlerts", label: "Email", desc: "jaimedhenriques@gmail.com", icon: "📧" },
                { key: "slackAlerts", label: "Slack", desc: "Connected to Jaime Henriques workspace", icon: "💬" },
                { key: "pushAlerts", label: "Push notifications", desc: "Browser and mobile push", icon: "📱" },
              ].map(({ key, label, desc, icon }) => (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #1e2a4233" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontSize: 20 }}>{icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
                      <div style={{ fontSize: 12, color: "#8892aa" }}>{desc}</div>
                    </div>
                  </div>
                  <button className={`toggle ${notifications[key] ? "on" : "off"}`} onClick={() => setNotifications(n => ({ ...n, [key]: !n[key] }))} />
                </div>
              ))}
            </div>
            <button className="btn-primary" onClick={handleSave}>Save preferences</button>
            {saved && <span style={{ color: "#14b8a6", fontSize: 14, fontWeight: 600, marginLeft: 12 }}>✓ Saved!</span>}
          </div>
        )}

        {/* BILLING TAB */}
        {activeTab === "Billing" && (
          <div style={{ maxWidth: 600 }}>
            {/* Current plan */}
            <div style={{ background: "#0f1d3a", border: "1px solid #2563eb", borderRadius: 16, padding: 28, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Current Plan</div>
                  <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.02em" }}>Pro <span style={{ fontSize: 16, color: "#8892aa", fontWeight: 400 }}>· $49/mo</span></div>
                </div>
                <span style={{ background: "#22c55e22", color: "#22c55e", padding: "4px 12px", borderRadius: 100, fontSize: 12, fontWeight: 700 }}>Active</span>
              </div>
              <div style={{ fontSize: 13, color: "#8892aa", marginBottom: 20 }}>Renews on May 10, 2026 · Billed monthly</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button style={{ background: "linear-gradient(135deg, #2563eb, #0d9488)", border: "none", color: "white", padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Upgrade to Team</button>
                <button style={{ background: "transparent", border: "1px solid #1e2a42", color: "#8892aa", padding: "10px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Cancel plan</button>
              </div>
            </div>

            {/* Payment method */}
            <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, padding: 28, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Payment method</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#0a0e1a", border: "1px solid #1e2a42", borderRadius: 10 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ background: "#1e3a8a", borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 800 }}>VISA</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>•••• •••• •••• 4242</div>
                    <div style={{ fontSize: 12, color: "#8892aa" }}>Expires 12/27</div>
                  </div>
                </div>
                <button style={{ background: "transparent", border: "1px solid #1e2a42", color: "#8892aa", padding: "6px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Update</button>
              </div>
              <button style={{ marginTop: 12, background: "transparent", border: "1px dashed #1e2a42", color: "#8892aa", padding: "10px", borderRadius: 8, fontSize: 13, cursor: "pointer", width: "100%" }}>+ Add payment method</button>
            </div>

            {/* Invoice history */}
            <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 16, padding: 28 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Invoice history</div>
              {[
                { date: "Apr 10, 2026", amount: "$49.00", status: "Paid" },
                { date: "Mar 10, 2026", amount: "$49.00", status: "Paid" },
                { date: "Feb 10, 2026", amount: "$49.00", status: "Paid" },
              ].map((inv, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < 2 ? "1px solid #1e2a4233" : "none" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>Pro Plan — {inv.date}</div>
                    <span style={{ fontSize: 11, background: "#22c55e22", color: "#22c55e", padding: "2px 8px", borderRadius: 100, fontWeight: 700 }}>{inv.status}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{inv.amount}</span>
                    <button style={{ background: "transparent", border: "1px solid #1e2a42", color: "#8892aa", padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>PDF</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
