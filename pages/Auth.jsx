import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function Auth() {
  const [mode, setMode] = useState("signin"); // signin | signup | forgot
  const [form, setForm] = useState({ email: "", password: "", name: "", confirmPassword: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const supabase = useMemo(() => {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_URL ||
      "";
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_finsyt_finsytSUPABASE_PUBLISHABLE_KEY ||
      "";

    if (!supabaseUrl || !supabaseAnonKey) return null;
    return createClient(supabaseUrl, supabaseAnonKey);
  }, []);

  const resetFeedback = () => {
    setError("");
    setMessage("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetFeedback();
    setLoading(true);

    try {
      if (!supabase) {
        throw new Error("Supabase auth is not configured. Add NEXT_PUBLIC_* Supabase env vars in Vercel.");
      }

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (signInError) throw signInError;
        setSubmitted(true);
        setMessage("Signed in successfully. Redirecting...");
        return;
      }

      if (mode === "signup") {
        if (form.password !== form.confirmPassword) {
          throw new Error("Passwords do not match.");
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: { full_name: form.name || undefined },
          },
        });
        if (signUpError) throw signUpError;
        setSubmitted(true);
        setMessage("Account created. Check your email to verify your account.");
        return;
      }

      if (mode === "forgot") {
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/reset-password`
            : undefined;

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo,
        });
        if (resetError) throw resetError;
        setSubmitted(true);
        setMessage(`We sent a reset link to ${form.email}.`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed.";
      setError(msg);
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    resetFeedback();
    setLoading(true);
    try {
      if (!supabase) {
        throw new Error("Supabase auth is not configured. Add NEXT_PUBLIC_* Supabase env vars in Vercel.");
      }

      const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (oauthError) throw oauthError;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OAuth sign in failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#0a0e1a", color: "#e8eaf0", minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .gradient-text { background: linear-gradient(135deg, #3b82f6, #14b8a6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .input-group { display: flex; flex-direction: column; gap: 6px; }
        .input-group label { font-size: 13px; font-weight: 600; color: #8892aa; }
        .input-group input { background: #131929; border: 1px solid #1e2a42; color: #e8eaf0; padding: 12px 16px; border-radius: 10px; font-size: 14px; outline: none; transition: border-color 0.2s; }
        .input-group input:focus { border-color: #3b82f6; }
        .btn-primary { background: linear-gradient(135deg, #2563eb, #0d9488); color: white; border: none; padding: 14px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%; transition: all 0.2s; }
        .btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
        .btn-social { background: #131929; border: 1px solid #1e2a42; color: #e8eaf0; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 500; cursor: pointer; width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s; }
        .btn-social:hover { border-color: #3b82f644; }
        a { color: #3b82f6; cursor: pointer; text-decoration: none; }
        a:hover { text-decoration: underline; }
        @media (max-width: 768px) { div[style*="grid-template-columns"] { grid-template-columns: 1fr !important; } .left-panel { display: none !important; } }
      `}</style>

      {/* LEFT PANEL */}
      <div className="left-panel" style={{ background: "#0f1628", borderRight: "1px solid #1e2a42", padding: 60, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: "20%", left: "50%", transform: "translateX(-50%)", width: 500, height: 300, background: "radial-gradient(ellipse, rgba(37,99,235,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
        
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18 }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 20 }}>Finsyt</span>
        </div>

        {/* Quote section */}
        <div>
          <h2 style={{ fontSize: "clamp(28px, 3vw, 40px)", fontWeight: 900, lineHeight: 1.2, letterSpacing: "-0.03em", marginBottom: 24 }}>
            The intelligence workspace<br />for operators who<br /><span className="gradient-text">move fast.</span>
          </h2>
          <div style={{ background: "#131929", border: "1px solid #1e2a42", borderRadius: 14, padding: 24 }}>
            <p style={{ color: "#c8cdd8", lineHeight: 1.7, fontSize: 15, marginBottom: 16 }}>
              "Finsyt replaced three separate tools. Our macro review now takes 15 minutes instead of 2 hours."
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg, #2563eb, #0d9488)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>S</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Sarah K.</div>
                <div style={{ fontSize: 12, color: "#8892aa" }}>CFO, Series B SaaS</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 32 }}>
          {[["500+", "Beta users"], ["50+", "Data sources"], ["2.4M+", "Daily signals"]].map(([val, label], i) => (
            <div key={i}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#3b82f6" }}>{val}</div>
              <div style={{ fontSize: 12, color: "#8892aa" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
        <div style={{ width: "100%", maxWidth: 420 }}>

          {mode === "signin" && (
            <>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>Welcome back</h1>
              <p style={{ color: "#8892aa", fontSize: 15, marginBottom: 36 }}>Sign in to your Finsyt workspace.</p>

              {/* Social logins */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                <button className="btn-social" onClick={() => handleOAuth("google")} disabled={loading}>
                  <span style={{ fontSize: 18 }}>G</span> Continue with Google
                </button>
                <button className="btn-social" onClick={() => handleOAuth("linkedin_oidc")} disabled={loading}>
                  <span style={{ fontSize: 18 }}>in</span> Continue with LinkedIn
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                <div style={{ flex: 1, height: 1, background: "#1e2a42" }} />
                <span style={{ fontSize: 12, color: "#4a5568" }}>or continue with email</span>
                <div style={{ flex: 1, height: 1, background: "#1e2a42" }} />
              </div>

              {submitted ? (
                <div style={{ textAlign: "center", padding: 32 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
                  <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Signed in!</div>
                  <div style={{ color: "#8892aa", fontSize: 14 }}>Redirecting to your dashboard...</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div className="input-group">
                    <label>Email</label>
                    <input type="email" placeholder="you@company.com" value={form.email} onChange={e => update("email", e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Password</label>
                    <input type="password" placeholder="••••••••" value={form.password} onChange={e => update("password", e.target.value)} required />
                  </div>
                  <div style={{ textAlign: "right", marginTop: -8 }}>
                    <a onClick={() => setMode("forgot")} style={{ fontSize: 13 }}>Forgot password?</a>
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Signing in..." : "Sign in →"}</button>
                </form>
              )}
              {!!message && <p style={{ color: "#14b8a6", fontSize: 13, marginTop: 14 }}>{message}</p>}
              {!!error && <p style={{ color: "#f87171", fontSize: 13, marginTop: 14 }}>{error}</p>}

              <p style={{ textAlign: "center", fontSize: 14, color: "#8892aa", marginTop: 28 }}>
                Don't have an account? <a onClick={() => setMode("signup")}>Sign up</a>
              </p>
            </>
          )}

          {mode === "signup" && (
            <>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>Create your account</h1>
              <p style={{ color: "#8892aa", fontSize: 15, marginBottom: 36 }}>Start your 14-day free trial. No credit card required.</p>

              {submitted ? (
                <div style={{ textAlign: "center", padding: 32 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
                  <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Account created!</div>
                  <div style={{ color: "#8892aa", fontSize: 14 }}>Check your email to verify your account.</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div className="input-group">
                    <label>Full name</label>
                    <input type="text" placeholder="Jaime Henriques" value={form.name} onChange={e => update("name", e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Work email</label>
                    <input type="email" placeholder="you@company.com" value={form.email} onChange={e => update("email", e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Password</label>
                    <input type="password" placeholder="Min. 8 characters" value={form.password} onChange={e => update("password", e.target.value)} required />
                  </div>
                  <div className="input-group">
                    <label>Confirm password</label>
                    <input type="password" placeholder="••••••••" value={form.confirmPassword} onChange={e => update("confirmPassword", e.target.value)} required />
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Creating account..." : "Create account →"}</button>
                  <p style={{ fontSize: 12, color: "#4a5568", textAlign: "center" }}>By signing up you agree to our Terms and Privacy Policy.</p>
                </form>
              )}
              {!!message && <p style={{ color: "#14b8a6", fontSize: 13, marginTop: 14 }}>{message}</p>}
              {!!error && <p style={{ color: "#f87171", fontSize: 13, marginTop: 14 }}>{error}</p>}

              <p style={{ textAlign: "center", fontSize: 14, color: "#8892aa", marginTop: 28 }}>
                Already have an account? <a onClick={() => setMode("signin")}>Sign in</a>
              </p>
            </>
          )}

          {mode === "forgot" && (
            <>
              <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 8 }}>Reset password</h1>
              <p style={{ color: "#8892aa", fontSize: 15, marginBottom: 36 }}>Enter your email and we'll send you a reset link.</p>

              {submitted ? (
                <div style={{ background: "#131929", border: "1px solid #0d9488", borderRadius: 12, padding: 24, textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📧</div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: "#14b8a6" }}>Check your inbox</div>
                  <div style={{ color: "#8892aa", fontSize: 14 }}>We sent a reset link to {form.email}</div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div className="input-group">
                    <label>Email</label>
                    <input type="email" placeholder="you@company.com" value={form.email} onChange={e => update("email", e.target.value)} required />
                  </div>
                  <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Sending..." : "Send reset link →"}</button>
                </form>
              )}
              {!!message && <p style={{ color: "#14b8a6", fontSize: 13, marginTop: 14 }}>{message}</p>}
              {!!error && <p style={{ color: "#f87171", fontSize: 13, marginTop: 14 }}>{error}</p>}

              <p style={{ textAlign: "center", fontSize: 14, color: "#8892aa", marginTop: 28 }}>
                <a onClick={() => setMode("signin")}>← Back to sign in</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
