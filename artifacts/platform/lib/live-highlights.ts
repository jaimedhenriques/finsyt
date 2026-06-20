import 'server-only'
import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'
import {
  audit,
  blueprintsTable,
  blueprintRunsTable,
  liveHighlightsCallsTable,
  liveHighlightsFilingSignalsTable,
  liveHighlightsNotificationsTable,
  liveHighlightsPinsTable,
  liveHighlightsSettingsTable,
  researchNotesTable,
  withClerkContext,
  withComplianceContext,
  withOrgContext,
  FINSYT_PUBLISHED_ORG_ID,
  type BlueprintRow,
  type BlueprintStep,
} from '@workspace/db'
import { resolveLocalOrgId } from './org-resolver'
import {
  callKey,
  callHasEnded,
  chunksForCall,
  chunksRevealedAt,
  fmtTimestamp,
  liveSelection,
  type LiveCall,
  type LiveChunk,
} from './live-events-source'
import { executeAgent, type RunOutput } from './agent-executor'

// ── Live Highlights engine ─────────────────────────────────────────────────
// Demo-grade live runtime that turns the published "Live Highlights" Blueprint
// into a per-org subscription. Engine state — settings, per-call cursors,
// the set of already-pinned chunks, and the bell notification queue — used
// to live in process memory, which meant a Next.js dev restart, deploy, or
// crash silently lost it and re-pinned every chunk on the next tick. All of
// that bookkeeping now lives in `live_highlights_*` tables (see
// `lib/db/src/schema/live-highlights.ts`); the pinned research notes are
// still written to `research_notes` exactly as before.
//
//   1. On every `tickLiveHighlights({orgId, userId, watchlist})` call we:
//      a) read the persisted settings row (or seed defaults for a new org),
//      b) compute which monitored tickers are currently live,
//      c) advance the per-call cursor in `live_highlights_calls`,
//      d) for every newly-revealed highlight-worthy chunk, INSERT the
//         per-chunk row in `live_highlights_pins` first (composite PK
//         `(org_id, call_key, chunk_idx)` is the atomic dedup guard) and
//         only then write the research note + audit row. If the pin row
//         conflicts, the chunk has already been pinned by an earlier tick
//         (possibly before a restart) and we skip it cleanly.
//      e) UPSERT first-pin / end-of-call rollups into
//         `live_highlights_notifications` so the bell survives restart.
//   2. Settings updates go through `updateLiveHighlightsSettings`, which
//      upserts the per-org row.
//   3. Notifications are read straight from the table and `markNotificationsRead`
//      flips the `read` column.
//
// Each newly-revealed chunk is fed through the resolved Blueprint's steps
// via `executeAgent` (the same Groq → Perplexity executor the manual
// `runBlueprint` engine uses). The classify step decides whether to pin
// (and which `kind` the moment is); the summarize step writes the pinned
// headline + summary. Customers can swap to their own Blueprint via
// `updateLiveHighlightsSettings({blueprintId})` — the next tick picks up the
// new prompts. If the LLM is unreachable or returns an unparseable response
// we silently no-pin for that chunk; the user never sees an error toast.
// The chosen Blueprint's id + version are recorded on every pin, audit row
// and `blueprint_runs` row so the substitution is visible end-to-end.

export interface DeliveryChannelPrefs {
  /** Always true — the in-app bell is the source of truth for the engine. */
  bell: true
  /** Send the same notification as a single email when it fires. */
  email: boolean
  /** Send the same notification to a Slack incoming webhook when it fires. */
  slack: boolean
}

export interface LiveHighlightsSettings {
  enabled: boolean
  blueprintId: string | null   // null → use published "live-highlights"
  disabledSymbols: string[]    // opt-out per ticker
  adHocSymbols: string[]       // monitor even if not on watchlist
  /** Per-org fan-out preferences for first-pin and end-of-call notifications. */
  deliveryChannels: DeliveryChannelPrefs
  /** Org-wide Slack incoming webhook URL (when `deliveryChannels.slack`). */
  slackWebhookUrl: string | null
  /** Optional explicit email recipient list. Empty = use org member emails. */
  emailRecipients: string[]
  /**
   * Minimum AI signal score (0–100) a fresh SEC filing must reach before
   * the filing-signal watcher pins a Live Highlight + fires an alert.
   */
  filingScoreThreshold: number
}

export interface LiveHighlightPin {
  noteId: string
  callKey: string
  symbol: string
  event: string
  speaker: string
  role: string
  kind: 'management_commentary' | 'kpi_change' | 'qa_standout'
  headline: string
  summary: string
  startSec: number
  timestampLabel: string
  pinnedAt: number
  alignment: 'estimated' | 'aligned'
  blueprintId: string | null
  blueprintVersion: number | null
  /** ID of the per-call Blueprint run row this pin belongs to. */
  runId: string | null
}

export interface LiveHighlightNotification {
  id: string
  kind: 'first_pin' | 'end_of_call' | 'filing_signal' | 'workflow'
  symbol: string
  event: string
  callKey: string
  message: string
  ts: number
  read: boolean
  noteId: string | null
  pinCount?: number
  /**
   * Which channels the notification was actually delivered through.
   * Always includes `'bell'`; `'email'` and/or `'slack'` are added when
   * the org opted in and the corresponding send succeeded. Useful both
   * for the bell UI ("also sent to Slack") and audit review.
   */
  deliveredChannels?: ('bell' | 'email' | 'slack')[]
}

const DEFAULT_SETTINGS: LiveHighlightsSettings = {
  enabled: true,
  blueprintId: null,
  disabledSymbols: [],
  adHocSymbols: [],
  deliveryChannels: { bell: true, email: false, slack: false },
  slackWebhookUrl: null,
  emailRecipients: [],
  filingScoreThreshold: 70,
}

const MAX_PINS_KEPT = 50
const MAX_NOTIFS_KEPT = 30

function cloneDefaultSettings(): LiveHighlightsSettings {
  return {
    ...DEFAULT_SETTINGS,
    disabledSymbols: [],
    adHocSymbols: [],
    deliveryChannels: { ...DEFAULT_SETTINGS.deliveryChannels },
    emailRecipients: [],
  }
}

// ── Settings ────────────────────────────────────────────────────────────────
export async function getLiveHighlightsSettings(orgId: string): Promise<LiveHighlightsSettings> {
  try {
    const [row] = await withComplianceContext(orgId, (tx) =>
      tx
        .select()
        .from(liveHighlightsSettingsTable)
        .where(eq(liveHighlightsSettingsTable.orgId, orgId))
        .limit(1),
    )
    if (!row) return { ...DEFAULT_SETTINGS, disabledSymbols: [], adHocSymbols: [] }
    return rowToSettings(row)
  } catch {
    // Fail-soft: a transient DB blip should still let the UI render the toggle.
    return { ...DEFAULT_SETTINGS, disabledSymbols: [], adHocSymbols: [] }
  }
}

function rowToSettings(row: {
  enabled: boolean
  blueprintId: string | null
  disabledSymbols: string[]
  adHocSymbols: string[]
  deliveryChannels?: { bell?: boolean; email?: boolean; slack?: boolean } | null
  slackWebhookUrl?: string | null
  emailRecipients?: string[] | null
  filingScoreThreshold?: number | null
}): LiveHighlightsSettings {
  const dc = row.deliveryChannels && typeof row.deliveryChannels === 'object'
    ? row.deliveryChannels
    : {}
  return {
    enabled: row.enabled,
    blueprintId: row.blueprintId,
    disabledSymbols: Array.isArray(row.disabledSymbols) ? row.disabledSymbols : [],
    adHocSymbols: Array.isArray(row.adHocSymbols) ? row.adHocSymbols : [],
    deliveryChannels: {
      bell: true,
      email: typeof dc.email === 'boolean' ? dc.email : false,
      slack: typeof dc.slack === 'boolean' ? dc.slack : false,
    },
    slackWebhookUrl: row.slackWebhookUrl ?? null,
    emailRecipients: Array.isArray(row.emailRecipients) ? row.emailRecipients : [],
    filingScoreThreshold: clampThreshold(row.filingScoreThreshold),
  }
}

// Clamp a raw threshold to the valid 0–100 range, defaulting to 70 for
// null/NaN inputs (pre-migration rows or a transient read).
function clampThreshold(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 70
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * Strip secret-bearing fields from a settings snapshot before it is
 * persisted to the durable audit log.
 *
 * The Slack webhook URL is a live, unauthenticated credential — anyone
 * holding it can post arbitrary messages into the org's Slack channel.
 * Recording it verbatim in the audit row would persist that credential
 * indefinitely, making every audit-log reader an effective key-holder.
 *
 * We replace it with a stable boolean (`slackWebhookConfigured`) plus a
 * short host-only fingerprint so reviewers can still see *that* it
 * changed without ever exposing the secret. Email recipients are
 * reduced to a count for the same reason — we don't want PII in the
 * audit-log JSON either.
 */
export function redactSettingsForAudit(s: LiveHighlightsSettings): Record<string, unknown> {
  return {
    enabled: s.enabled,
    blueprintId: s.blueprintId,
    disabledSymbols: [...s.disabledSymbols],
    adHocSymbols: [...s.adHocSymbols],
    deliveryChannels: { ...s.deliveryChannels },
    slackWebhookConfigured: !!s.slackWebhookUrl,
    slackWebhookFingerprint: s.slackWebhookUrl
      ? hashFingerprint(s.slackWebhookUrl)
      : null,
    emailRecipientCount: s.emailRecipients.length,
    filingScoreThreshold: s.filingScoreThreshold,
  }
}

// Stable, non-reversible 8-char fingerprint so reviewers can tell when
// the Slack URL changes without us ever persisting the URL itself or
// any guessable substring of it.
function hashFingerprint(input: string): string {
  // Lightweight FNV-1a 32-bit — we don't need cryptographic strength
  // here, only "different inputs land on different fingerprints in the
  // audit log". Keeps the helper sync and dependency-free.
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `fp_${(h >>> 0).toString(16).padStart(8, '0')}`
}

export interface SettingsPatch {
  enabled?: boolean
  blueprintId?: string | null
  disabledSymbols?: string[]
  adHocSymbols?: string[]
  deliveryChannels?: { email?: boolean; slack?: boolean }
  slackWebhookUrl?: string | null
  emailRecipients?: string[]
  filingScoreThreshold?: number
}

const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function updateLiveHighlightsSettings(
  orgId: string,
  patch: SettingsPatch,
): Promise<LiveHighlightsSettings> {
  const current = await getLiveHighlightsSettings(orgId)

  // Compute the new delivery-channel set up-front so we can also use it to
  // force-disable Slack when the webhook URL is being cleared in the same
  // patch (otherwise we'd persist `slack: true` with `slackWebhookUrl: null`
  // and the next tick would silently drop deliveries).
  let deliveryChannels = current.deliveryChannels
  if (patch.deliveryChannels && typeof patch.deliveryChannels === 'object') {
    deliveryChannels = {
      bell: true,
      email: typeof patch.deliveryChannels.email === 'boolean'
        ? patch.deliveryChannels.email
        : deliveryChannels.email,
      slack: typeof patch.deliveryChannels.slack === 'boolean'
        ? patch.deliveryChannels.slack
        : deliveryChannels.slack,
    }
  }

  let slackWebhookUrl = current.slackWebhookUrl
  if (patch.slackWebhookUrl !== undefined) {
    const v = patch.slackWebhookUrl
    if (v === null || v === '') {
      slackWebhookUrl = null
      // Disabling the URL also force-clears the slack channel so we don't
      // silently keep `email + slack` enabled with no working endpoint.
      if (deliveryChannels.slack) {
        deliveryChannels = { ...deliveryChannels, slack: false }
      }
    } else if (typeof v === 'string' && SLACK_WEBHOOK_PATTERN.test(v.trim())) {
      slackWebhookUrl = v.trim()
    }
    // Silently reject non-conforming strings — keeps the prior URL intact
    // and the audit row will show the no-op.
  }

  const emailRecipients = Array.isArray(patch.emailRecipients)
    ? patch.emailRecipients
        .map((x) => String(x).trim())
        .filter((x) => EMAIL_PATTERN.test(x))
        .slice(0, 50)
    : current.emailRecipients

  const next: LiveHighlightsSettings = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    blueprintId:
      patch.blueprintId === undefined ? current.blueprintId : patch.blueprintId || null,
    disabledSymbols: Array.isArray(patch.disabledSymbols)
      ? patch.disabledSymbols.map((x) => String(x).toUpperCase().trim()).filter(Boolean).slice(0, 100)
      : current.disabledSymbols,
    adHocSymbols: Array.isArray(patch.adHocSymbols)
      ? patch.adHocSymbols.map((x) => String(x).toUpperCase().trim()).filter(Boolean).slice(0, 100)
      : current.adHocSymbols,
    deliveryChannels,
    slackWebhookUrl,
    emailRecipients,
    filingScoreThreshold:
      patch.filingScoreThreshold === undefined
        ? current.filingScoreThreshold
        : clampThreshold(patch.filingScoreThreshold),
  }

  await withComplianceContext(orgId, (tx) =>
    tx
      .insert(liveHighlightsSettingsTable)
      .values({
        orgId,
        enabled: next.enabled,
        blueprintId: next.blueprintId,
        disabledSymbols: next.disabledSymbols,
        adHocSymbols: next.adHocSymbols,
        deliveryChannels: next.deliveryChannels,
        slackWebhookUrl: next.slackWebhookUrl,
        emailRecipients: next.emailRecipients,
        filingScoreThreshold: next.filingScoreThreshold,
      })
      .onConflictDoUpdate({
        target: liveHighlightsSettingsTable.orgId,
        set: {
          enabled: next.enabled,
          blueprintId: next.blueprintId,
          disabledSymbols: next.disabledSymbols,
          adHocSymbols: next.adHocSymbols,
          deliveryChannels: next.deliveryChannels,
          slackWebhookUrl: next.slackWebhookUrl,
          emailRecipients: next.emailRecipients,
          filingScoreThreshold: next.filingScoreThreshold,
          updatedAt: new Date(),
        },
      }),
  )
  return next
}

// ── Read-side ───────────────────────────────────────────────────────────────
export async function getRecentPins(orgId: string, limit = 20): Promise<LiveHighlightPin[]> {
  const lim = Math.max(1, Math.min(MAX_PINS_KEPT, limit))
  try {
    const rows = await withComplianceContext(orgId, (tx) =>
      tx
        .select({
          callKey: liveHighlightsPinsTable.callKey,
          chunkIdx: liveHighlightsPinsTable.chunkIdx,
          noteId: liveHighlightsPinsTable.noteId,
          alignment: liveHighlightsPinsTable.alignment,
          blueprintId: liveHighlightsPinsTable.blueprintId,
          blueprintVersion: liveHighlightsPinsTable.blueprintVersion,
          pinnedAt: liveHighlightsPinsTable.pinnedAt,
          symbol: liveHighlightsCallsTable.symbol,
          event: liveHighlightsCallsTable.event,
          startedAt: liveHighlightsCallsTable.startedAt,
          runId: liveHighlightsCallsTable.runId,
        })
        .from(liveHighlightsPinsTable)
        .innerJoin(
          liveHighlightsCallsTable,
          and(
            eq(liveHighlightsCallsTable.orgId, liveHighlightsPinsTable.orgId),
            eq(liveHighlightsCallsTable.callKey, liveHighlightsPinsTable.callKey),
          ),
        )
        .where(eq(liveHighlightsPinsTable.orgId, orgId))
        .orderBy(desc(liveHighlightsPinsTable.pinnedAt))
        .limit(lim),
    )
    return rows
      .map((r) => reconstructPin(r))
      .filter((p): p is LiveHighlightPin => p !== null)
  } catch {
    return []
  }
}

function reconstructPin(row: {
  callKey: string
  chunkIdx: number
  noteId: string
  alignment: string
  blueprintId: string | null
  blueprintVersion: number | null
  pinnedAt: Date
  symbol: string
  event: string
  startedAt: Date
  runId: string | null
}): LiveHighlightPin | null {
  const call: LiveCall = {
    symbol: row.symbol,
    name: row.symbol,
    event: row.event,
    startedAt: row.startedAt.toISOString(),
  } as LiveCall
  const chunks = chunksForCall(call)
  const chunk = chunks.find((c) => c.idx === row.chunkIdx)
  if (!chunk || chunk.kind === 'none') return null
  const alignment = (row.alignment === 'aligned' ? 'aligned' : 'estimated') as LiveHighlightPin['alignment']
  return {
    noteId: row.noteId,
    callKey: row.callKey,
    symbol: row.symbol,
    event: row.event,
    speaker: chunk.speaker,
    role: chunk.role,
    kind: chunk.kind as LiveHighlightPin['kind'],
    headline: chunk.headline,
    summary: composeSummary(chunk),
    startSec: chunk.startSec,
    timestampLabel: fmtTimestamp(chunk.startSec),
    pinnedAt: row.pinnedAt.getTime(),
    alignment,
    blueprintId: row.blueprintId,
    blueprintVersion: row.blueprintVersion,
    runId: row.runId,
  }
}

export async function getRecentNotifications(orgId: string): Promise<LiveHighlightNotification[]> {
  try {
    const rows = await withComplianceContext(orgId, (tx) =>
      tx
        .select()
        .from(liveHighlightsNotificationsTable)
        .where(eq(liveHighlightsNotificationsTable.orgId, orgId))
        .orderBy(desc(liveHighlightsNotificationsTable.ts))
        .limit(MAX_NOTIFS_KEPT),
    )
    return rows.map(rowToNotification)
  } catch {
    return []
  }
}

function rowToNotification(row: {
  id: string
  kind: string
  symbol: string
  event: string
  callKey: string
  message: string
  noteId: string | null
  pinCount: number | null
  read: boolean
  ts: Date
}): LiveHighlightNotification {
  return {
    id: row.id,
    kind: (row.kind === 'end_of_call' || row.kind === 'filing_signal' || row.kind === 'workflow'
      ? row.kind
      : 'first_pin') as LiveHighlightNotification['kind'],
    symbol: row.symbol,
    event: row.event,
    callKey: row.callKey,
    message: row.message,
    ts: row.ts.getTime(),
    read: row.read,
    noteId: row.noteId,
    pinCount: row.pinCount ?? undefined,
  }
}

export async function markNotificationsRead(orgId: string, ids?: string[]): Promise<void> {
  try {
    await withComplianceContext(orgId, (tx) => {
      if (ids?.length) {
        return tx
          .update(liveHighlightsNotificationsTable)
          .set({ read: true })
          .where(
            and(
              eq(liveHighlightsNotificationsTable.orgId, orgId),
              inArray(liveHighlightsNotificationsTable.id, ids),
            ),
          )
      }
      return tx
        .update(liveHighlightsNotificationsTable)
        .set({ read: true })
        .where(eq(liveHighlightsNotificationsTable.orgId, orgId))
    })
  } catch {
    /* fail-soft */
  }
}

export async function getActiveCallsFor(orgId: string, watchlist: string[]): Promise<LiveCall[]> {
  const settings = await getLiveHighlightsSettings(orgId)
  const monitor = monitorSet(watchlist, settings)
  return liveSelection().filter((c) => monitor.has(c.symbol.toUpperCase()))
}

function monitorSet(watchlist: string[], settings: LiveHighlightsSettings): Set<string> {
  const out = new Set<string>()
  for (const s of watchlist) out.add(String(s).toUpperCase())
  for (const s of settings.adHocSymbols) out.add(String(s).toUpperCase())
  for (const s of settings.disabledSymbols) out.delete(String(s).toUpperCase())
  return out
}

// ── Blueprint resolution ────────────────────────────────────────────────────
// We look up the published "live-highlights" Blueprint (or the user-chosen
// substitute) so every pin records the exact (blueprintId, version) it was
// driven by AND so the engine can iterate the Blueprint's steps through
// `executeAgent` per chunk. The full step list is cached with the resolved
// row so a tick that processes several chunks does not re-query the table.
let cachedDefault: ResolvedBlueprint | null = null
async function resolveDefaultBlueprint(): Promise<ResolvedBlueprint | null> {
  if (cachedDefault) return cachedDefault
  try {
    const { db } = await import('@workspace/db')
    const [row] = await db
      .select({
        id: blueprintsTable.id,
        version: blueprintsTable.version,
        name: blueprintsTable.name,
        category: blueprintsTable.category,
        icon: blueprintsTable.icon,
        publishedSlug: blueprintsTable.publishedSlug,
        steps: blueprintsTable.steps,
      })
      .from(blueprintsTable)
      .where(
        and(
          eq(blueprintsTable.orgId, FINSYT_PUBLISHED_ORG_ID),
          eq(blueprintsTable.publishedSlug, 'live-highlights'),
        ),
      )
      .limit(1)
    if (row) {
      cachedDefault = {
        id: row.id,
        version: row.version,
        name: row.name,
        category: row.category,
        icon: row.icon,
        publishedSlug: row.publishedSlug,
        steps: (row.steps as unknown as BlueprintStep[]) || [],
      }
      return cachedDefault
    }
  } catch {
    /* fall-through */
  }
  return null
}

interface ResolvedBlueprint {
  id: string
  version: number
  name: string
  category: string
  icon: string
  publishedSlug: string | null
  steps: BlueprintStep[]
}

async function resolveBlueprintForOrg(
  orgId: string,
  settings: LiveHighlightsSettings,
): Promise<ResolvedBlueprint | null> {
  if (settings.blueprintId) {
    try {
      const { db } = await import('@workspace/db')
      const [row] = await db
        .select({
          id: blueprintsTable.id,
          version: blueprintsTable.version,
          orgId: blueprintsTable.orgId,
          name: blueprintsTable.name,
          category: blueprintsTable.category,
          icon: blueprintsTable.icon,
          publishedSlug: blueprintsTable.publishedSlug,
          steps: blueprintsTable.steps,
        })
        .from(blueprintsTable)
        .where(eq(blueprintsTable.id, settings.blueprintId))
        .limit(1)
      if (row && (row.orgId === orgId || row.orgId === FINSYT_PUBLISHED_ORG_ID)) {
        return {
          id: row.id,
          version: row.version,
          name: row.name,
          category: row.category,
          icon: row.icon,
          publishedSlug: row.publishedSlug,
          steps: (row.steps as unknown as BlueprintStep[]) || [],
        }
      }
      // Bad pointer — clear it and fall back. Persist the cleanup so the
      // engine isn't fighting itself on every tick.
      await updateLiveHighlightsSettings(orgId, { blueprintId: null })
    } catch {
      /* ignore, fall back */
    }
  }
  return await resolveDefaultBlueprint()
}

// ── Per-chunk Blueprint runner ──────────────────────────────────────────────
// Runs the resolved Blueprint's steps in sequence against a single transcript
// chunk. The first step is treated as the classifier (its output decides
// whether the moment is highlight-worthy and which `kind` it is); the last
// step's headline + summary are used as the pinned highlight body. If the
// Blueprint has only one step, that step is used for both classification and
// summary. Returns null on any LLM failure so callers can silently no-pin.

const TOKEN_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi

function renderStepPrompt(
  prompt: string,
  params: Record<string, string>,
  priorOutput: RunOutput | null,
): string {
  const subbed = prompt.replace(TOKEN_RE, (_, key: string) => {
    const v = params[key]
    return v == null ? `[missing:${key}]` : v
  })
  if (!priorOutput) return subbed
  const preface = [
    '--- PREVIOUS STEP OUTPUT (use as context, do not repeat verbatim) ---',
    `Headline: ${priorOutput.headline}`,
    `Summary: ${priorOutput.summary}`,
    ...priorOutput.findings.slice(0, 4).map((f) => `• ${f.title}: ${f.detail}`),
    '--- END PREVIOUS STEP ---',
    '',
  ].join('\n')
  return preface + subbed
}

const KIND_TOKENS: { kind: LiveHighlightPin['kind']; needles: RegExp[] }[] = [
  {
    kind: 'kpi_change',
    needles: [
      /\bkpi[_\s-]*change\b/i,
      /\bguidance\b/i,
      /\bguide\b/i,
      /\bcapex\b/i,
      /\b(margin|revenue|eps|ebitda|free\s*cash\s*flow|fcf)\b.*\b(raise|raised|cut|lower|update|upd|change)/i,
      /\b(raise[ds]?|cut|lower(ed)?)\b.*\b(guide|guidance|outlook|range|target)\b/i,
    ],
  },
  {
    kind: 'qa_standout',
    needles: [
      /\bqa[_\s-]*standout\b/i,
      /\bq&\s*a\b/i,
      /\banalyst\b/i,
      /\boff[- ]script\b/i,
      /\bpressed?\b/i,
      /\bchalleng/i,
    ],
  },
  {
    kind: 'management_commentary',
    needles: [
      /\bmanagement[_\s-]*commentary\b/i,
      /\b(ceo|cfo|coo|management|executive)\b/i,
      /\b(strategy|tone|disclosure|reframing|repositioning)\b/i,
      /\bcommentary\b/i,
    ],
  },
]

function parseKindFromOutput(out: RunOutput): LiveHighlightPin['kind'] | 'none' {
  const corpus = [
    out.headline,
    out.summary,
    ...out.findings.map((f) => `${f.title}: ${f.detail}`),
  ].join('\n')
  // 1. Strict "kind: X" pattern (the seeded classifier prompt asks for this).
  const m = corpus.match(/\bkind\s*[:=]\s*["']?(management_commentary|kpi_change|qa_standout|none)\b["']?/i)
  if (m) {
    const k = m[1].toLowerCase()
    return k === 'none' ? 'none' : (k as LiveHighlightPin['kind'])
  }
  const lower = corpus.toLowerCase()
  // 2. Explicit "not a highlight" / boilerplate indicators → none.
  if (
    /\b(not\s+(a\s+)?highlight|not\s+highlight\s*-?worthy|skip\b|filler\b|boilerplate\b|operator\s+intro|safe[- ]?harbor|forward[- ]looking\s+statement)\b/.test(
      lower,
    )
  ) {
    return 'none'
  }
  // 3. Heuristic keyword scan (most-specific kind first).
  for (const t of KIND_TOKENS) {
    if (t.needles.some((rx) => rx.test(corpus))) return t.kind
  }
  // 4. Default: not classified → no pin.
  return 'none'
}

interface BlueprintClassification {
  kind: LiveHighlightPin['kind'] | 'none'
  headline: string
  summary: string
}

async function runBlueprintForChunk(args: {
  blueprint: ResolvedBlueprint
  call: LiveCall
  chunk: LiveChunk
  clerkOrgId: string
}): Promise<BlueprintClassification | null> {
  const { blueprint, call, chunk, clerkOrgId } = args
  if (!blueprint.steps.length) return null

  const params: Record<string, string> = {
    ticker: call.symbol,
    event: call.event,
    chunk_text: chunk.text,
    speaker: `${chunk.speaker} (${chunk.role})`,
    timestamp_label: fmtTimestamp(chunk.startSec),
    paragraph: chunk.text,
    role: chunk.role,
  }

  let prior: RunOutput | null = null
  let kind: LiveHighlightPin['kind'] | 'none' | null = null
  let last: RunOutput | null = null

  for (let i = 0; i < blueprint.steps.length; i++) {
    const step = blueprint.steps[i]
    const rendered = renderStepPrompt(step.prompt, params, prior)
    let out: RunOutput
    try {
      out = await executeAgent({
        agentName: `${blueprint.name} · ${step.title}`,
        category: step.category || blueprint.category,
        templateSlug: blueprint.publishedSlug || null,
        instructions: rendered,
        tickers: [call.symbol],
        orgId: clerkOrgId,
      })
    } catch {
      return null
    }
    if (!out.ok) return null

    // Classifier verdict comes from the first step. If the model says "none"
    // we short-circuit and don't burn tokens on the summarize step.
    if (i === 0) {
      kind = parseKindFromOutput(out)
      if (kind === 'none') return { kind: 'none', headline: '', summary: '' }
    }
    prior = out
    last = out
  }

  if (!last) return null
  // Use the classifier's verdict if it produced one, otherwise re-parse from
  // the final step (covers single-step Blueprints where classify and summary
  // are the same step).
  const finalKind: LiveHighlightPin['kind'] | 'none' = kind ?? parseKindFromOutput(last)
  if (finalKind === 'none') return { kind: 'none', headline: '', summary: '' }

  return {
    kind: finalKind,
    headline: last.headline.slice(0, 200) || `Highlight from ${call.symbol}`,
    summary: last.summary,
  }
}

// ── Pin composition ─────────────────────────────────────────────────────────
const KIND_LABEL: Record<LiveHighlightPin['kind'], string> = {
  management_commentary: 'Management commentary',
  kpi_change: 'KPI change',
  qa_standout: 'Q&A standout',
}

function buildNoteBody(args: {
  chunk: LiveChunk
  call: LiveCall
  kind: LiveHighlightPin['kind']
  headline: string
  summary: string
  alignment: 'estimated' | 'aligned'
  blueprintId: string | null
  blueprintVersion: number | null
  blueprintName: string | null
  runId: string | null
}): string {
  const {
    chunk,
    call,
    kind,
    headline,
    summary,
    alignment,
    blueprintId,
    blueprintVersion,
    blueprintName,
    runId,
  } = args
  const ts = fmtTimestamp(chunk.startSec)
  const meta = {
    kind: 'live-highlight',
    moment: kind,
    symbol: call.symbol,
    event: call.event,
    callKey: callKey(call),
    chunkIdx: chunk.idx,
    speaker: chunk.speaker,
    role: chunk.role,
    startSec: chunk.startSec,
    alignment,
    blueprintId,
    blueprintVersion,
    blueprintName,
    runId,
  }
  const attribution = blueprintId && blueprintName
    ? `Pinned by Blueprint: ${blueprintName} v${blueprintVersion ?? '?'}`
    : 'Pinned by Live Highlights engine'
  return [
    `**${KIND_LABEL[kind]} — ${headline}**`,
    '',
    summary,
    '',
    `> "${chunk.text}"`,
    `> — ${chunk.speaker} (${chunk.role})`,
    '',
    `**Citation:** ${call.symbol} ${call.event} · ${chunk.speaker} @ ${ts} (${alignment})`,
    attribution,
    '',
    `<!-- finsyt:live-highlight ${JSON.stringify(meta)} -->`,
  ].join('\n')
}

// ── Tick ────────────────────────────────────────────────────────────────────
export interface TickArgs {
  orgId: string         // Clerk org id
  userId: string
  watchlist: string[]
}

export interface TickResult {
  enabled: boolean
  monitoredSymbols: string[]
  activeCalls: { symbol: string; event: string; callKey: string; startedAt: string; ended: boolean }[]
  newPins: LiveHighlightPin[]
  newNotifications: LiveHighlightNotification[]
}

export async function tickLiveHighlights(args: TickArgs): Promise<TickResult> {
  const settings = await getLiveHighlightsSettings(args.orgId)
  if (!settings.enabled) {
    return { enabled: false, monitoredSymbols: [], activeCalls: [], newPins: [], newNotifications: [] }
  }

  const monitor = monitorSet(args.watchlist, settings)
  const monitoredSymbols = Array.from(monitor)

  const live = liveSelection().filter((c) => monitor.has(c.symbol.toUpperCase()))
  const newPins: LiveHighlightPin[] = []
  const newNotifs: LiveHighlightNotification[] = []
  const activeCalls: TickResult['activeCalls'] = []

  if (live.length === 0) {
    return { enabled: true, monitoredSymbols, activeCalls, newPins, newNotifications: [] }
  }

  // Resolve org-local UUID once per tick (cached in resolver after first call).
  let localOrgId: string | null = null
  try {
    localOrgId = await resolveLocalOrgId(args.orgId)
  } catch {
    // No DB → cannot pin. Still report active calls so UI can show monitoring.
    for (const call of live) {
      activeCalls.push({
        symbol: call.symbol,
        event: call.event,
        callKey: callKey(call),
        startedAt: call.startedAt,
        ended: callHasEnded(call),
      })
    }
    return { enabled: true, monitoredSymbols, activeCalls, newPins, newNotifications: [] }
  }

  const blueprint = await resolveBlueprintForOrg(args.orgId, settings)

  for (const call of live) {
    const key = callKey(call)
    const ended = callHasEnded(call)
    activeCalls.push({
      symbol: call.symbol,
      event: call.event,
      callKey: key,
      startedAt: call.startedAt,
      ended,
    })

    // Upsert the per-call cursor row, returning the current state. Reading
    // from the persisted row (instead of an in-memory `STATE` map) is the
    // whole point of this layer — after a restart we resume from exactly
    // the lastChunkIdx we left off at, so chunks already in
    // `live_highlights_pins` are never re-considered.
    let perCall = await ensureCallRow({
      clerkOrgId: args.orgId,
      call,
    })
    if (!perCall) continue

    // Open the per-call Blueprint run row on first sight of this call so
    // every pin we generate (and every audit row) carries the same runId.
    if (!perCall.runId && blueprint) {
      const runId = await openCallRun({
        clerkOrgId: args.orgId,
        userId: args.userId,
        call,
        blueprint,
      })
      if (runId) {
        await withComplianceContext(args.orgId, (tx) =>
          tx
            .update(liveHighlightsCallsTable)
            .set({ runId, updatedAt: new Date() })
            .where(
              and(
                eq(liveHighlightsCallsTable.orgId, args.orgId),
                eq(liveHighlightsCallsTable.callKey, key),
              ),
            ),
        )
        perCall = { ...perCall, runId }
      }
    }

    const revealed = chunksRevealedAt(call)
    let highestProcessedIdx = perCall.lastChunkIdx
    let firstPinNotified = perCall.firstPinNotified
    let totalPinnedForCall = await countPinsForCall(args.orgId, key)

    for (const chunk of revealed) {
      if (chunk.idx <= perCall.lastChunkIdx) continue
      // Track the high-water mark so we can persist a single cursor advance
      // after the loop (instead of one update per chunk). The atomic insert
      // in `pinChunk` is the authoritative duplicate-pin guard, so we don't
      // need an in-memory `pinnedChunkIdxs` set, and we deliberately do NOT
      // filter on the seed script's `chunk.kind === 'none'` here so the
      // Blueprint's classify step can override and pin chunks the seed
      // marked as non-highlights.
      highestProcessedIdx = Math.max(highestProcessedIdx, chunk.idx)

      // Drive moment selection from the resolved Blueprint, not the seed
      // script's pre-baked `chunk.kind`. The Blueprint's classify step decides
      // whether the chunk is highlight-worthy and which kind it is; the
      // summarize step writes the pinned headline + summary. A null result
      // (no Blueprint resolved, or any LLM/parse failure) is silently skipped
      // so a flaky provider never surfaces as a user-facing error.
      if (!blueprint) continue
      const verdict = await runBlueprintForChunk({
        blueprint,
        call,
        chunk,
        clerkOrgId: args.orgId,
      })
      if (!verdict || verdict.kind === 'none') continue

      const pin = await pinChunk({
        localOrgId,
        clerkOrgId: args.orgId,
        userId: args.userId,
        call,
        chunk,
        kind: verdict.kind,
        headline: verdict.headline,
        summary: verdict.summary,
        blueprintId: blueprint.id,
        blueprintVersion: blueprint.version,
        blueprintName: blueprint.name,
        runId: perCall.runId,
      })
      if (!pin) continue

      newPins.push(pin)
      totalPinnedForCall += 1

      if (!firstPinNotified) {
        firstPinNotified = true
        const notif = await upsertNotification(args.orgId, {
          id: `${key}:first:${pin.noteId}`,
          kind: 'first_pin',
          symbol: call.symbol,
          event: call.event,
          callKey: key,
          message: `First live highlight pinned for ${call.symbol} — "${pin.headline}"`,
          noteId: pin.noteId,
          pinCount: null,
        })
        if (notif) newNotifs.push(notif)
      }
    }

    // Persist cursor advance + flag changes opportunistically. The pins
    // table PK is the authoritative duplicate-pin guard, so this update is
    // purely an optimisation to skip already-considered chunks faster.
    if (
      highestProcessedIdx !== perCall.lastChunkIdx ||
      ended !== perCall.ended ||
      firstPinNotified !== perCall.firstPinNotified
    ) {
      await withComplianceContext(args.orgId, (tx) =>
        tx
          .update(liveHighlightsCallsTable)
          .set({
            lastChunkIdx: highestProcessedIdx,
            ended,
            firstPinNotified,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(liveHighlightsCallsTable.orgId, args.orgId),
              eq(liveHighlightsCallsTable.callKey, key),
            ),
          ),
      )
      perCall = { ...perCall, lastChunkIdx: highestProcessedIdx, ended, firstPinNotified }
    }

    if (ended && !perCall.endRollupNotified && totalPinnedForCall > 0) {
      const notif = await upsertNotification(args.orgId, {
        id: `${key}:end`,
        kind: 'end_of_call',
        symbol: call.symbol,
        event: call.event,
        callKey: key,
        message: `${call.symbol} ${call.event} ended — ${totalPinnedForCall} highlight${totalPinnedForCall === 1 ? '' : 's'} pinned`,
        noteId: null,
        pinCount: totalPinnedForCall,
      })
      if (notif) {
        newNotifs.push(notif)
        await withComplianceContext(args.orgId, (tx) =>
          tx
            .update(liveHighlightsCallsTable)
            .set({ endRollupNotified: true, updatedAt: new Date() })
            .where(
              and(
                eq(liveHighlightsCallsTable.orgId, args.orgId),
                eq(liveHighlightsCallsTable.callKey, key),
              ),
            ),
        )
        perCall = { ...perCall, endRollupNotified: true }
      }
    }

    if (ended && !perCall.alignmentSwapped && totalPinnedForCall > 0) {
      const noteIds = await listPinNoteIdsForCall(args.orgId, key)
      if (noteIds.length) {
        await swapAlignmentForCall({
          clerkOrgId: args.orgId,
          localOrgId,
          call,
          noteIds,
        })
        await withComplianceContext(args.orgId, (tx) =>
          tx
            .update(liveHighlightsCallsTable)
            .set({ alignmentSwapped: true, updatedAt: new Date() })
            .where(
              and(
                eq(liveHighlightsCallsTable.orgId, args.orgId),
                eq(liveHighlightsCallsTable.callKey, key),
              ),
            ),
        )
        perCall = { ...perCall, alignmentSwapped: true }
      }
    }

    if (ended && !perCall.runClosed && perCall.runId) {
      const firstPinNoteId = (await listPinNoteIdsForCall(args.orgId, key))[0] ?? null
      await closeCallRun({
        clerkOrgId: args.orgId,
        runId: perCall.runId,
        pinCount: totalPinnedForCall,
        firstPinNoteId,
      })
      await withComplianceContext(args.orgId, (tx) =>
        tx
          .update(liveHighlightsCallsTable)
          .set({ runClosed: true, updatedAt: new Date() })
          .where(
            and(
              eq(liveHighlightsCallsTable.orgId, args.orgId),
              eq(liveHighlightsCallsTable.callKey, key),
            ),
          ),
      )
    }
  }

  // External delivery (email + Slack) for any notification newly produced
  // this tick. We deliberately do this *after* the pin loop so a slow
  // outbound call (e.g. a flaky Slack endpoint) can't delay subsequent
  // chunk processing. Each delivery is best-effort and audits its own
  // outcome; failures are surfaced in `LiveHighlightNotification.deliveredChannels`
  // (which always contains at least `'bell'`).
  if (newNotifs.length > 0) {
    const wantEmail = settings.deliveryChannels.email
    const wantSlack = settings.deliveryChannels.slack
    if (wantEmail || wantSlack) {
      const recipients = wantEmail
        ? await resolveOrgEmailRecipients(args.orgId, settings)
        : []
      for (const notif of newNotifs) {
        try {
          const { deliverLiveHighlightNotification } = await import('./live-highlights-delivery')
          const result = await deliverLiveHighlightNotification({
            orgId: args.orgId,
            userId: args.userId,
            notif,
            settings,
            resolvedRecipients: recipients,
          })
          notif.deliveredChannels = result.deliveredChannels
        } catch {
          notif.deliveredChannels = ['bell']
        }
      }
    } else {
      // Bell-only path still records the channel set on the notification so
      // the UI and audit story is uniform.
      for (const notif of newNotifs) notif.deliveredChannels = ['bell']
    }
  }

  return {
    enabled: true,
    monitoredSymbols,
    activeCalls,
    newPins,
    newNotifications: newNotifs,
  }
}

// ── Recipient resolution ───────────────────────────────────────────────────
// Email fan-out prefers explicit per-org recipients (operators can pin a
// shared distribution list) but falls back to the Clerk organization's
// member emails so a freshly-onboarded workspace doesn't have to fill in
// the recipient list before email delivery starts working.
async function resolveOrgEmailRecipients(
  clerkOrgId: string,
  settings: LiveHighlightsSettings,
): Promise<string[]> {
  if (settings.emailRecipients.length > 0) return [...settings.emailRecipients]
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const client = await clerkClient()
    const memberships = await client.organizations.getOrganizationMembershipList({
      organizationId: clerkOrgId,
      limit: 100,
    })
    const out: string[] = []
    for (const m of memberships.data ?? []) {
      const id = m.publicUserData?.identifier
      if (id && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) out.push(id)
    }
    return out
  } catch {
    return []
  }
}

// ── Per-call row helpers ────────────────────────────────────────────────────
interface PerCallRow {
  lastChunkIdx: number
  ended: boolean
  firstPinNotified: boolean
  endRollupNotified: boolean
  alignmentSwapped: boolean
  runId: string | null
  runClosed: boolean
}

async function ensureCallRow(args: {
  clerkOrgId: string
  call: LiveCall
}): Promise<PerCallRow | null> {
  const { clerkOrgId, call } = args
  const key = callKey(call)
  try {
    await withComplianceContext(clerkOrgId, (tx) =>
      tx
        .insert(liveHighlightsCallsTable)
        .values({
          orgId: clerkOrgId,
          callKey: key,
          symbol: call.symbol,
          event: call.event,
          startedAt: new Date(call.startedAt),
        })
        .onConflictDoNothing(),
    )
    const [row] = await withComplianceContext(clerkOrgId, (tx) =>
      tx
        .select({
          lastChunkIdx: liveHighlightsCallsTable.lastChunkIdx,
          ended: liveHighlightsCallsTable.ended,
          firstPinNotified: liveHighlightsCallsTable.firstPinNotified,
          endRollupNotified: liveHighlightsCallsTable.endRollupNotified,
          alignmentSwapped: liveHighlightsCallsTable.alignmentSwapped,
          runId: liveHighlightsCallsTable.runId,
          runClosed: liveHighlightsCallsTable.runClosed,
        })
        .from(liveHighlightsCallsTable)
        .where(
          and(
            eq(liveHighlightsCallsTable.orgId, clerkOrgId),
            eq(liveHighlightsCallsTable.callKey, key),
          ),
        )
        .limit(1),
    )
    return row ?? null
  } catch {
    return null
  }
}

async function countPinsForCall(orgId: string, callKeyValue: string): Promise<number> {
  try {
    const [row] = await withComplianceContext(orgId, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(liveHighlightsPinsTable)
        .where(
          and(
            eq(liveHighlightsPinsTable.orgId, orgId),
            eq(liveHighlightsPinsTable.callKey, callKeyValue),
          ),
        ),
    )
    return Number(row?.n ?? 0)
  } catch {
    return 0
  }
}

async function listPinNoteIdsForCall(orgId: string, callKeyValue: string): Promise<string[]> {
  try {
    const rows = await withComplianceContext(orgId, (tx) =>
      tx
        .select({ noteId: liveHighlightsPinsTable.noteId })
        .from(liveHighlightsPinsTable)
        .where(
          and(
            eq(liveHighlightsPinsTable.orgId, orgId),
            eq(liveHighlightsPinsTable.callKey, callKeyValue),
          ),
        )
        .orderBy(liveHighlightsPinsTable.chunkIdx),
    )
    return rows.map((r) => r.noteId)
  } catch {
    return []
  }
}

// ── Pin write ───────────────────────────────────────────────────────────────
async function pinChunk(args: {
  localOrgId: string
  clerkOrgId: string
  userId: string
  call: LiveCall
  chunk: LiveChunk
  /** LLM-derived classification + headline + summary from the resolved Blueprint. */
  kind: LiveHighlightPin['kind']
  headline: string
  summary: string
  blueprintId: string | null
  blueprintVersion: number | null
  blueprintName: string | null
  runId: string | null
}): Promise<LiveHighlightPin | null> {
  const {
    localOrgId,
    clerkOrgId,
    userId,
    call,
    chunk,
    kind,
    headline,
    summary,
    blueprintId,
    blueprintVersion,
    blueprintName,
    runId,
  } = args
  const alignment: 'estimated' | 'aligned' = 'estimated'
  const key = callKey(call)
  const preAllocatedNoteId = randomUUID()

  // Step 1 — atomically claim the chunk in `live_highlights_pins`. The
  // composite PK (org_id, call_key, chunk_idx) makes this the single source
  // of truth for "have we pinned this chunk?", which is what survives a
  // restart and prevents duplicate notes after the in-memory cursor is gone.
  let claimed: { noteId: string } | null = null
  try {
    const inserted = await withComplianceContext(clerkOrgId, (tx) =>
      tx
        .insert(liveHighlightsPinsTable)
        .values({
          orgId: clerkOrgId,
          callKey: key,
          chunkIdx: chunk.idx,
          noteId: preAllocatedNoteId,
          alignment,
          blueprintId,
          blueprintVersion,
        })
        .onConflictDoNothing()
        .returning({ noteId: liveHighlightsPinsTable.noteId }),
    )
    if (inserted.length) claimed = { noteId: inserted[0].noteId }
  } catch {
    return null
  }
  if (!claimed) return null  // already pinned (or racing) — skip cleanly

  // Build the note body and title from the LLM-derived classification rather
  // than the seed script's pre-baked `chunk.kind`/`chunk.headline` so the
  // user-facing note matches the Blueprint's verdict end-to-end.
  const body = buildNoteBody({
    chunk,
    call,
    kind,
    headline,
    summary,
    alignment,
    blueprintId,
    blueprintVersion,
    blueprintName,
    runId,
  })
  const title = `[${call.symbol}] LIVE: ${KIND_LABEL[kind]} — ${headline}`.slice(0, 200)

  // Step 2 — write the user-visible research note with the pre-allocated
  // id so the pin row's `note_id` matches a real row. If this fails, roll
  // back the pin claim so a future tick can retry the chunk.
  try {
    await withOrgContext(localOrgId, (tx) =>
      tx
        .insert(researchNotesTable)
        .values({ id: preAllocatedNoteId, orgId: localOrgId, authorUserId: userId, title, body }),
    )
  } catch {
    try {
      await withComplianceContext(clerkOrgId, (tx) =>
        tx
          .delete(liveHighlightsPinsTable)
          .where(
            and(
              eq(liveHighlightsPinsTable.orgId, clerkOrgId),
              eq(liveHighlightsPinsTable.callKey, key),
              eq(liveHighlightsPinsTable.chunkIdx, chunk.idx),
            ),
          ),
      )
    } catch {
      /* swallow */
    }
    return null
  }

  // Audit log — best-effort, fully attributed to the published Blueprint
  // *and* the per-call blueprint_runs row.
  try {
    await audit.log({
      orgId: clerkOrgId,
      actorId: userId,
      actorType: 'system',
      action: 'live_highlight.pinned',
      resourceType: 'research_note',
      resourceId: preAllocatedNoteId,
      metadata: {
        symbol: call.symbol,
        event: call.event,
        callKey: key,
        chunkIdx: chunk.idx,
        moment: kind,
        speaker: chunk.speaker,
        role: chunk.role,
        startSec: chunk.startSec,
        alignment,
        blueprintId,
        blueprintVersion,
        runId,
      },
    })
  } catch {
    /* swallow */
  }

  return {
    noteId: preAllocatedNoteId,
    callKey: key,
    symbol: call.symbol,
    event: call.event,
    speaker: chunk.speaker,
    role: chunk.role,
    kind,
    headline,
    summary,
    startSec: chunk.startSec,
    timestampLabel: fmtTimestamp(chunk.startSec),
    pinnedAt: Date.now(),
    alignment,
    blueprintId,
    blueprintVersion,
    runId,
  }
}

// ── Notification upsert ─────────────────────────────────────────────────────
// The id is deterministic for both kinds (`${callKey}:first:${noteId}` and
// `${callKey}:end`), so re-emitting after restart is a no-op via ON CONFLICT.
export async function upsertNotification(orgId: string, n: {
  id: string
  kind: LiveHighlightNotification['kind']
  symbol: string
  event: string
  callKey: string
  message: string
  noteId: string | null
  pinCount: number | null
}): Promise<LiveHighlightNotification | null> {
  try {
    const [row] = await withComplianceContext(orgId, (tx) =>
      tx
        .insert(liveHighlightsNotificationsTable)
        .values({
          id: n.id,
          orgId,
          kind: n.kind,
          symbol: n.symbol,
          event: n.event,
          callKey: n.callKey,
          message: n.message,
          noteId: n.noteId,
          pinCount: n.pinCount,
        })
        .onConflictDoNothing()
        .returning(),
    )
    if (!row) return null
    return rowToNotification(row)
  } catch {
    return null
  }
}

// ── Filing-signal highlight ─────────────────────────────────────────────────
// A scored SEC filing the filing-signal watcher decided is worth surfacing.
export interface ScoredFiling {
  accession: string
  symbol: string
  formType: string | null
  score: number
  filedAt: string | null
  attribution: string
  materialSections: string[]
}

export interface RecordFilingSignalResult {
  pinned: boolean
  noteId: string | null
  notification: LiveHighlightNotification | null
}

// Build the user-visible research-note body for a high-signal filing. Mirrors
// `buildNoteBody`'s inline `finsyt:` metadata marker so the citation tracer and
// Drawer can attribute the pin back to the SEC filing it came from.
function buildFilingNoteBody(filing: ScoredFiling): string {
  const meta = {
    kind: 'filing-signal',
    symbol: filing.symbol,
    accession: filing.accession,
    formType: filing.formType,
    score: filing.score,
    filedAt: filing.filedAt,
  }
  const sections = filing.materialSections.length
    ? filing.materialSections.map((s) => `- ${s}`).join('\n')
    : '- (no material sections returned)'
  const filed = filing.filedAt ? ` · filed ${filing.filedAt}` : ''
  return [
    `**High AI signal — ${filing.symbol} ${filing.formType ?? 'SEC filing'} (score ${filing.score}/100)**`,
    '',
    `An automated scan flagged this filing as high-signal (${filing.score}/100).`,
    '',
    '**Material sections**',
    sections,
    '',
    `**Citation:** ${filing.symbol} ${filing.formType ?? 'SEC filing'} · accession ${filing.accession}${filed}`,
    filing.attribution,
    '',
    `<!-- finsyt:filing-signal ${JSON.stringify(meta)} -->`,
  ].join('\n')
}

/**
 * Pin a Live Highlight + fire the bell/email/Slack alert for a single
 * high-signal SEC filing, exactly once per (org, accession).
 *
 * The dedup claim against `live_highlights_filing_signals` is the source of
 * truth — its composite PK makes a concurrent or repeat tick a clean no-op so
 * we never double-pin or double-page for the same document. Delivery reuses the
 * same `deliverLiveHighlightNotification` path as the live-call engine so the
 * email/Slack story stays uniform across notification kinds.
 */
export async function recordFilingSignalHighlight(args: {
  clerkOrgId: string
  userId: string
  settings: LiveHighlightsSettings
  filing: ScoredFiling
}): Promise<RecordFilingSignalResult> {
  const { clerkOrgId, userId, settings, filing } = args
  const empty: RecordFilingSignalResult = { pinned: false, noteId: null, notification: null }

  // Step 1 — atomically claim the filing. A returned row means *we* won the
  // claim; no row means a prior tick already handled it → clean no-op.
  let claimed = false
  try {
    const inserted = await withComplianceContext(clerkOrgId, (tx) =>
      tx
        .insert(liveHighlightsFilingSignalsTable)
        .values({
          orgId: clerkOrgId,
          accession: filing.accession,
          symbol: filing.symbol,
          formType: filing.formType,
          score: filing.score,
        })
        .onConflictDoNothing()
        .returning({ accession: liveHighlightsFilingSignalsTable.accession }),
    )
    claimed = inserted.length > 0
  } catch {
    return empty
  }
  if (!claimed) return empty

  // Step 2 — write the user-visible research note under the local org id.
  let localOrgId: string
  try {
    localOrgId = await resolveLocalOrgId(clerkOrgId)
  } catch {
    return empty
  }
  const noteId = randomUUID()
  const title = `[${filing.symbol}] FILING: ${filing.formType ?? 'SEC filing'} — AI signal ${filing.score}/100`.slice(0, 200)
  const body = buildFilingNoteBody(filing)
  try {
    await withOrgContext(localOrgId, (tx) =>
      tx
        .insert(researchNotesTable)
        .values({ id: noteId, orgId: localOrgId, authorUserId: userId, title, body }),
    )
  } catch {
    // Roll back the dedup claim so a later tick can retry the whole flow.
    try {
      await withComplianceContext(clerkOrgId, (tx) =>
        tx
          .delete(liveHighlightsFilingSignalsTable)
          .where(
            and(
              eq(liveHighlightsFilingSignalsTable.orgId, clerkOrgId),
              eq(liveHighlightsFilingSignalsTable.accession, filing.accession),
            ),
          ),
      )
    } catch {
      /* swallow */
    }
    return empty
  }

  // Record the note id on the dedup row for traceability (best-effort).
  try {
    await withComplianceContext(clerkOrgId, (tx) =>
      tx
        .update(liveHighlightsFilingSignalsTable)
        .set({ noteId })
        .where(
          and(
            eq(liveHighlightsFilingSignalsTable.orgId, clerkOrgId),
            eq(liveHighlightsFilingSignalsTable.accession, filing.accession),
          ),
        ),
    )
  } catch {
    /* swallow */
  }

  // Step 3 — bell notification. The id is deterministic so a stray re-run
  // (e.g. note written but notif insert retried) is a no-op via ON CONFLICT.
  const event = filing.formType ?? 'SEC Filing'
  const message = `${filing.symbol} ${event} scored ${filing.score}/100 on the AI signal (threshold ${settings.filingScoreThreshold}).`
  const notif = await upsertNotification(clerkOrgId, {
    id: `filing:${clerkOrgId}:${filing.accession}`,
    kind: 'filing_signal',
    symbol: filing.symbol,
    event,
    callKey: `filing:${filing.accession}`,
    message,
    noteId,
    pinCount: null,
  })

  // Step 4 — external fan-out (email + Slack), best-effort, mirroring the
  // live-call engine's delivery path.
  if (notif) {
    const wantEmail = settings.deliveryChannels.email
    const wantSlack = settings.deliveryChannels.slack
    if (wantEmail || wantSlack) {
      try {
        const recipients = wantEmail
          ? await resolveOrgEmailRecipients(clerkOrgId, settings)
          : []
        const { deliverLiveHighlightNotification } = await import('./live-highlights-delivery')
        const result = await deliverLiveHighlightNotification({
          orgId: clerkOrgId,
          userId,
          notif,
          settings,
          resolvedRecipients: recipients,
        })
        notif.deliveredChannels = result.deliveredChannels
      } catch {
        notif.deliveredChannels = ['bell']
      }
    } else {
      notif.deliveredChannels = ['bell']
    }
  }

  // Step 5 — audit, fully attributed to the filing.
  try {
    await audit.log({
      orgId: clerkOrgId,
      actorId: userId,
      actorType: 'system',
      action: 'live_highlight.filing_signal',
      resourceType: 'research_note',
      resourceId: noteId,
      metadata: {
        symbol: filing.symbol,
        formType: filing.formType,
        accession: filing.accession,
        score: filing.score,
        threshold: settings.filingScoreThreshold,
        deliveredChannels: notif?.deliveredChannels ?? ['bell'],
      },
    })
  } catch {
    /* swallow */
  }

  return { pinned: true, noteId, notification: notif }
}

// ── Alignment swap ──────────────────────────────────────────────────────────
async function swapAlignmentForCall(args: {
  clerkOrgId: string
  localOrgId: string
  call: LiveCall
  noteIds: string[]
}): Promise<void> {
  const { clerkOrgId, localOrgId, call, noteIds } = args
  if (!noteIds.length) return
  const key = callKey(call)
  try {
    await withOrgContext(localOrgId, async (tx) => {
      for (const id of noteIds) {
        const [row] = await tx
          .select({ body: researchNotesTable.body })
          .from(researchNotesTable)
          .where(
            and(
              eq(researchNotesTable.id, id),
              eq(researchNotesTable.orgId, localOrgId),
            ),
          )
          .limit(1)
        if (!row) continue
        const newBody = (row.body || '')
          .replace(/\(estimated\)/g, '(aligned)')
          .replace(/"alignment":"estimated"/g, '"alignment":"aligned"')
        if (newBody === row.body) continue
        await tx
          .update(researchNotesTable)
          .set({ body: newBody })
          .where(
            and(
              eq(researchNotesTable.id, id),
              eq(researchNotesTable.orgId, localOrgId),
            ),
          )
      }
    })
    // Mirror the alignment swap onto the pin rows so getRecentPins reflects
    // the new state across restarts (pins are reconstructed from the row's
    // `alignment` column).
    await withComplianceContext(clerkOrgId, (tx) =>
      tx
        .update(liveHighlightsPinsTable)
        .set({ alignment: 'aligned' })
        .where(
          and(
            eq(liveHighlightsPinsTable.orgId, clerkOrgId),
            eq(liveHighlightsPinsTable.callKey, key),
          ),
        ),
    )
  } catch {
    /* best-effort */
  }
}

// ── Per-call Blueprint run row ──────────────────────────────────────────────
async function openCallRun(args: {
  clerkOrgId: string
  userId: string
  call: LiveCall
  blueprint: ResolvedBlueprint
}): Promise<string | null> {
  const { clerkOrgId, userId, call, blueprint } = args
  try {
    const [row] = await withClerkContext(clerkOrgId, userId, (tx) =>
      tx
        .insert(blueprintRunsTable)
        .values({
          orgId: clerkOrgId,
          blueprintId: blueprint.id,
          blueprintVersion: blueprint.version,
          blueprintName: blueprint.name,
          blueprintCategory: blueprint.category,
          blueprintIcon: blueprint.icon,
          triggeredBy: 'live-event',
          triggeredByUserId: userId,
          parameters: { symbol: call.symbol, event: call.event, callKey: callKey(call) },
          target: { kind: 'live_call', symbol: call.symbol, event: call.event, startedAt: call.startedAt },
          runStatus: 'running',
          stepResults: [],
          sources: [],
        })
        .returning({ id: blueprintRunsTable.id }),
    )
    return row?.id ?? null
  } catch {
    return null
  }
}

async function closeCallRun(args: {
  clerkOrgId: string
  runId: string
  pinCount: number
  firstPinNoteId: string | null
}): Promise<void> {
  const { clerkOrgId, runId, pinCount, firstPinNoteId } = args
  try {
    await withClerkContext(clerkOrgId, BLUEPRINT_RUN_SYSTEM_USER, (tx) =>
      tx
        .update(blueprintRunsTable)
        .set({
          runStatus: 'ok',
          completedAt: new Date(),
          pinnedNoteId: firstPinNoteId,
          stepResults: [
            { name: 'monitor', status: 'ok', detail: `${pinCount} highlight${pinCount === 1 ? '' : 's'} pinned` },
          ],
          finalOutput: { pinCount },
        })
        .where(
          and(
            eq(blueprintRunsTable.id, runId),
            eq(blueprintRunsTable.orgId, clerkOrgId),
          ),
        ),
    )
  } catch {
    /* best-effort */
  }
}

const BLUEPRINT_RUN_SYSTEM_USER = 'user_finsyt_live_highlights_system'

// ── Notebook companion: list saved highlight notes for a symbol ─────────────
export async function listPinnedHighlightsForSymbol(
  orgId: string,
  symbol: string,
  limit = 50,
): Promise<{ id: string; title: string; body: string; createdAt: number }[]> {
  const localOrgId = await resolveLocalOrgId(orgId)
  const rows = await withOrgContext(localOrgId, (tx) =>
    tx
      .select({
        id: researchNotesTable.id,
        title: researchNotesTable.title,
        body: researchNotesTable.body,
        createdAt: researchNotesTable.createdAt,
      })
      .from(researchNotesTable)
      .where(
        and(
          eq(researchNotesTable.orgId, localOrgId),
          like(researchNotesTable.title, `[${symbol}] LIVE: %`),
        ),
      )
      .orderBy(sql`${researchNotesTable.createdAt} DESC`)
      .limit(limit),
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    createdAt: r.createdAt.getTime(),
  }))
}

// Re-export the published row helpers for the settings UI dropdown.
export type { BlueprintRow }
