/**
 * Clerk-popup auth page for the Excel add-in.
 *
 * Loaded inside an Office Dialog API popup window (opened by the task pane
 * via `Office.context.ui.displayDialogAsync`). This is a normal Next.js
 * page that lives behind Clerk middleware, so by the time it renders the
 * user is guaranteed to be signed in. We then mint a short-lived add-in
 * JWT and post it back to the parent task pane via
 * `Office.context.ui.messageParent`.
 *
 * The user never sees this page for more than a fraction of a second on a
 * happy-path flow — Clerk redirects through sign-in if needed and lands
 * here, and the page closes itself almost immediately.
 */

"use client";

import { useEffect, useState } from "react";

const OFFICE_JS = "https://appsforoffice.microsoft.com/lib/1/hosted/office.js";

declare global {
  interface Window {
    Office?: {
      onReady: (cb: () => void) => void;
      context: {
        ui: {
          messageParent: (message: string) => void;
        };
      };
    };
  }
}

export default function ExcelAddinAuthPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // Dynamically inject office.js because we don't want it on every
        // page in the platform.
        await new Promise<void>((resolve, reject) => {
          if (window.Office) return resolve();
          const s = document.createElement("script");
          s.src = OFFICE_JS;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Failed to load office.js"));
          document.head.appendChild(s);
        });
        if (cancelled) return;

        const res = await fetch("/platform/api/excel-addin/token", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || "Token request failed (HTTP " + res.status + ")");
        }
        const j = (await res.json()) as { token?: string; email?: string };
        if (!j.token) throw new Error("No token returned by server.");

        const payload = JSON.stringify({ token: j.token, email: j.email || null });

        await new Promise<void>((resolve) => {
          if (!window.Office) return resolve();
          window.Office.onReady(() => resolve());
        });
        if (cancelled) return;

        try {
          window.Office?.context.ui.messageParent(payload);
        } catch (e) {
          // If the page was opened directly (not from a dialog), there's no
          // parent to message — surface a useful error.
          throw new Error("This page must be opened from the Finsyt Excel task pane.");
        }
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        const msg = (e as Error).message || String(e);
        setError(msg);
        setStatus("error");
        // Still try to surface the error to the parent window so the task
        // pane can show it.
        try {
          window.Office?.context.ui.messageParent(JSON.stringify({ error: msg }));
        } catch {/* ignore */}
      }
    }

    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "-apple-system, 'Segoe UI', system-ui, sans-serif",
        padding: 24,
        color: "#0A1628",
        background: "#FAFBFC",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 22, color: "#1B4FFF", marginBottom: 6 }}>
        Finsyt
      </div>
      {status === "loading" && (
        <div style={{ color: "#7D8FA9", fontSize: 13 }}>Connecting to Excel…</div>
      )}
      {status === "ready" && (
        <div style={{ color: "#0F5132", fontSize: 13 }}>Connected. You can close this window.</div>
      )}
      {status === "error" && (
        <div style={{ color: "#7A1B1B", fontSize: 13, maxWidth: 320, textAlign: "center" }}>
          {error || "Unknown error"}
        </div>
      )}
    </div>
  );
}
