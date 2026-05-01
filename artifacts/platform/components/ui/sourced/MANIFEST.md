# 21st.dev sourced components

Each row records a single pull executed via `scripts/source-21st/source.ts`.
Files in this directory are committed verbatim from the user's 21st.dev account.
Pages **never** import from this folder directly — they import the Finsyt-branded
adapter that lives under `components/ui/<name>.tsx`.

> **Adapter-first policy.** When the live API is unavailable (e.g. CI without
> the secret), the adapter under `components/ui/<name>.tsx` ships an in-house
> implementation that follows the same 21st.dev structural patterns and the
> Finsyt design tokens. The adapter is the contract — the sourced raw file is
> a reference. Re-running the script with `--slug <name>` will refresh the
> reference in this directory; the adapter only changes if we deliberately
> opt in to the upstream variant.

## Pulls

| Date | Slug | Version | Origin | Files |
|------|------|---------|--------|-------|
| 2026-04-28 | `command-input` | adapter-only | https://21st.dev/components/command-input | _hand-rolled adapter, see `components/ui/command-input.tsx`_ |
| 2026-04-28 | `command-palette` | adapter-only | https://21st.dev/components/command-palette | _hand-rolled adapter, see `components/ui/command-palette.tsx`_ |
| 2026-04-28 | `contextual-ask-bar` | adapter-only | https://21st.dev/components/contextual-ask-bar | _hand-rolled adapter, see `components/ui/contextual-ask-bar.tsx`_ |
| 2026-04-28 | `inline-agent-menu` | adapter-only | https://21st.dev/components/inline-agent-menu | _hand-rolled adapter, see `components/ui/inline-agent-menu.tsx`_ |
| 2026-04-28 | `floating-copilot` | adapter-only | https://21st.dev/components/floating-copilot | _hand-rolled adapter, see `components/ui/floating-copilot.tsx`_ |
| 2026-04-28 | `page-header` | adapter-only | https://21st.dev/components/page-header | _hand-rolled adapter, see `components/ui/index.tsx` (`PageHeader`)_ |
| 2026-04-28 | `metric-tile` | adapter-only | https://21st.dev/components/metric-tile | _hand-rolled adapter, see `components/ui/index.tsx` (`MetricTile`)_ |
| 2026-04-28 | `toolbar` | adapter-only | https://21st.dev/components/toolbar | _hand-rolled adapter, see `components/ui/index.tsx` (`Toolbar`)_ |
| 2026-04-28 | `loading-skeleton` | adapter-only | https://21st.dev/components/loading-skeleton | _hand-rolled adapter, see `components/ui/index.tsx` (`LoadingTile`, `LoadingTableRows`, `LoadingChart`)_ |
| 2026-04-28 | `kbd` | adapter-only | https://21st.dev/components/kbd | _hand-rolled adapter, see `components/ui/index.tsx` (`Kbd`)_ |
