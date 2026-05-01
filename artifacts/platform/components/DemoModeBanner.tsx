"use client";

import { useEffect, useState } from "react";

/**
 * Visible-but-dismissible banner for `PLATFORM_OPEN_MODE`.
 *
 * Renders only when open mode is on (the server passes `enabled` based on
 * `OPEN_MODE`, so the banner code path doesn't ship to authenticated
 * production builds at all).
 *
 * Persistence semantics:
 * - Sticky at the top of the app shell with unmistakable amber styling.
 * - Dismissible: clicking the close button hides it for the rest of the
 *   session. We use `sessionStorage` (not `localStorage`) so the warning
 *   re-appears the next time the user opens the platform — auth-bypass is
 *   too important to forget about across sessions.
 */
const DISMISS_KEY = "finsyt:demo-banner-dismissed";

export default function DemoModeBanner({ enabled }: { enabled: boolean }) {
  const [dismissed, setDismissed] = useState(false);

  // Read sessionStorage on mount only — SSR safe.
  useEffect(() => {
    if (!enabled) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      // sessionStorage unavailable (private mode, sandboxed iframe) — show banner.
    }
  }, [enabled]);

  if (!enabled || dismissed) return null;

  function handleDismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore — the banner will simply re-show on next render
    }
    setDismissed(true);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        background: "linear-gradient(90deg, rgba(251,191,36,0.18), rgba(251,191,36,0.10))",
        borderBottom: "1px solid rgba(251,191,36,0.45)",
        color: "#FFD580",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.02em",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <span aria-hidden>⚠</span>
      <span>Demo mode — authentication is disabled. Do not use with real data.</span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss demo mode banner for this session"
        style={{
          marginLeft: 8,
          background: "transparent",
          border: "1px solid rgba(251,191,36,0.45)",
          color: "#FFD580",
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 10px",
          borderRadius: 4,
          cursor: "pointer",
          lineHeight: 1.4,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
