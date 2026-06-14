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
