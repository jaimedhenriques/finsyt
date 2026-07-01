# Finsyt — Competitive Gap Analysis & Platform Strategy
## Building the best-in-class integrated agentic AI financial intelligence platform

**Prepared:** June 2026
**Scope:** Full audit of the Finsyt platform and marketing site, deep competitive research across 8 named competitors (Rogo/Felix, Hebbia, Model ML, Quartr Pro, Crunched, Fiscal.ai, Daloopa) plus incumbents, and a prioritized development roadmap to make Finsyt superior to each competitor individually and the best integrated solution across all of them.

---

## 1. Executive summary

Finsyt is, on paper, the **most architecturally complete platform in the entire competitive set**. No single competitor spans research copilot + scheduled agents + blueprints + screener + filings + Excel add-in + REST API + a live MCP server + bring-your-own-license federation over FactSet/Bloomberg/CapIQ/Refinitiv/PitchBook. Rogo, Hebbia, and Model ML each own one or two of these layers brilliantly; Finsyt has sketched all of them.

That breadth is also Finsyt's central problem. The audit reveals a platform where **ambition has outrun execution**: roughly a third of the navigation carries "NEW," "PRO," or "ROADMAP" labels, the flagship Model Builder (DCF/LBO/comps) is not live, the Agent Library throws a JSON error, market and movers feeds are unwired, and the entire app runs in a "demo mode — do not use with real data" state. Meanwhile competitors have shipped: Daloopa is inside Microsoft Copilot for Excel as of June 25, 2026; Rogo has a native Excel sidebar agent (Felix) and $300M+ in funding; Model ML raised one of the largest fintech Series A rounds ever ($75M) selling autonomous Office-native workflows; Fiscal.ai owns proprietary KPI/segment data for 2,500+ companies that nobody else has.

**The strategic verdict:** Finsyt should not try to out-feature everyone at once. It should pick the one defensible wedge where it is already differentiated — **the unified agentic control plane (Agents + Blueprints + MCP + Connector Hub + BYO-license federation)** — make that layer genuinely production-grade, and ruthlessly prioritize the 6–8 capabilities that turn the current "broad but hollow" demo into a credible institutional product. Everything else (depth of data, transcripts, modeling) can be acquired by federating over licenses Finsyt already routes, rather than rebuilt from scratch.

**The three things that matter most, in order:**
1. **Make it real.** Move from demo mode to a trustworthy, data-wired, production app with verifiable citations. Nothing else matters until this is done.
2. **Win the agentic + integration layer.** This is the only place Finsyt is structurally ahead. Double down: production-grade multi-agent orchestration, a real Excel add-in (not a pricing-page bullet), and the broadest MCP/connector ecosystem in the category.
3. **Fix the data-depth gap by federation, not rebuild.** Finsyt's BYO-license model is a genuine wedge — but it must work flawlessly and be provable, because today it is described, not demonstrated.

---

## 2. The competitive landscape at a glance

The market has fractured into five functional layers. No incumbent or startup owns all five — which is precisely the gap Finsyt is aiming at.

| Layer | What it does | Category leaders today |
|---|---|---|
| **Structured fundamental data** | AI-extracted, source-linked financials into models | **Daloopa** (acknowledged leader), Fiscal.ai (KPI/segments) |
| **Document intelligence / Q&A** | Interrogate massive unstructured doc sets (VDRs, contracts) | **Hebbia** (Matrix, ISD infinite context) |
| **Sell-side workflow / deliverables** | CIMs, pitchbooks, comps, IB-format outputs | **Rogo** (Felix) |
| **Agentic workflow automation** | Autonomous, triggered, Office-native multi-step work | **Model ML** (Signals, Grid, Office add-ins) |
| **Qualitative research / transcripts** | Earnings calls, IR docs, slides, sentiment | **Quartr Pro**, AlphaSense, Fiscal.ai |
| **In-Excel modeling agent** | Build/debug models inside Excel | **Crunched**, Daloopa Scout, Rogo Excel plug-in |

Three structural truths the research surfaced that should shape Finsyt's strategy:

- **MCP is becoming the "USB-C of AI finance."** The standard through which every agent accesses financial data. Daloopa moved first and broadest (Claude, ChatGPT, Perplexity, Rogo, and now Microsoft Copilot in Excel). Rogo shipped Custom MCP in May 2026. **Finsyt already has a live 12-tool MCP server** — this is a genuine, underexploited asset.
- **Data is the moat, not the model.** Daloopa's FinRetrieval benchmark showed the *same* Claude model scoring 91% with Daloopa's structured data vs. 20% on the open web. As frontier models commoditize, whoever supplies clean, auditable, source-linked data wins. Finsyt does not own data — it federates — which is viable *only if the federation is flawless and the citations are real*.
- **The Excel battleground is now decisive.** Rogo (native sidebar), Daloopa (Copilot connector + Scout agent), Model ML (full Office add-ins), Crunched (Excel-native), Fiscal.ai (in development). Finsyt lists an "Excel add-in" as a Team-tier bullet with **no product behind it**. This is the single most exposed gap.

---

## 3. Competitor-by-competitor deep dive

### 3.1 Rogo (+ Felix) — the sell-side workflow engine
- **What they are:** Purpose-built for investment banking deal teams — CIM generation, pitchbooks, comps, Excel modeling. Felix (flagship agent) works like a junior banker you delegate to by email. ([Rogo](https://rogo.ai/), [Felix](https://rogo.ai/felix))
- **Funding & momentum:** $300M+ raised across five rounds in ~2.5 years; $160M Series D led by Kleiner Perkins (April 2026); ~$750M+ implied valuation. Best-capitalized in the category.
- **Data:** Broadest native partnership network — LSEG, FactSet, S&P Capital IQ, PitchBook, Preqin, Third Bridge, Moody's. Real-time integrations, not BYO-upload.
- **Excel:** Acquired Subset (Sept 2025) for modeling depth; shipped a **native Excel plug-in (May 2026)** embedding Felix as a sidebar inside Excel. Launched Custom MCP (May 2026).
- **Strength:** Standardized IB deliverables at speed; data-rich workflows.
- **Weakness:** Context-window-bound — cannot reliably analyze full VDRs (thousands of unstructured docs) simultaneously. Optimized for individual banker productivity, weaker on multi-team collaboration.

### 3.2 Hebbia — the buy-side document intelligence platform
- **What they are:** Built to interrogate massive unstructured document sets (VDRs, legal agreements, transcripts) via proprietary ISD ("infinite effective context window"). Matrix grid links every cell to source at the sentence level. ([Hebbia](https://www.hebbia.com/))
- **Funding:** ~$161M across three rounds; was profitable at $13M ARR at Series B — capital discipline, not weakness.
- **Penetration:** 40% of the largest asset managers by AUM — BlackRock, KKR, Carlyle.
- **Collaboration edge:** "Projects" — shared deal-team workspaces (MDs, analysts, compliance, legal share Matrices/agents/context). No Rogo equivalent.
- **Strength:** Deepest document intelligence tech; sentence-level citation; large-doc-set synthesis.
- **Weakness:** Owns no data — all third-party data requires user license + upload. No MCP announced as of June 2026. No in-Excel agent (export only).

### 3.3 Model ML — the agentic workflow automation platform
- **What they are:** Fully autonomous, event/schedule-triggered workflow modules ("Signals") that monitor thousands of companies and auto-generate pitch decks; the "Grid" (AI-native spreadsheet); native Excel/PowerPoint/Word/Outlook add-ins (live June 2026 via [Microsoft Marketplace](https://marketplace.microsoft.com/en-us/product/saas/wa200010913)).
- **Funding:** $87.5M total — $75M Series A (Nov 2025, led by FT Partners + YC + QED), one of the largest fintech Series A rounds in history per [Bloomberg](https://www.bloomberg.com/news/articles/2025-11-24/ai-startup-raises-75-million-to-take-junior-bankers-grunt-work).
- **ICP:** Enterprise-only — IB, PE, hedge funds, Big Four, consultancies. ~10% of the world's top IB/PE firms.
- **Strength:** Autonomous triggered workflows + Office-native execution. This is the closest competitor to Finsyt's *agentic* ambition.
- **Weakness:** Owns no data (depends on CapIQ/FactSet/PitchBook); fully opaque pricing; no public self-serve; no external MCP server documented.

### 3.4 Daloopa — the data infrastructure layer
- **What they are:** AI-extracted, source-linked fundamental data; reframed as "the data infrastructure layer for AI in finance." ([Daloopa](https://daloopa.com/))
- **Funding:** $47M Series C (May 2026, Brighton Park Capital); **Phil Hadley (former FactSet CEO)** as advisor; Squarepoint Capital (customer-as-investor). Revenue doubled YoY. 160+ institutions incl. Anthropic, OpenAI, Perplexity, Microsoft.
- **Product stack:** Data Sheets, Excel Add-In (Retrofit + Update, every datapoint source-hyperlinked), **Scout** (native in-Excel AI agent, beta), API (1,300+ metrics), and the broadest MCP server in the category.
- **The Microsoft moment:** As of **June 25, 2026**, an official financial-data connector in Copilot for Excel — alongside FactSet, Morningstar, PitchBook, S&P/Kensho.
- **Strength:** Acknowledged leader in fundamental-data depth + audit trail + MCP ecosystem breadth.
- **Weakness:** Non-US fiscal-calendar accuracy drops to 65–79%; Scout still beta; institutional pricing only; ~5,500 ticker coverage.

### 3.5 Fiscal.ai (formerly FinChat) — the data terminal + research copilot
- **What they are:** Financial data terminal + AI research assistant. Proprietary **Segments & KPI data for 2,500+ companies** (normally Bloomberg/CapIQ-only territory). ([Fiscal.ai](https://fiscal.ai/))
- **Funding:** ~$13.75M ($10M Series A, June 2025, Portage Ventures + Social Leverage + VanEck).
- **Reach:** 350,000+ registered users; API powers 70+ platforms; clients incl. Morgan Stanley, Raymond James, Franklin Templeton, Allianz, EY, PwC.
- **Pricing:** Fully transparent — Free / Pro ($39/mo) / Max ($79/mo); ~30x cheaper than Bloomberg. Best-in-class MCP server. Launched as official ChatGPT/Codex app (June 2026).
- **Strength:** Proprietary KPI/segment data; transparent low pricing; broad reach; strong MCP.
- **Weakness:** No private-company data; no document upload/analysis; no workflow automation.

### 3.6 Quartr Pro — the qualitative research infrastructure
- **What they are:** 50M+ first-party IR documents (transcripts, filings, slides) from 15,000+ companies across 65 markets, AI-queryable. The only major platform built **exclusively on first-party IR data**. ([Quartr Pro](https://quartr.com/products/quartr-pro))
- **Differentiators:** MCP server (one-click), Snowflake delivery (no rate limits), unique Slide History Comparison, >97% of global earnings live.
- **Reach:** 700+ institutions incl. 3 of the 5 largest hedge funds, Perplexity, TradingView as API clients. ~$23–27M raised; 3x ARR growth.
- **Weakness:** No quantitative data, no Excel modeling, no broker research, no internal-doc analysis.

### 3.7 Crunched — the Excel-native modeling agent
- **What they are:** Native Excel/PowerPoint add-in AI agent — builds models, debugs formulas, extracts data from PDFs (CIMs, IMs, rent rolls) in plain English, inside Excel. Full audit trail. ([Crunched](https://www.usecrunched.com/))
- **Backing:** First Round Capital, YC F25, 20VC, Paul Graham angel. $7M raised. Founded 2025, ~5 employees, early stage.
- **Strength:** Excel-native, no workflow change; PDF extraction into models; ISO 27001 + SOC 2 from day one.
- **Weakness:** No public-market data, no web app, no API, no MCP. Very early.

---

## 4. Capability matrix — Finsyt vs. the field

Legend: ●  strong / shipped · ◐ partial / claimed but unproven · ○ absent · — not applicable to their model

| Capability | **Finsyt** | Rogo | Hebbia | Model ML | Daloopa | Fiscal.ai | Quartr | Crunched |
|---|---|---|---|---|---|---|---|---|
| Research copilot (cited chat) | ◐ claimed | ● | ● | ● | ◐ | ● | ● | ○ |
| Sentence-level citations | ◐ claimed | ● | ● | ◐ | ● | ● | ● | — |
| Massive doc-set synthesis (VDR) | ○ | ◐ | ● | ◐ | ○ | ○ | ○ | ◐ |
| Scheduled / autonomous agents | ◐ built, beta | ● (Felix) | ● (Intern) | ● (Signals) | ○ | ○ | ○ | ○ |
| Multi-step blueprints/playbooks | ◐ errors | ◐ | ● | ● | ○ | ○ | ○ | ○ |
| Native Excel add-in (in-app agent) | ○ bullet only | ● | ○ export | ● | ● | ◐ dev | — | ● |
| Excel data extraction → model | ◐ claimed | ● | ◐ | ● | ● | ◐ | ○ | ● |
| DCF / LBO / comps modeling | ○ roadmap | ● | ◐ | ● | ◐ | ○ | ○ | ● |
| Proprietary structured data | ○ federates | ◐ | ○ | ○ | ● | ● | ● | ○ |
| Earnings transcripts depth | ◐ federated | ● | ◐ | ◐ | ○ | ● | ● | ○ |
| Live MCP server | ● 12 tools | ● custom | ○ | ◐ internal | ● broadest | ● | ● | ○ |
| Public REST API | ● | ◐ | ◐ | ○ | ● | ● | ● | ○ |
| BYO-license federation | ● unique | ● native | ◐ | ◐ | ○ | ○ | ○ | ○ |
| Connector Hub (any REST/MCP) | ● unique | ◐ | ◐ | ◐ | ◐ | ○ | ◐ | ○ |
| Team/collaboration workspaces | ◐ | ○ | ● Projects | ◐ | ○ | ○ | ◐ | ○ |
| Office-native (PPT/Word/Outlook) | ○ | ◐ | ◐ slides | ● full | ○ | ○ | ◐ PPT | ◐ PPT |
| Screener / markets / macro data | ● | ◐ | ○ | ○ | ○ | ● | ◐ | ○ |
| Transparent public pricing | ● | ○ | ○ | ○ | ○ | ● | ○ | ◐ |
| SOC 2 / ISO 27001 (achieved) | ○ in progress | ◐ | ● | ◐ | ● | ● | ◐ | ● |

**What the matrix shows:**
- **Finsyt's genuine edges (where it leads or ties the best):** BYO-license federation, the Connector Hub, a live multi-tool MCP server, and the *breadth* of the agentic surface (Agents + Blueprints + screener + markets + macro). No competitor combines all of these.
- **Finsyt's "claimed but unproven" column is dangerously long.** Citations, the research copilot, Excel extraction, blueprints — all are described in marketing but appear hollow or broken in the audited app. Competitors have shipped equivalents.
- **Finsyt's hard absences:** native Excel add-in, modeling engine (DCF/LBO/comps), proprietary data, Office-native generation, achieved security certifications, and large-doc-set synthesis.

---

## 5. Gap analysis — the platform

### Tier 1 — Existential (fix before anything else)
1. **Demo mode / unwired data.** The app self-labels "do not use with real data," indices show 0.00, movers/headlines/earnings feeds are unwired, and the Agent Library throws a JSON parse error. **Nothing in this report matters until the app is a trustworthy, data-live product.** Every competitor passed this bar long ago.
2. **Citations are the product — and they are unproven.** Finsyt's entire positioning is "AI insights you can trust" with "sentence-level citations." Hebbia, Daloopa, Fiscal.ai, and Quartr *demonstrate* this with verifiable source links. Finsyt must make every answer's citation clickable, accurate, and provably grounded — or the core promise collapses.
3. **Security certifications are aspirational.** SOC 2 Type 2 and ISO 27001 are "in progress / roadmap." Hebbia, Daloopa, Fiscal.ai, and Crunched have them *achieved*. Institutional buyers gate procurement on these. SSO/SAML/SCIM is also only "roadmap" — a hard blocker for enterprise.

### Tier 2 — Competitive parity (close the obvious gaps)
4. **No real Excel add-in.** Listed as a Team-tier bullet with no product behind it, while Rogo, Daloopa, Model ML, and Crunched have shipped in-Excel agents. This is the most exposed single gap. (Roadmap below.)
5. **Modeling engine (Model Builder) is roadmap, not live.** DCF/LBO/comps from natural language is table-stakes for the IB/PE ICP Finsyt targets. Rogo, Model ML, and Crunched ship it.
6. **Blueprints / agent library broken.** The multi-step playbook layer — one of Finsyt's differentiators — errors on load. Model ML's autonomous Signals are the benchmark to beat.
7. **No large-document-set synthesis.** The PE/diligence ICP ("ingest massive VDR data rooms in hours") needs Hebbia-class capability. Today there's a 25MB single-file upload only.
8. **Office-native generation absent.** No PowerPoint/Word/Outlook output. Model ML and Rogo generate formatted pitchbooks and memos; Finsyt's "deck appendix" language implies it but no engine is visible.

### Tier 3 — Differentiation (where Finsyt can pull ahead)
9. **The agentic control plane is under-built relative to the vision.** Agents are 3 fields (title/schedule/instructions) emailing briefs. Model ML's Signals are event-triggered, monitor thousands of names, and produce deliverables. Finsyt should make its orchestration layer the best in the category — multi-agent, event- and schedule-triggered, with human-in-the-loop checkpoints.
10. **MCP server is a sleeping asset.** 12 tools live, but 4 of them are U.S. Census (a curious priority for an institutional finance tool). Daloopa and Fiscal.ai have made MCP a distribution strategy. Finsyt should expand finance-relevant MCP tools, pursue the Microsoft Copilot-for-Excel connector slot, and market MCP as a first-class channel.
11. **BYO-license federation is unique but unproven.** "Plug your FactSet/Bloomberg/CapIQ/Refinitiv/PitchBook keys; we route, cache, cite" is a genuinely differentiated wedge no competitor offers cleanly. But it is described, not demonstrated. Make it work flawlessly and it becomes the headline.
12. **Collaboration / Projects.** Hebbia's shared deal-team workspaces are a real edge as AI moves from personal tool to institutional OS. Finsyt has workspaces but no evidence of Hebbia-class shared context.

---

## 6. Gap analysis — the marketing website

The marketing site is the *strongest* part of Finsyt today — clean, well-positioned, professional. But it over-promises relative to the app, and it under-sells the things that are actually differentiated.

**What's working:** Sharp value proposition ("AI insights you can trust"), clear ICP segmentation (8 verticals), transparent pricing (a real advantage vs. Rogo/Hebbia/Model ML/Daloopa, who hide it), strong security narrative, the BYO-license federation story.

**Gaps and fixes:**
- **No social proof.** Zero logos, testimonials, or named customers. Every serious competitor leads with them (Hebbia → BlackRock/KKR; Daloopa → Anthropic/OpenAI; Fiscal.ai → Morgan Stanley). Even 2–3 design-partner logos or a metric ("X firms in beta") would help. **Highest-ROI marketing fix.**
- **Claims outrun the product.** The site markets Excel extraction, modeling, and citations that the app doesn't yet deliver. This is a credibility risk in a buyer base that will trial before buying. Align claims to shipped reality, or gate aspirational features behind an honest "coming Q_" label.
- **The MCP / agentic / federation story is buried.** Finsyt's three genuine differentiators barely appear on the marketing site. The homepage leads with generic "query filings and transcripts" — which Fiscal.ai and Quartr do better and cheaper. Lead instead with **"the integrated agentic control plane that federates over your existing data licenses"** — a position no competitor can claim.
- **Pricing may be mispositioned.** $1,200–$2,500/user/mo positions Finsyt above Fiscal.ai (~$79/mo) and likely Quartr, and into Bloomberg/AlphaSense territory — without yet having the data depth or proven product to justify it. Either substantiate the premium (proven federation + agents + modeling) or introduce a lower entry tier to build bottom-up adoption (Fiscal.ai's playbook).
- **No interactive demo / sandbox.** "Take the Tour" exists, but competitors offer live product tours and self-serve trials. A polished, real (non-demo-mode) interactive demo would convert.
- **Security page honesty is good but exposes the gap.** The candid "in progress / roadmap" labels are trustworthy but signal immaturity to procurement. Prioritize achieving SOC 2 so this becomes a strength.

---

## 7. Strategic recommendation — the wedge

Finsyt cannot beat Daloopa on data, Hebbia on document intelligence, or Rogo on IB deliverables by copying them — they are better funded and further ahead in their lanes. But **no one owns the integration + agentic control layer that sits on top of all of them.** That is Finsyt's defensible position:

> **"Finsyt is the agentic control plane for institutional research — the one place where your existing data licenses (FactSet, Bloomberg, CapIQ, Refinitiv, PitchBook), your internal documents, and autonomous AI agents come together, with audit-ready citations and an MCP server that plugs into every AI tool your firm already uses."**

This wins because:
- It turns Finsyt's biggest liability (no proprietary data) into a feature (vendor-neutral federation).
- It builds on the two things Finsyt uniquely already has (Connector Hub + live MCP server).
- It is the layer incumbents (Bloomberg, FactSet) are structurally least able to build — they sell the data Finsyt federates.
- It reframes competitors as *components* Finsyt orchestrates, not rivals it must out-build.

---

## 8. Prioritized development roadmap

### Phase 0 — "Make it real" (0–3 months) — non-negotiable
| # | Initiative | Why | Benchmark to beat |
|---|---|---|---|
| 0.1 | Exit demo mode; wire all live feeds (prices, movers, news, earnings calendar) | Core credibility | All competitors |
| 0.2 | Make citations clickable, accurate, source-linked end to end | The entire value prop | Hebbia, Daloopa, Quartr |
| 0.3 | Fix Blueprint/Agent Library load errors; ship 8–10 working blueprints | Differentiator is broken | Model ML Signals |
| 0.4 | Achieve SOC 2 Type 2; ship SSO/SAML/SCIM | Enterprise procurement gate | Hebbia, Daloopa, Fiscal.ai |
| 0.5 | Prove BYO-license federation with 1–2 live integrations (e.g. FactSet, CapIQ) | Turns the unique claim real | (no competitor) |

### Phase 1 — "Close parity gaps" (3–6 months)
| # | Initiative | Why | Benchmark |
|---|---|---|---|
| 1.1 | Ship a real native Excel add-in with in-cell agent + source-linked data | Most exposed gap | Rogo, Daloopa Scout, Crunched |
| 1.2 | Launch Model Builder v1 (comps + DCF from natural language) | Table-stakes for IB/PE ICP | Rogo, Model ML, Crunched |
| 1.3 | Large-document-set synthesis (VDR ingestion, multi-doc Q&A) | PE/diligence ICP need | Hebbia |
| 1.4 | Production multi-agent orchestration (event + schedule triggers, HITL) | Upgrade the control plane | Model ML |
| 1.5 | Expand MCP to finance-first tools; pursue Copilot-for-Excel connector slot | Distribution via MCP standard | Daloopa, Fiscal.ai |

### Phase 2 — "Pull ahead" (6–12 months)
| # | Initiative | Why | Benchmark |
|---|---|---|---|
| 2.1 | Office-native generation (pitchbooks/memos in PPT/Word/Outlook) | Deliverable layer | Model ML, Rogo |
| 2.2 | Shared deal-team Projects (Hebbia-class collaboration) | Institutional OS positioning | Hebbia Projects |
| 2.3 | LBO + full comps + model audit/mistake-detection | Complete the modeling suite | Model ML, Daloopa |
| 2.4 | Vendor-neutral "best-source routing" across federated licenses | Make federation the headline moat | (no competitor) |
| 2.5 | International filing/fiscal-calendar accuracy (exploit Daloopa's weakness) | Differentiate on global coverage | Daloopa's known gap |

### Marketing / GTM track (parallel, ongoing)
| # | Initiative | Why |
|---|---|---|
| M.1 | Secure and publish 3–5 design-partner logos / testimonials | Highest-ROI credibility fix |
| M.2 | Re-anchor homepage on the agentic-control-plane + federation story | Differentiated positioning |
| M.3 | Align marketing claims to shipped product (or honest "coming" labels) | Trial-driven buyers will catch gaps |
| M.4 | Add a real interactive demo / self-serve trial | Conversion |
| M.5 | Re-evaluate pricing: substantiate premium or add a lower entry tier | Bottom-up adoption (Fiscal.ai playbook) |
| M.6 | Publish an MCP-first developer/AI-tool integration story | Capture the "USB-C of AI finance" trend |

---

## 9. Bottom line

Finsyt has built the **widest** platform in the category and the **shallowest** execution. The competitors prove that depth beats breadth in the short run — but also that no one has yet assembled the integrated, vendor-neutral, agentic control plane that Finsyt has *sketched*. The winning move is not to add more surface area; it is to make the existing surface real, then drive hard on the three things Finsyt uniquely owns: **federation over existing licenses, the Connector Hub, and a finance-first MCP ecosystem** — wrapped in production-grade agents and a real Excel presence.

Execute Phase 0 and the platform becomes trustworthy. Execute Phase 1 and it reaches parity. Execute Phase 2 and the federation-plus-orchestration thesis becomes a position no single competitor — and not even the incumbents — can copy.

---

*Sources: primary audit of finsyt.replit.app and /platform (June 2026); competitor research across Rogo, Hebbia, Model ML, Daloopa, Fiscal.ai, Quartr Pro, Crunched (full source-cited reports in accompanying research files). Key external references cited inline above.*
