---
name: Alt-data tiles reuse
description: Design rule for sharing the Apify-backed alt-data cards across multi-ticker pages
---

# Alt-data tiles reuse

The Apify-backed alt-data tiles (Insider activity, People & Culture, Filing
Signal) are reusable cards shared by the company, screener, portfolio, and
peers surfaces (under `artifacts/platform/components/alt-data/`).

**Rule:** on any page that lists many tickers, bind the alt-data cards to ONE
selectable focus ticker — never map the cards over a list of rows.

**Why:** each card can trigger an Apify actor run, billed per run against the
connecting user's Apify account. Rendering cards per visible row would fan out
many paid runs on a single page load. A shared TTL'd cache with in-flight
dedupe also collapses repeat lookups of the same ticker across pages so
navigating doesn't re-bill.

**How to apply:** reuse the shared section + focus-picker components with a
single focus symbol. The original task wording implied per-row rendering; the
bounded focus-ticker approach is the intentional, cost-driven deviation.

Row selection (clicking a row in the screener/portfolio/peers table) is an
additional way to pick the focus ticker — it must set the *same* single focus
symbol the FocusPicker drives, never spawn a card per row. Keep both selectors
pointed at one shared `focusSymbol` state so they stay in sync and only one
ticker's alt-data loads at a time.
