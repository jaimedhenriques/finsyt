# Competitive Parity & Differentiation Roadmap

**Status:** active · **Owner:** product · **Last revised:** 2026-05-01
**Scope:** institutional financial intelligence — buy-side, IB, PE, corporate strategy
**Constraint:** every item below ships inside the existing AlphaSense-inspired
information architecture (left rail, search-first, citation drawer, company
workspace tabs, agent surfaces). No layout rewrite, no new top-level navigation
paradigm.

This document is the **umbrella roadmap** for the work needed to beat
AlphaSense, Hebbia, Rogo (Felix + product), BlueFlame, Quartr Pro, FactSet
Workstation, and Capsa. It does not duplicate the in-flight sub-tasks — it
prioritises them, references them, and identifies the two leapfrog bets that
turn Finsyt's existing platform (connector hub + provider waterfall + agent +
citations + Excel add-in) into a defensible category position.

For per-competitor design / copy capture, see the sibling specs under
`docs/research/{alpha-sense,rogo-felix,rogo-home}/spec.md`.

---

## 1 · Where Finsyt is positioned today

Finsyt is an AI-native financial intelligence + execution workspace. Live
surfaces include AI Research, Markets, Screener, Watchlist, Filings,
Transcripts, Workspaces, Macro, Private Co., Alerts, MCP / Connector Hub, API
Docs, Formula Engine (FQL), Valuations (Football Field), Executive Memo,
Excel add-in, Admin Audit, Provider Health.

Data waterfall covers FMP, EODHD, Finnhub, FRED, Polygon, Massive, Alpha
Vantage, Yahoo, Marketstack, SEC, plus Coresignal for private companies and
OpenAI / Anthropic / Groq / Perplexity on the AI side.

Marketing positions Finsyt to: hedge funds, asset managers, investment
banking, private equity, corporate strategy.

## 2 · Per-competitor dossier

> Each entry is a one-paragraph read of public marketing, schema-tagged
> feature lists, verified review snippets, and the per-competitor research
> specs already in this repo. None of it is speculative.

- **Capsa AI** — AI investment research workbench. FactSet AI Partner Program
  member. "Portfolio Deck Review & Performance Tracking" surfaced. Relies on
  FactSet feeds for data breadth. Limited public review surface.
- **BlueFlame AI** — Owned by Datasite. Agentic AI platform for PE, IB,
  private credit, hedge funds. 2025 PE Wire US Award for AI Tech Innovation.
  Public schema-tagged features: Document Q&A, Workflow automation, Custom
  Blueprints, Citations + source verification, Multi-LLM, Enterprise SSO +
  security. Customer quotes praise IC memo automation ("over 10 hours saved")
  and bulk personalised outreach drafts.
- **FactSet Workstation** — 200K+ users, 800+ data sources, 40+ years of
  curated content, multi-asset across public + private. AI-powered smart
  search, chat, research assistants. Runs an AI Partner Program that sells
  FactSet data into Finster, Model ML, Capsa, Unique. Strength = data
  breadth + workflow trust. Weakness = cost, dated UX, slow AI cadence,
  multi-week onboarding.
- **Crunched** — "AI analyst for elite advisors." Wealth / advisory
  positioning. Thin public marketing surface; not direct overlap with the
  buy-side core but adjacent in advisory + IB.
- **Rogo (Felix + product)** — Premium institutional, request-access. Felix
  agent. Strengths: earnings call summaries, transcript DB search, NL
  research with citations, real-time alerts, sentiment, cross-company /
  cross-quarter competitive intel, multi-source coverage, watchlists + tags +
  shared excerpts. New FactSet partnership (Finster strategic deal). Known
  drawbacks: no self-serve, US public companies only, weak private +
  international.
- **Hebbia** — **Matrix** is the standout. Multi-doc, multi-prompt grids:
  rows = entities (companies, deals, expert calls), columns = questions /
  transformations. Pitch: "Workflows that run like your best people. Encode
  your firm's processes once and Hebbia runs them continuously." Targets
  Asset Mgmt, IB, Pro Services, Corp Finance & Strategy. Connects private
  docs + public filings + financial data. AES-256 at rest, TLS 1.2+, no
  training on user data. Most compelling agentic UX in the category today.
- **Quartr Pro** — Live audio + real-time transcripts for 14,000+ public
  companies including earnings calls, capital markets days, investor
  conferences. Single AI chat across IR materials. Side-by-side document
  viewer, drag-and-drop insights, custom data extractions from
  tables/charts/slides. Tailored earnings calendar with sync to user's
  calendar client. Trending topic extraction. Mobile companion. "Only
  first-party data. Zero doubt." Praised for hours-to-seconds research and
  peer-cycle compilation.
- **FactSet AI Partner ecosystem (Finster / Model ML / Unique)** — Not
  full-stack competitors, but they signal where the market is going. Every
  credible AI-finance product is brokering a FactSet (or Bloomberg / CapIQ /
  Refinitiv) data deal so it can compete on breadth. Finster = agentic infra
  for IB. Model ML = agentic AI with FactSet feeds. Unique AI = enterprise
  multi-LLM platform for regulated financial services (Swiss, strong on
  compliance).

## 3 · Feature matrix

Legend: ✓ shipped · ◐ partial · ✗ missing · — not applicable · **W** =
weight (1–5) based on how often the feature surfaces in buyer conversations
and lost-deal patterns inferred from competitor copy.

| Capability | W | Finsyt today | BlueFlame | Rogo | Hebbia | Quartr Pro | FactSet WS | Capsa |
|---|---|---|---|---|---|---|---|---|
| NL research chat with cited answers | 5 | ✓ (`/api/agent/ask` + Research page) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Sentence-level citations | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ |
| Synced transcript w/ word timing | 4 | ✓ (FMP-sourced + alignment job) | ✗ | ◐ | ◐ | ✓ | ◐ | ✗ |
| **Live audio + live transcript** for earnings, CMD, conferences | 4 | ✗ | ✗ | ◐ | ✗ | ✓ (14k cos) | ◐ | ✗ |
| Investor-event calendar with .ics sync | 3 | ◐ (Alerts module) | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |
| Trending-topic / theme extraction across calls | 4 | ◐ | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ |
| Cross-company / cross-quarter Q&A clustering | 4 | ◐ | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ |
| **Multi-doc / multi-prompt analysis grid (Hebbia Matrix)** | 5 | ✗ | ◐ (Blueprints) | ◐ | ✓✓ | ◐ | ✗ | ◐ |
| **Reusable workflow Blueprints / Playbooks** | 5 | ✗ | ✓✓ | ✓ | ✓✓ | ✗ | ✗ | ◐ |
| Multi-step agent orchestrator with tool plan | 5 | ✓ (tool timeline in Research) | ✓ | ✓ | ✓✓ | ◐ | ◐ | ✓ |
| **IC / investment memo generation** | 5 | ✓ (Executive Memo tab) | ✓✓ | ✓ | ✓ | ◐ | ◐ | ◐ |
| **PowerPoint / pitch deck generation** | 5 | ◐ (in flight) | ✓ | ✓ | ✓ | ◐ | ◐ | ✓ |
| Excel add-in with custom functions | 4 | ✓ (`=FINSYT.*`) | ◐ | ✓ | ◐ | ◐ | ✓✓ | ◐ |
| Outlook / email-draft assistant | 3 | ✗ | ✓ (bulk outreach drafts) | ✗ | ◐ | ✗ | ◐ | ◐ |
| **Multi-LLM routing per task** | 3 | ✓ (OpenAI/Anthropic/Groq/Perplexity) | ✓ | ✓ | ✓ | ✗ | ◐ | ✓ |
| Connector Hub for any API/MCP | 4 | ✓✓ (catalog + custom MCP) | ◐ | ✗ | ◐ | ✗ | ✗ | ✗ |
| FactSet / CapIQ / Bloomberg data integration | 4 | ✗ | ✓ | ✓ | ✓ | ✗ | n/a | ✓ |
| Private company data (PitchBook / Coresignal class) | 4 | ◐ (Coresignal wired) | ✓ | ◐ | ✓ | ✗ | ✓ | ✓ |
| **International coverage (EU + JP)** | 4 | ◐ | ✓ | ✗ | ✓ | ✓ (global IR) | ✓ | ✓ |
| Football-field valuation + DCF sensitivity | 4 | ✓ | ✗ | ◐ | ◐ | ✗ | ✓ | ◐ |
| Peers / comps workspace | 4 | ✓ | ◐ | ✓ | ✓ | ◐ | ✓ | ✓ |
| Transaction comps from M&A | 3 | ◐ | ◐ | ◐ | ✓ | ✗ | ✓ | ✓ |
| Watchlists + alerts on themes/events | 4 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Team workspaces / shared notebooks / pinned answers | 4 | ✓ | ✓ | ✓ | ✓✓ | ◐ | ✓ | ✓ |
| Permissioned roles / SSO / audit log | 4 | ◐ | ✓ | ✓ | ✓ | ◐ | ✓ | ✓ |
| "No training on user data" + AES-256 + TLS posture | 5 | ◐ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mobile companion app | 2 | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| Self-serve trial / pricing transparency | 3 | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Where Finsyt wins today

- **Connector Hub + MCP** — nobody else markets a generalised "any API / MCP"
  connector surface. Real moat over BlueFlame's closed Blueprints and Rogo's
  locked roadmap.
- **Provider waterfall + price transparency** — 18+ providers with documented
  fallback ordering is rare; competitors hide this.
- **Football Field + DCF sensitivity** as a first-class shipped surface.
- **Excel add-in with `=FINSYT.*` custom functions** — on par with FactSet's
  strongest stickiness lever and ahead of Rogo / BlueFlame.
- **Self-serve pricing tiers** — every competitor in this set is request-access
  only.

### Where Finsyt loses today (highest-leverage gaps)

1. **No multi-doc / multi-prompt analysis grid.** Hebbia's Matrix is the new
   bar. Finsyt has the agent, the connectors, and the citations — it just
   needs the grid surface.
2. **No reusable workflow Blueprints library.** Every winning competitor lets
   users save and re-run a multi-step workflow against new inputs.
3. **No live audio / live transcript** during earnings, CMDs, or investor
   conferences. Quartr owns this.
4. **No Outlook / email-draft assistant.** BlueFlame's #1 customer-quoted use
   case.
5. **No premium data integration** with FactSet / CapIQ / Bloomberg /
   PitchBook. The whole AI-finance category has standardised on this.
6. **Generalised PPTX generation** — in flight, not yet a shared service.
7. **Provable compliance posture.** Trust Center, SOC 2 download under NDA,
   "no training on user data" statement, branded auth emails — competitors
   lead with these on every page.
8. **International + private company coverage is thin.** EU + JP earnings,
   real transaction comps, private company search.

### Kano

- **Basics (must have to be considered):** cited NL chat, watchlists,
  transcript search, executive memo, peer comps, SOC 2 + SSO, citations on
  every output.
- **Performance (more is better):** number of data sources, public companies
  covered live, saved playbooks per firm, audio-aligned transcripts, agent
  tool count.
- **Delighters (becoming tomorrow's basics):** Hebbia-style Matrix grids,
  multi-step Blueprints with conditional branching, deck-per-row, Excel-
  add-in agent that explains formula choices, "always-on" workflows that
  re-run when new filings drop, cross-company theme tracking with QoQ deltas,
  voice / audio of live calls inside the product.

## 4 · Trap-setting battlecard (sales)

- *"How many of your saved workflows actually re-run automatically when new
  data lands — vs. just storing a prompt for you to click again?"* (kills
  BlueFlame Blueprints and Rogo saved chats)
- *"Can your platform answer the same 12 questions across 40 different
  companies in one view?"* (kills everyone except Hebbia — and Finsyt with
  the Matrix work below)
- *"Does your AI tell you which providers it pulled from and what it would
  have done if the primary failed?"* (kills Rogo, Hebbia, Quartr; Finsyt's
  waterfall + tool timeline wins this)
- *"Can I bring my own MCP server or REST API into the platform without your
  team's help?"* (kills everyone — Connector Hub wins)
- *"Show me the audit log for every prompt, tool call, and citation my
  analyst made last week."* (kills Quartr, Rogo; Finsyt's admin audit wins
  this once the in-flight enterprise tasks land)

## 5 · Done looks like

- Finsyt has matched or exceeded every competitor on the table-stakes feature
  row of the matrix (citations, transcript intel, IC memo, peer / comps,
  SSO + audit posture, deck generation, Excel add-in).
- Finsyt has shipped the two leapfrog bets — the **Workflow Matrix** and the
  **Banker / PE Playbook Library** — that turn the connector hub + provider
  waterfall + agent into a defensible category position.
- A salesperson can run the trap-setting battlecard above and Finsyt wins on
  every question.
- The visible information architecture is unchanged. Every new feature lives
  inside the existing AlphaSense-inspired shell.

## 6 · Out of scope

- Visual redesign or restructure of the existing AlphaSense-inspired layout,
  navigation, or page hierarchy.
- Building a mobile companion app.
- Native client for Windows / Mac terminal-style desktop app.
- Self-serve credit-card billing flow changes.
- Replacing the agent runtime architecture.
- Buying or licensing FactSet / Bloomberg / CapIQ data directly. This roadmap
  scopes the *integration surface* and partnership-ready connector, not the
  contract.

---

## 7 · Themes (prioritised)

Themes are ordered by competitive lift × feasibility. Inside each theme,
items are listed in the order they should be tackled. **A and B are the
must-ship leapfrog bets. C / D / E are the gap-closing parity push.
F / G run in parallel as the enterprise-credibility and conversion polish.**
Existing in-flight platform tasks are referenced so they fold into the right
theme rather than being duplicated.

### Theme A — Workflow Matrix (Hebbia-class leapfrog)

Build the multi-doc / multi-entity / multi-prompt grid that runs the existing
Finsyt agent across rows × columns and renders cited results in cells, with
the same citation drawer used in Research today.

- Add a "Matrix" surface inside the existing Workspaces module.
- Rows = entities (companies from a watchlist / screener result / uploaded
  list / connector query). Columns = prompts (free text or Blueprint steps).
  Cells = streamed agent answers with citations + an "expand" view that
  opens the existing citation drawer.
- Each cell run uses the current `/api/agent/ask` pipeline so tool timeline,
  provider waterfall, and citations behave identically.
- Support row-level and column-level reruns, freeze a snapshot per run, and
  export the matrix as CSV and as a PowerPoint deck (one slide per row,
  reusing the deck generator from Theme D).
- Add a **"rerun on new filing"** toggle per matrix that re-executes
  affected rows when SEC / EODHD report new documents — the always-on
  differentiator vs. Hebbia.

### Theme B — Blueprint / Playbook Library (BlueFlame + Rogo parity, then leapfrog)

Promote multi-step agent recipes to first-class objects.

- Define a Blueprint schema (steps, parameters, expected outputs, required
  tools / connectors).
- Ship a starter library covering the workflows competitors brag about:
  - IC memo from a target name
  - Expert-call transcript daily summary
  - Quarterly peer-cycle compilation
  - Sector landscape map
  - M&A target shortlist
  - Bulk outreach personalisation
- Each Blueprint runs against either a single entity or a Matrix.
- Tiers: firm-level (org-private), team-shared, "Finsyt-published".
- Surface Blueprint runs in the existing Workspaces / notebook timeline so
  audit + pinning work uniformly.

### Theme C — Live event coverage (Quartr Pro parity)

Close the single biggest qualitative gap.

- Live earnings + CMD + investor-conference event surface inside the
  existing Calendar / Alerts module.
- Stream live audio + live transcript while a call is in progress, then swap
  to the aligned transcript when the alignment job completes (reuses
  `SyncedTranscript` and the existing alignment cache job).
- Cover EU + JP names; tag CMDs and investor conferences explicitly.
- On every live event, run a default Blueprint ("Live highlights") that pins
  management commentary, KPI changes, and Q&A standout moments to the user's
  notebook in real time.
- Provide an iCal feed so users see Finsyt events in Outlook / Google Cal.

Folds in the in-flight enterprise tasks for the iCal feed + reminders,
EU + JP earnings coverage, persisted alignment caches, and pre-aligned
transcript jobs.

### Theme D — IB / PE workflow vertical (BlueFlame + Rogo Felix territory)

Turn Finsyt into the obvious choice for banker and PE workflows.

- Generalise the investment-memo PPTX work into a shared deck-generation
  service used by Matrix exports, Blueprints, and the Company page.
- Outlook / email-draft assistant that takes a target list (matrix or
  watchlist) and produces personalised outreach drafts citing public
  information — mirrors BlueFlame's most-quoted use case.
- CIM / data-room ingestion flow into Workspaces so PE diligence Blueprints
  can run over private docs alongside public filings (reuses the existing
  workspace ingest pipeline).
- "Deal team workspace" template: shared notebook, peer set, valuation,
  memo, deck — all wired together for a single target.
- Wire Football Field + Peers + Transaction Comps into the deck generator so
  a banker's pitch is one click from the Matrix.

### Theme E — Premium data partnerships + private + international (FactSet ecosystem play)

Match the data breadth competitors talk about.

- First-class Connector Hub entries for FactSet, S&P CapIQ, Refinitiv / LSEG,
  Bloomberg Data License, and PitchBook — with credential prompts, quota
  display, and sample queries — so a customer who already licenses these can
  plug them in without custom work.
- Apply to the FactSet AI Partner Program so Finsyt appears alongside
  Capsa / Finster / Model ML / Unique.
- Make Coresignal + the in-flight Private Companies redesign the default
  private-company surface, with explicit coverage labels.
- Land EU + JP earnings as part of live event coverage and as historical
  transcript breadth.
- Surface a "data sources used" footer on every agent answer (Finsyt's
  transparency moat over Rogo / Hebbia / Quartr).

### Theme F — Trust, security, compliance posture (table stakes that close enterprise deals)

Ship and *prove* what competitors lead with on every page.

Folds in the in-flight enterprise tasks:

- Always-current Security page status
- Trust Center (marketing) with downloadable SOC 2 under NDA
- Real sign-in before opening the audit log to customers
- Tenant-isolation safety tests run automatically on every change
- Non-superuser database connection in production
- Nightly retention & deletion job running automatically
- End-to-end test for audit, export, delete flows
- Branded auth emails sending from `finsyt.com` after DNS goes live
- Branded welcome and security-alert emails outside the auth flow
- Workspace teammate invites + role assignment (expand to SAML SSO + SCIM)
- Per-prompt audit log export (CSV + JSON) accessible from Admin → Audit,
  documented in the Connector Hub as part of firm-level data governance
- Trust Center to mirror BlueFlame and Hebbia footers ("no training on user
  data", AES-256 at rest, TLS 1.2+, sub-processor list, pen-test summary)

### Theme G — Cross-cutting agent and UX upgrades (delighters that become basics)

Small surface-area changes inside the existing IA that compound. Folds in
the in-flight transcript / research / agent tasks:

- Cross-company / cross-quarter theme tracker — same UI as Research but with
  a "compare across" axis that opens a mini-Matrix.
- Cluster cache that survives server restarts (analyst question clusters).
- Show how each company's executives answered the clustered questions.
- Track which themes analysts ask about most across quarters.
- Speaker / executive name chips on every transcript sentence.
- Persisted alignment caches so aligned transcripts survive a restart.
- Pre-align transcripts in the background instead of on first view.
- Per-company "Notebook" tab that aggregates pinned agent answers, citation
  snippets, and Matrix cells for that name — pin AI agent answers from the
  research notebook to the company page.
- Real source-page previews + highlights in the citation drawer.
- Excel add-in: extend `=FINSYT.*` with `=FINSYT.AGENT(prompt, ...refs)` so
  a banker can drop a cited agent answer into a model — uniquely possible
  because the add-in token + agent runtime are both Finsyt-owned.
- Pricing & marketing page updates: lead with **Matrix + Blueprints +
  Connector Hub + transparency** as the four headline differentiators.

## 8 · Sequencing

| Quarter | Must-ship | Parallel |
|---|---|---|
| Q1 (now) | Theme A (Matrix MVP), Theme F (security baseline), Theme G in-flight transcript / citation polish | Theme D PPTX generalisation; pricing-page copy refresh |
| Q2 | Theme B (Blueprint library v1, starter Blueprints, Matrix integration) | Theme C live audio + EU/JP coverage; Theme E PitchBook + Coresignal labelling |
| Q3 | Theme C ("Live highlights" Blueprint pinning to notebook); Theme D (Outlook draft, deal-team workspace, deck wiring) | Theme E (FactSet / CapIQ / Bloomberg connector entries + AI Partner Program application); Theme G Excel `=FINSYT.AGENT()` |
| Q4 | Theme E full ecosystem play (premium data + Trust Center external relaunch) | Theme G QoQ theme tracker; Matrix → deck templates |

This sequencing keeps the IA stable, ships the leapfrog bets first, and lets
the parity push and the compliance push land in parallel without colliding
on the same code surfaces.

## 9 · Cross-references

This roadmap intentionally folds in (does not duplicate) the following
in-flight project tasks. They should be sequenced under the theme they
belong to rather than treated as independent priorities:

- Theme C: iCal feed + email reminders for upcoming earnings; EU + JP
  coverage in the calendar; pre-align transcripts in the background; keep
  aligned transcripts after a server restart.
- Theme F: Security page always-current status; Trust Center with downloadable
  SOC 2 under NDA; sign in users for real before opening audit log; tenant
  isolation safety tests on every change; non-superuser DB in production;
  nightly retention & deletion job; e2e tests for audit / export / delete;
  branded auth emails after DNS; branded welcome + security-alert emails;
  workspace invites + roles; confirm branded emails send from finsyt.com.
- Theme G: Cache analyst question clusters across server restarts; show how
  executives answered clustered questions; track themes QoQ; speaker /
  executive name chips on transcript sentences; pin AI agent answers to
  research notebook on company page; real source pages + highlights in the
  citation drawer.

## 10 · Relevant code paths

For implementers picking up theme work:

- Agent + tool timeline: `app/api/agent/ask/route.ts`,
  `app/api/finsyt-agent/ask/route.ts`
- Research surface: `app/app/research/page.tsx`
- Company workspace tabs: `components/company/AIAnalysisTab.tsx`
- Transcript player + alignment: `components/SyncedTranscript.tsx`,
  `app/api/transcripts/route.ts`, `lib/transcript-alignment.ts`
- Valuations + Football Field: `app/app/valuations/[symbol]/page.tsx`,
  `components/valuations/ValuationsView.tsx`
- Watchlist + Calendar entry points: `app/app/watchlist/page.tsx`,
  `app/app/calendar/`
- Connector Hub: `app/app/connectors/page.tsx`, `lib/connectors/*`
- Workspaces (Matrix host): `app/app/workspaces/`, `app/api/workspaces/`
- Admin audit + provider health: `app/api/admin/audit/route.ts`,
  `app/api/admin/providers/health/route.ts`
- Data waterfall: `lib/data-providers.ts`
- Excel add-in: `public/excel-addin/manifest.xml`,
  `public/excel-addin/taskpane.html`, `public/excel-addin/functions.js`
- Marketing surfaces (positioning copy): `artifacts/marketing/src/pages/`
