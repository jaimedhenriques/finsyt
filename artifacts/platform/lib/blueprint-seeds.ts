import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import {
  withClerkContext,
  blueprintsTable,
  blueprintVersionsTable,
  FINSYT_PUBLISHED_ORG_ID,
  FINSYT_PUBLISHED_USER_ID,
} from '@workspace/db'
import type {
  BlueprintParameter,
  BlueprintStep,
  BlueprintExpectedOutput,
} from '@workspace/db'

// ── Finsyt-curated starter Blueprints ───────────────────────────────────────
// Read-only library that every workspace can run. Seeded into the
// `org_finsyt_published` sentinel org during server startup. Edits to this
// file bump the row's `version`; the prior payload is snapshotted into
// `blueprint_versions` so existing runs remain reproducible.

export interface SeedBlueprint {
  publishedSlug: string
  name: string
  description: string
  category: string
  icon: string
  parameters: BlueprintParameter[]
  steps: BlueprintStep[]
  expectedOutputs: BlueprintExpectedOutput[]
  requiredTools: string[]
  requiredConnectors: string[]
}

// Simple {{var}} substitution applied to step prompts at run time. Step
// prompts can reference any parameter key declared on the Blueprint, plus
// `{{previous_output}}` (the prior step's headline + summary) which the
// runner threads in automatically.
const TICKER_PARAM: BlueprintParameter = {
  key: 'ticker',
  label: 'Primary ticker',
  type: 'ticker',
  required: true,
  helpText: 'The single ticker the playbook will run against (e.g. NVDA).',
}

const PEERS_PARAM: BlueprintParameter = {
  key: 'peers',
  label: 'Peer tickers',
  type: 'tickers',
  required: true,
  helpText: 'Comma-separated peer tickers (e.g. AMD, AVGO).',
}

const SECTOR_PARAM: BlueprintParameter = {
  key: 'sector',
  label: 'Sector or theme',
  type: 'text',
  required: true,
  helpText: 'e.g. "AI infrastructure", "GLP-1 weight-loss", "EU defence".',
}

export const SEED_BLUEPRINTS: SeedBlueprint[] = [
  // ── 1. Investment Committee Memo ──────────────────────────────────────────
  {
    publishedSlug: 'ic-memo',
    name: 'Investment Committee Memo',
    description:
      'Builds a board-ready IC memo for a single name: thesis, financials snapshot, valuation framework, key risks, and the decision question. Five steps, fully cited.',
    category: 'Diligence',
    icon: '◧',
    parameters: [
      TICKER_PARAM,
      {
        key: 'thesis',
        label: 'One-line thesis',
        type: 'longtext',
        required: true,
        helpText: 'Your variant view. Drives the framing of every section.',
      },
      {
        key: 'horizon',
        label: 'Holding horizon',
        type: 'select',
        required: true,
        options: ['6–12 months', '12–24 months', '24–36 months', '3+ years'],
        defaultValue: '12–24 months',
      },
    ],
    steps: [
      {
        id: 'thesis',
        title: 'Thesis & variant perception',
        prompt:
          'Write the IC memo opener for {{ticker}} on a {{horizon}} horizon. Restate the analyst\'s thesis ("{{thesis}}") in IC voice — what we believe, why consensus is wrong, the single quantifiable variable we think is mispriced, and the catalyst path. End with the explicit decision question the IC must answer.',
      },
      {
        id: 'financials',
        title: 'Financials & quality snapshot',
        prompt:
          'Pull the last 4 quarters and last 2 fiscal years for {{ticker}}. Build the snapshot: revenue, gross margin, op margin, FCF margin, ROIC, net leverage, working-capital intensity. Quote each line with source (10-K, 10-Q, FMP). Flag any line where the trajectory diverges from the thesis above.',
      },
      {
        id: 'valuation',
        title: 'Valuation framework',
        prompt:
          'For {{ticker}}, build a triangulated valuation: (1) NTM P/E and EV/EBITDA vs 3-year and 5-year median, (2) DCF sensitivity to WACC and terminal growth, (3) sum-of-parts where applicable. Show implied upside/downside in %. Pull the comp set from peers consensus considers (cite the desk note or screen).',
      },
      {
        id: 'risks',
        title: 'Risks & mitigants',
        prompt:
          'List the top 5 risks to the {{ticker}} thesis ("{{thesis}}"). For each: probability (low/med/high), magnitude in EPS or multiple terms, observable signal we should monitor, and the mitigant or pre-mortem signal that would invalidate the thesis. Cross-check against the 10-K Item 1A risk factors.',
      },
      {
        id: 'recommendation',
        title: 'Recommendation & sizing',
        prompt:
          'Synthesise the prior four sections into a one-page IC recommendation for {{ticker}}. State BUY / HOLD / PASS, suggested initial sizing (% of book) and conviction (1–5), expected IRR and the price targets (base / bull / bear). End with the three things that would make us double down or exit.',
      },
    ],
    expectedOutputs: [
      { key: 'memo', label: 'IC memo (5 sections)', description: 'Board-ready memo.' },
      { key: 'recommendation', label: 'Recommendation', description: 'BUY/HOLD/PASS with sizing.' },
    ],
    requiredTools: ['fmp.fundamentals', 'fmp.estimates', 'web.search'],
    requiredConnectors: [],
  },

  // ── 2. Expert-Call Summary ───────────────────────────────────────────────
  {
    publishedSlug: 'expert-call-summary',
    name: 'Expert-Call Summary',
    description:
      'Turns expert-network call notes into a structured brief: expert profile, headline takeaways, signal-grade assertions, and the questions still open after the call.',
    category: 'Research',
    icon: '◊',
    parameters: [
      {
        key: 'expert_profile',
        label: 'Expert profile',
        type: 'longtext',
        required: true,
        helpText: 'Title, current role, prior roles, time at the company in question.',
      },
      {
        key: 'topic',
        label: 'Call topic / company',
        type: 'text',
        required: true,
      },
      {
        key: 'transcript',
        label: 'Transcript or rough notes',
        type: 'longtext',
        required: true,
        helpText: 'Paste verbatim notes; do NOT pre-summarise.',
      },
    ],
    steps: [
      {
        id: 'profile',
        title: 'Expert profile & vantage',
        prompt:
          'Summarise the expert ({{expert_profile}}) in two sentences focused on what makes them a credible source on {{topic}}. State explicitly which questions they are well-positioned to answer and which they are NOT.',
      },
      {
        id: 'takeaways',
        title: 'Top 5 takeaways',
        prompt:
          'From the call notes below, surface the top 5 takeaways for {{topic}}. Each takeaway: one sentence, lead with the data point or the change, attribute the speaker, and quote any exact phrasing in inverted commas.\n\nNotes:\n"""\n{{transcript}}\n"""',
      },
      {
        id: 'signal_grade',
        title: 'Signal-grade assertions',
        prompt:
          'Re-read the notes and extract every quantitative assertion (numbers, percentages, dollar amounts, ranks, dates). For each, grade the signal as STRONG / MODERATE / WEAK based on (a) how certain the expert sounded, (b) how recent the data is, and (c) whether the expert had direct visibility. Output as a table-style list.',
      },
      {
        id: 'open_questions',
        title: 'Open questions',
        prompt:
          'List the 5 questions about {{topic}} that the call did NOT answer or only partially answered. For each, state why it matters and what kind of expert (industry, customer, supplier, ex-employee) would be best-placed to answer next.',
      },
    ],
    expectedOutputs: [
      { key: 'brief', label: 'Structured call brief', description: '4-section deliverable.' },
      { key: 'open_questions', label: 'Follow-up question list' },
    ],
    requiredTools: [],
    requiredConnectors: [],
  },

  // ── 3. Peer-Cycle Compilation ─────────────────────────────────────────────
  {
    publishedSlug: 'peer-cycle-compilation',
    name: 'Peer-Cycle Compilation',
    description:
      'Compiles a coherent peer view across an earnings cycle: per-peer KPIs and tone, cross-peer themes, and the read-across to the focal name.',
    category: 'Earnings',
    icon: '◳',
    parameters: [
      TICKER_PARAM,
      PEERS_PARAM,
      {
        key: 'cycle',
        label: 'Earnings cycle',
        type: 'text',
        required: true,
        defaultValue: 'most recent',
        helpText: 'e.g. "Q1\'26", "Q4\'25", or "most recent".',
      },
    ],
    steps: [
      {
        id: 'per_peer',
        title: 'Per-peer KPI & tone',
        prompt:
          'For each peer in {{peers}}, capture the {{cycle}} earnings: actual vs consensus on revenue, EPS, gross margin, op margin, FCF — plus the management tone shift (more / less confident on which line items). One row per peer, source-tagged.',
      },
      {
        id: 'cross_peer',
        title: 'Cross-peer themes',
        prompt:
          'Across all peers in {{peers}} for {{cycle}}, identify the 3 strongest cross-cutting themes (e.g. AI capex, pricing pressure, channel inventory). For each theme: which peer expressed it most strongly, the verbatim quote, and the dollar implication for the sector.',
      },
      {
        id: 'read_across',
        title: 'Read-across to {{ticker}}',
        prompt:
          'Apply the peer cycle findings to {{ticker}} ahead of its print. For each cross-peer theme, state the implication for {{ticker}} as: estimate revision direction, line item most affected, and the magnitude (small / medium / large).',
      },
      {
        id: 'questions',
        title: 'Five questions for {{ticker}}',
        prompt:
          'Given the peer cycle, list 5 questions {{ticker}} management is most likely to be asked on its call. Rank by expected price impact. Include the expected management line and what an off-script answer would signal.',
      },
    ],
    expectedOutputs: [
      { key: 'peer_grid', label: 'Peer KPI & tone grid' },
      { key: 'read_across', label: 'Read-across to focal name' },
    ],
    requiredTools: ['fmp.estimates', 'fmp.fundamentals'],
    requiredConnectors: [],
  },

  // ── 4. Sector Landscape ───────────────────────────────────────────────────
  {
    publishedSlug: 'sector-landscape',
    name: 'Sector Landscape',
    description:
      'A consolidated map of a sector or theme: incumbents and challengers, value-chain position, capital flows, and the one or two names worth deeper work.',
    category: 'Research',
    icon: '⊞',
    parameters: [
      SECTOR_PARAM,
      {
        key: 'geography',
        label: 'Geography focus',
        type: 'select',
        required: false,
        options: ['Global', 'US', 'EU', 'APAC', 'EM'],
        defaultValue: 'Global',
      },
    ],
    steps: [
      {
        id: 'map',
        title: 'Value-chain map',
        prompt:
          'Map the {{sector}} value chain end-to-end: upstream inputs, midstream production / platforms, downstream distribution and end customers. For each layer, name the 3–5 incumbents and the 3–5 challengers in {{geography}}. Cite an industry source for the structure.',
      },
      {
        id: 'capital',
        title: 'Capital flows',
        prompt:
          'Summarise the capital flowing into {{sector}} in {{geography}} over the last 12 months: VC funding rounds (with stage and lead), M&A deals (announced and closed), and notable hyperscaler / sovereign capex commitments. Provide a concise totals view.',
      },
      {
        id: 'players',
        title: 'Top public-equity exposures',
        prompt:
          'List the 6 public companies with the cleanest exposure to {{sector}} in {{geography}}. For each: ticker, % of revenue from the theme (cite source), 1-year price performance vs sector benchmark, and one-line bull case / bear case.',
      },
      {
        id: 'workitem',
        title: 'Two names worth deeper work',
        prompt:
          'From the universe above, pick the 2 names where doing 20 hours of incremental work would most likely change a portfolio decision. State the variant view, the incremental data we would gather, and the expected IRR if right.',
      },
    ],
    expectedOutputs: [
      { key: 'landscape', label: 'Sector landscape map' },
      { key: 'shortlist', label: 'Two-name shortlist for deeper work' },
    ],
    requiredTools: ['web.search', 'fmp.fundamentals'],
    requiredConnectors: [],
  },

  // ── 5. M&A Shortlist ──────────────────────────────────────────────────────
  {
    publishedSlug: 'ma-shortlist',
    name: 'M&A Shortlist',
    description:
      'Builds a shortlist of credible acquisition targets given an acquirer\'s strategic gaps, financing capacity, and historical deal patterns.',
    category: 'M&A',
    icon: '◮',
    parameters: [
      {
        key: 'acquirer',
        label: 'Acquirer ticker',
        type: 'ticker',
        required: true,
      },
      {
        key: 'strategic_priority',
        label: 'Strategic priority',
        type: 'longtext',
        required: true,
        helpText: 'The capability, customer, geography, or moat the acquirer most needs.',
      },
      {
        key: 'check_size',
        label: 'Check size range',
        type: 'select',
        required: true,
        options: ['$100M–$500M', '$500M–$2B', '$2B–$10B', '$10B+'],
        defaultValue: '$500M–$2B',
      },
    ],
    steps: [
      {
        id: 'acquirer_profile',
        title: 'Acquirer M&A profile',
        prompt:
          'Profile {{acquirer}} as an acquirer: cash on hand, leverage capacity, recent deal history (last 5 deals with size, multiple paid, integration outcome), stated capital-allocation framework. Pull from the latest 10-K, 10-Q, and earnings call. State the typical deal structure they prefer.',
      },
      {
        id: 'targets',
        title: 'Target universe',
        prompt:
          'Build a list of 8–12 candidate targets that fit (a) the strategic priority "{{strategic_priority}}", (b) the {{check_size}} check, and (c) {{acquirer}}\'s historical pattern. For each: name, public/private, last valuation mark, key product, and why it solves the priority.',
      },
      {
        id: 'shortlist',
        title: 'Shortlist of 3 with deal math',
        prompt:
          'From the universe, pick the 3 most credible targets. For each: implied EV / NTM revenue and EV / EBITDA at a typical control premium, accretion / dilution to {{acquirer}} EPS, antitrust risk read, and the integration angle that would unlock value.',
      },
      {
        id: 'catalysts',
        title: 'Trigger events to watch',
        prompt:
          'List the 5 events that would most likely trigger {{acquirer}} to act on this shortlist (e.g. peer deal, target funding round, regulatory shift, leadership change). For each, the observable signal and the time horizon.',
      },
    ],
    expectedOutputs: [
      { key: 'shortlist', label: 'Top-3 shortlist with deal math' },
      { key: 'triggers', label: 'Trigger events to monitor' },
    ],
    requiredTools: ['fmp.fundamentals', 'web.search'],
    requiredConnectors: [],
  },

  // ── 6. Live Highlights (live event-bound monitor) ─────────────────────────
  // Theme B Blueprint that subscribes to live earnings calls for watchlisted
  // companies and pins management commentary, KPI changes, and analyst Q&A
  // standout moments to the user's notebook in real time, with citations to
  // the exact transcript chunk and timestamp. Authored as a single classifier
  // step so the per-chunk runtime cost stays bounded; the live engine
  // (`lib/live-highlights.ts`) reuses the published spec to drive moment
  // selection and to record `blueprintId` on every audit row.
  {
    publishedSlug: 'live-highlights',
    name: 'Live Highlights',
    description:
      'Watches every live earnings call for watchlisted companies and pins management commentary, KPI changes, and analyst Q&A standout moments to the notebook in real time, with citations and a first-pin notification.',
    category: 'Monitoring',
    icon: '◉',
    parameters: [
      TICKER_PARAM,
      {
        key: 'event',
        label: 'Live event label',
        type: 'text',
        required: true,
        helpText: 'e.g. "Q1 2026 Earnings Call". Set automatically by the live engine.',
      },
      {
        key: 'chunk_text',
        label: 'Transcript chunk',
        type: 'longtext',
        required: true,
        helpText: 'The just-spoken paragraph being evaluated for highlight-worthiness.',
      },
      {
        key: 'speaker',
        label: 'Speaker (role)',
        type: 'text',
        required: false,
        helpText: 'e.g. "CEO", "CFO", "Analyst — Morgan Stanley".',
      },
      {
        key: 'timestamp_label',
        label: 'Citation timestamp',
        type: 'text',
        required: false,
        helpText: 'mm:ss into the call. Used in the citation footer.',
      },
    ],
    steps: [
      {
        id: 'classify',
        title: 'Classify the moment',
        prompt:
          'You are watching the live {{event}} for {{ticker}}. The latest paragraph spoken by {{speaker}} is below. Decide if it is a highlight-worthy moment of one of these kinds: management_commentary (strategy / tone shift / new disclosure), kpi_change (segment number, guide, capex, margin), or qa_standout (a sharp analyst question or off-script answer). If it is none of these, output kind: none. Be strict — only flag moments an investor would want pinned.\n\nParagraph @ {{timestamp_label}}:\n"""\n{{chunk_text}}\n"""',
      },
      {
        id: 'summarize',
        title: 'Two-sentence highlight + citation',
        prompt:
          'Write the pinned highlight for the moment classified above. Two sentences max. Sentence 1 = the data point or claim; sentence 2 = the read-across (why it matters, vs prior guide / vs consensus). End with a one-line citation: "{{ticker}} {{event}} · {{speaker}} @ {{timestamp_label}}". Do not invent numbers — quote what was said.',
      },
    ],
    expectedOutputs: [
      { key: 'highlight', label: 'Pinned highlight (2 sentences + citation)' },
      { key: 'kind', label: 'Moment kind (commentary / KPI / Q&A)' },
    ],
    requiredTools: [],
    requiredConnectors: [],
  },

  // ── 7. Bulk Outreach ──────────────────────────────────────────────────────
  {
    publishedSlug: 'bulk-outreach',
    name: 'Bulk Outreach Brief',
    description:
      'Produces a personalised first-touch outreach packet for a list of companies or experts: tailored hook, three-question agenda, and the data points the recipient will respect.',
    category: 'Outreach',
    icon: '◔',
    parameters: [
      {
        key: 'recipients',
        label: 'Recipient list',
        type: 'longtext',
        required: true,
        helpText: 'One per line. Format: "Name, Title, Company".',
      },
      {
        key: 'objective',
        label: 'Outreach objective',
        type: 'longtext',
        required: true,
        helpText: 'What you want from the call (data point, market read, network intro, etc.).',
      },
      {
        key: 'sender_context',
        label: 'Sender context',
        type: 'text',
        required: true,
        helpText: 'Who you are, the firm, AUM, what you cover.',
      },
    ],
    steps: [
      {
        id: 'hook_per_recipient',
        title: 'Hook per recipient',
        prompt:
          'For each recipient below, draft a 1-sentence opening hook that demonstrates real homework — referencing a recent product, public statement, hire, or filing tied to that specific person. No generic "I admire your work" filler.\n\nRecipients:\n{{recipients}}\n\nSender: {{sender_context}}',
      },
      {
        id: 'agenda',
        title: 'Three-question agenda',
        prompt:
          'Build a generic 3-question agenda tied to the objective: "{{objective}}". The questions should be sharp enough that a senior recipient sees the value of a 30-minute call. Mark each question with the kind of expert best-placed to answer.',
      },
      {
        id: 'packet',
        title: 'Personalised email packet',
        prompt:
          'Combine the per-recipient hook with the shared 3-question agenda into a complete first-touch email per recipient. Each email: opening hook, one paragraph on objective, the 3 questions as a bullet list, sender signature ({{sender_context}}). Keep each email under 140 words.',
      },
    ],
    expectedOutputs: [
      { key: 'emails', label: 'One personalised email per recipient' },
      { key: 'agenda', label: 'Shared three-question agenda' },
    ],
    requiredTools: ['web.search'],
    requiredConnectors: [],
  },

  // ── 8. Competitive Teardown ───────────────────────────────────────────────
  {
    publishedSlug: 'competitive-teardown',
    name: 'Competitive Teardown',
    description:
      'A structured head-to-head competitive analysis: product positioning, unit-economics comparison, strategic moats, and the one inflection that could tip share.',
    category: 'Competitive',
    icon: '⊿',
    parameters: [
      TICKER_PARAM,
      PEERS_PARAM,
      {
        key: 'battleground',
        label: 'Key battleground',
        type: 'text',
        required: true,
        helpText: 'The product segment, customer cohort, or geography where competition is most acute.',
      },
    ],
    steps: [
      {
        id: 'positioning',
        title: 'Product & pricing positioning',
        prompt:
          'Compare {{ticker}} vs {{peers}} on the {{battleground}} battleground. For each company: key product(s) in this segment, list price / ASP, primary customer ICP, channel (direct / partner / marketplace), and the stated differentiator. Flag any pricing move in the last 12 months.',
      },
      {
        id: 'unit_economics',
        title: 'Unit-economics comparison',
        prompt:
          'Build a unit-economics grid for {{ticker}} vs {{peers}} in {{battleground}}. Columns: gross margin (segment-level if disclosed, company-level otherwise), CAC proxy (S&M % of revenue), NRR or logo churn where available, R&D intensity. Source every cell. Highlight the widest gap — who has the structural cost advantage?',
      },
      {
        id: 'moats',
        title: 'Moat assessment',
        prompt:
          'Rate each of {{ticker}} and {{peers}} on four moat dimensions for {{battleground}}: switching costs (1–5), network effects (1–5), data advantage (1–5), scale economics (1–5). State the evidence for each score. Identify the company with the most durable composite moat.',
      },
      {
        id: 'inflection',
        title: 'The share-shift inflection',
        prompt:
          'Identify the single most likely inflection point — product launch, pricing reset, partnership, regulation, or technology shift — that could materially shift {{battleground}} share among {{ticker}} and {{peers}} in the next 12–18 months. State the probability, the winner, the loser, and the observable signal that would confirm it.',
      },
    ],
    expectedOutputs: [
      { key: 'grid', label: 'Competitive grid (positioning + unit economics)' },
      { key: 'inflection', label: 'Share-shift inflection thesis' },
    ],
    requiredTools: ['fmp.fundamentals', 'web.search'],
    requiredConnectors: [],
  },

  // ── 9. Earnings Preview ────────────────────────────────────────────────────
  {
    publishedSlug: 'earnings-preview',
    name: 'Earnings Preview',
    description:
      'A pre-print research brief for an upcoming earnings call: consensus setup, the three numbers that matter most, our variant view, and the questions to watch.',
    category: 'Monitoring',
    icon: '◷',
    parameters: [
      TICKER_PARAM,
      {
        key: 'print_date',
        label: 'Expected print date',
        type: 'text',
        required: true,
        helpText: 'e.g. "July 29, 2026 after close".',
      },
      {
        key: 'variant_view',
        label: 'Our variant view vs consensus',
        type: 'longtext',
        required: true,
        helpText: 'Where do we differ from the Street on any key metric or guide?',
      },
    ],
    steps: [
      {
        id: 'consensus_setup',
        title: 'Consensus setup',
        prompt:
          'Pull the current consensus estimates for {{ticker}} for the upcoming print on {{print_date}}. Report: revenue (consensus vs prior quarter actuals vs year-ago), EPS (consensus vs actuals), gross margin, operating margin, and any segment-level estimates that are widely tracked. Note the number of estimate revisions in the last 30 days and the direction.',
      },
      {
        id: 'three_numbers',
        title: 'The three numbers that matter',
        prompt:
          'Identify the three metrics where {{ticker}} has the most potential to surprise vs consensus on {{print_date}}. For each: (1) why this metric is pivotal to the stock reaction this quarter, (2) the consensus bar, (3) our read vs consensus ("{{variant_view}}"), and (4) the likely management language if they beat or miss.',
      },
      {
        id: 'guide_read',
        title: 'Forward guide read',
        prompt:
          'Based on {{ticker}}\'s historical guidance cadence and the latest macro / peer data points, what is the most likely range for the forward guide? State the bull / base / bear revenue and margin guide and the probability-weighted reaction: what does the stock do if they guide in-line, beat, or cut?',
      },
      {
        id: 'call_questions',
        title: 'Questions to watch on the call',
        prompt:
          'List the 5 analyst questions most likely to move {{ticker}} stock on {{print_date}}. For each: the expected question, the management line (default), the off-script answer that would be incrementally positive, and the off-script answer that would be incrementally negative. End with the one question that is NOT on consensus radar but matters most to our variant view ("{{variant_view}}").',
      },
    ],
    expectedOutputs: [
      { key: 'setup', label: 'Consensus setup card' },
      { key: 'questions', label: 'Annotated call question list' },
    ],
    requiredTools: ['fmp.estimates', 'fmp.fundamentals', 'web.search'],
    requiredConnectors: [],
  },

  // ── 10. Credit & Debt Profile ─────────────────────────────────────────────
  {
    publishedSlug: 'credit-debt-profile',
    name: 'Credit & Debt Profile',
    description:
      'A diligence-grade credit memo: debt waterfall, covenant analysis, liquidity runway, refinancing risk, and a stress-test of coverage ratios under a downturn scenario.',
    category: 'Diligence',
    icon: '◑',
    parameters: [
      TICKER_PARAM,
      {
        key: 'stress_scenario',
        label: 'Stress scenario',
        type: 'text',
        required: false,
        defaultValue: '20% revenue decline, flat margins',
        helpText: 'The macro or company-specific stress to model — e.g. "20% revenue decline, flat margins".',
      },
    ],
    steps: [
      {
        id: 'debt_waterfall',
        title: 'Debt waterfall',
        prompt:
          'Pull the complete debt schedule for {{ticker}} from the most recent 10-K or 10-Q. Build the waterfall: each tranche (revolver, term loan A/B, senior notes, converts, operating leases), outstanding balance, maturity date, coupon / spread, and seniority. Flag any tranches maturing within 24 months and any cross-default provisions.',
      },
      {
        id: 'covenant_analysis',
        title: 'Covenant analysis',
        prompt:
          'Extract the key financial maintenance covenants disclosed by {{ticker}} (leverage ratio, interest-coverage ratio, min liquidity). For each: the covenant threshold, current actual level, and the headroom in percentage points. State which covenant would be tripped first in a moderate downturn and at what revenue level.',
      },
      {
        id: 'liquidity_runway',
        title: 'Liquidity runway',
        prompt:
          'Calculate {{ticker}}\'s liquidity runway: cash + undrawn revolver / monthly cash burn (use last-12-months FCF / 12). Show the sources-and-uses bridge over the next 18 months including known debt maturities, capex commitments, and any earn-out obligations. State whether the runway comfortably covers the next covenant test date.',
      },
      {
        id: 'stress_test',
        title: 'Stress-test of coverage ratios',
        prompt:
          'Apply the stress scenario "{{stress_scenario}}" to {{ticker}}\'s P&L and balance sheet. Show: stressed EBITDA, stressed interest coverage (EBITDA / interest expense), stressed net leverage (net debt / EBITDA), and stressed FCF. Flag any metric that breaches a covenant threshold. State the probability of a covenant waiver or amendment being required within 12 months under this scenario.',
      },
    ],
    expectedOutputs: [
      { key: 'waterfall', label: 'Debt waterfall table' },
      { key: 'stress_test', label: 'Stressed coverage ratio analysis' },
    ],
    requiredTools: ['fmp.fundamentals'],
    requiredConnectors: [],
  },
]

// ── Idempotent installer ────────────────────────────────────────────────────
// Called from `instrumentation.ts` on every server boot. Inserts any missing
// seed blueprints, and bumps `version` on rows whose payload has drifted from
// the source-of-truth in this file. Snapshots the prior payload into
// `blueprint_versions` so existing runs stay reproducible.

let seedAttempted = false

export async function ensureSeedBlueprints(): Promise<void> {
  if (seedAttempted) return
  seedAttempted = true
  try {
    await withClerkContext(FINSYT_PUBLISHED_ORG_ID, FINSYT_PUBLISHED_USER_ID, async (tx) => {
      for (const seed of SEED_BLUEPRINTS) {
        const [existing] = await tx
          .select()
          .from(blueprintsTable)
          .where(
            and(
              eq(blueprintsTable.orgId, FINSYT_PUBLISHED_ORG_ID),
              eq(blueprintsTable.publishedSlug, seed.publishedSlug),
            ),
          )
          .limit(1)

        const payload = {
          name: seed.name,
          description: seed.description,
          category: seed.category,
          icon: seed.icon,
          parameters: seed.parameters,
          steps: seed.steps,
          expectedOutputs: seed.expectedOutputs,
          requiredTools: seed.requiredTools,
          requiredConnectors: seed.requiredConnectors,
        }

        if (!existing) {
          const [created] = await tx
            .insert(blueprintsTable)
            .values({
              orgId: FINSYT_PUBLISHED_ORG_ID,
              authorUserId: FINSYT_PUBLISHED_USER_ID,
              slug: seed.publishedSlug,
              publishedSlug: seed.publishedSlug,
              name: seed.name,
              description: seed.description,
              category: seed.category,
              icon: seed.icon,
              visibility: 'published',
              version: 1,
              parameters: seed.parameters as unknown as object,
              steps: seed.steps as unknown as object,
              expectedOutputs: seed.expectedOutputs as unknown as object,
              requiredTools: seed.requiredTools,
              requiredConnectors: seed.requiredConnectors,
            })
            .returning()

          await tx.insert(blueprintVersionsTable).values({
            orgId: FINSYT_PUBLISHED_ORG_ID,
            blueprintId: created.id,
            version: 1,
            payload: payload as unknown as object,
            authorUserId: FINSYT_PUBLISHED_USER_ID,
          })
          continue
        }

        // Drift detection: if any field changed, bump version + snapshot prior.
        const drifted =
          existing.name !== seed.name ||
          existing.description !== seed.description ||
          existing.category !== seed.category ||
          existing.icon !== seed.icon ||
          JSON.stringify(existing.parameters) !== JSON.stringify(seed.parameters) ||
          JSON.stringify(existing.steps) !== JSON.stringify(seed.steps) ||
          JSON.stringify(existing.expectedOutputs) !== JSON.stringify(seed.expectedOutputs) ||
          JSON.stringify(existing.requiredTools) !== JSON.stringify(seed.requiredTools) ||
          JSON.stringify(existing.requiredConnectors) !== JSON.stringify(seed.requiredConnectors)

        if (!drifted) continue

        // Snapshot the prior version, then update the row in place.
        await tx.insert(blueprintVersionsTable).values({
          orgId: FINSYT_PUBLISHED_ORG_ID,
          blueprintId: existing.id,
          version: existing.version,
          payload: {
            name: existing.name,
            description: existing.description,
            category: existing.category,
            icon: existing.icon,
            parameters: existing.parameters,
            steps: existing.steps,
            expectedOutputs: existing.expectedOutputs,
            requiredTools: existing.requiredTools,
            requiredConnectors: existing.requiredConnectors,
          } as unknown as object,
          authorUserId: FINSYT_PUBLISHED_USER_ID,
        })

        await tx
          .update(blueprintsTable)
          .set({
            name: seed.name,
            description: seed.description,
            category: seed.category,
            icon: seed.icon,
            parameters: seed.parameters as unknown as object,
            steps: seed.steps as unknown as object,
            expectedOutputs: seed.expectedOutputs as unknown as object,
            requiredTools: seed.requiredTools,
            requiredConnectors: seed.requiredConnectors,
            version: sql`${blueprintsTable.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(blueprintsTable.id, existing.id))
      }
    })
  } catch (err) {
    // Fail-soft: a transient DB hiccup must not crash the server. The
    // installer will retry on next boot.
    seedAttempted = false
    // eslint-disable-next-line no-console
    console.warn('[ensureSeedBlueprints] failed:', err)
  }
}
