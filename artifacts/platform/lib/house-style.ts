/**
 * Org-level house-style engine.
 * ─────────────────────────────
 * One persisted config per Clerk org (table `house_style`, RLS-isolated by
 * `app.current_clerk_org_id`). The config captures a desk's presentation
 * conventions — brand palette, fonts, number formatting, preferred
 * terminology, and reusable prompts — so every deck / model / memo / matrix
 * export the platform generates comes out in the firm's voice instead of the
 * generic Finsyt defaults.
 *
 * This module is the single source of truth for:
 *   - the `HouseStyleConfig` shape + validation/normalisation,
 *   - load / update against Postgres (Clerk-org-scoped),
 *   - the pure "apply" helpers used by the PPTX generators
 *     (`applyHouseStyleToBrand`, `formatNumberWithHouseStyle`,
 *      `applyTerminology`) and by the verification engine.
 *
 * The apply helpers are pure (no DB / network) so the verification engine and
 * unit tests can exercise them directly.
 */
import { withClerkContext, houseStyleTable } from '@workspace/db'
import { eq } from 'drizzle-orm'

// ── Config shape ─────────────────────────────────────────────────────────────

export type NegativeStyle = 'parentheses' | 'minus'

export interface HouseStyleNumberFormat {
  /** Decimals for plain numbers / multiples (e.g. `12.3x`). */
  decimals: number
  /** Decimals for percentages. */
  percentDecimals: number
  /** Insert thousands separators (`1,234`). */
  thousandsSeparator: boolean
  /** Currency glyph prefixed to monetary values. */
  currencySymbol: string
  /** How negatives render: `(1.2)` vs `-1.2`. */
  negativeStyle: NegativeStyle
}

export interface HouseStyleBrand {
  /** Header / table-head fill. 6-char hex, no leading `#`. */
  navy: string
  /** Primary accent (links, key figures). */
  accent: string
  /** Positive deltas. */
  positive: string
  /** Negative deltas. */
  negative: string
  /** Body ink. */
  ink: string
}

export interface TerminologyRule {
  /** Term to replace (case-insensitive, whole-word). */
  from: string
  /** Preferred replacement. */
  to: string
}

export interface ReusablePrompt {
  label: string
  prompt: string
}

export interface HouseStyleConfig {
  brand: HouseStyleBrand
  fontFace: string
  numberFormat: HouseStyleNumberFormat
  /** Preferred-terminology substitutions applied to generated prose. */
  terminology: TerminologyRule[]
  /** Words the desk does not want appearing in deliverables (flagged, not auto-removed). */
  bannedTerms: string[]
  /** Saved prompt snippets surfaced in the agent / blueprint composer. */
  reusablePrompts: ReusablePrompt[]
}

export interface HouseStyle {
  enabled: boolean
  config: HouseStyleConfig
  updatedByUserId: string | null
  updatedAt: string | null
}

// ── Defaults ─────────────────────────────────────────────────────────────────
// Mirrors the Finsyt platform brand (FINSYT_BRAND in deck-service.ts) so an org
// that has never configured a house style still gets a coherent, valid config.

export const DEFAULT_HOUSE_STYLE: HouseStyleConfig = {
  brand: {
    navy:     '0B1B3D',
    accent:   '4F7CFF',
    positive: '0EA371',
    negative: 'D9434E',
    ink:      '0E1A33',
  },
  fontFace: 'Inter',
  numberFormat: {
    decimals: 1,
    percentDecimals: 1,
    thousandsSeparator: true,
    currencySymbol: '$',
    negativeStyle: 'parentheses',
  },
  terminology: [],
  bannedTerms: [],
  reusablePrompts: [],
}

// ── Validation / normalisation ───────────────────────────────────────────────

const HEX6 = /^[0-9a-fA-F]{6}$/

function hex(input: unknown, fallback: string): string {
  if (typeof input !== 'string') return fallback
  const v = input.trim().replace(/^#/, '').toUpperCase()
  return HEX6.test(v) ? v : fallback
}

function clampInt(input: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

function str(input: unknown, max: number, fallback: string): string {
  if (typeof input !== 'string') return fallback
  const v = input.trim()
  return v.length ? v.slice(0, max) : fallback
}

function stringList(input: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(input)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const v = raw.trim().slice(0, maxLen)
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * Coerce an arbitrary (possibly partial, possibly hostile) JSON blob into a
 * fully-populated, valid `HouseStyleConfig`. Unknown keys are dropped; every
 * field falls back to the platform default. Pure + total — never throws.
 */
export function normalizeHouseStyleConfig(input: unknown): HouseStyleConfig {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const brandIn = (o.brand && typeof o.brand === 'object' ? o.brand : {}) as Record<string, unknown>
  const nfIn = (o.numberFormat && typeof o.numberFormat === 'object' ? o.numberFormat : {}) as Record<string, unknown>

  const terminology: TerminologyRule[] = Array.isArray(o.terminology)
    ? (o.terminology as unknown[])
        .map((r) => {
          const rr = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
          return { from: str(rr.from, 80, ''), to: str(rr.to, 80, '') }
        })
        .filter((r) => r.from.length > 0 && r.to.length > 0)
        .slice(0, 50)
    : []

  const reusablePrompts: ReusablePrompt[] = Array.isArray(o.reusablePrompts)
    ? (o.reusablePrompts as unknown[])
        .map((r) => {
          const rr = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
          return { label: str(rr.label, 120, ''), prompt: str(rr.prompt, 2000, '') }
        })
        .filter((r) => r.label.length > 0 && r.prompt.length > 0)
        .slice(0, 50)
    : []

  return {
    brand: {
      navy:     hex(brandIn.navy,     DEFAULT_HOUSE_STYLE.brand.navy),
      accent:   hex(brandIn.accent,   DEFAULT_HOUSE_STYLE.brand.accent),
      positive: hex(brandIn.positive, DEFAULT_HOUSE_STYLE.brand.positive),
      negative: hex(brandIn.negative, DEFAULT_HOUSE_STYLE.brand.negative),
      ink:      hex(brandIn.ink,      DEFAULT_HOUSE_STYLE.brand.ink),
    },
    fontFace: str(o.fontFace, 60, DEFAULT_HOUSE_STYLE.fontFace),
    numberFormat: {
      decimals:           clampInt(nfIn.decimals, 0, 6, DEFAULT_HOUSE_STYLE.numberFormat.decimals),
      percentDecimals:    clampInt(nfIn.percentDecimals, 0, 6, DEFAULT_HOUSE_STYLE.numberFormat.percentDecimals),
      thousandsSeparator: typeof nfIn.thousandsSeparator === 'boolean' ? nfIn.thousandsSeparator : DEFAULT_HOUSE_STYLE.numberFormat.thousandsSeparator,
      currencySymbol:     str(nfIn.currencySymbol, 4, DEFAULT_HOUSE_STYLE.numberFormat.currencySymbol),
      negativeStyle:      nfIn.negativeStyle === 'minus' ? 'minus' : 'parentheses',
    },
    terminology,
    bannedTerms: stringList(o.bannedTerms, 100, 80),
    reusablePrompts,
  }
}

// ── Apply helpers (pure) ─────────────────────────────────────────────────────

/**
 * Overlay the house-style palette onto a deck brand token bag. Only the five
 * configurable colors are overridden; derived tokens (accentDim, surface, …)
 * are left untouched so layout contrast is preserved.
 */
export function applyHouseStyleToBrand<T extends Record<string, string>>(
  brand: T,
  hs: HouseStyle | null,
): T {
  if (!hs || !hs.enabled) return brand
  const b = hs.config.brand
  return {
    ...brand,
    navy:     b.navy,
    ink:      b.ink,
    accent:   b.accent,
    positive: b.positive,
    negative: b.negative,
  }
}

/**
 * Parse a value string that the assemblers emit (`"$1234.5"`, `"12.3%"`,
 * `"-7.2x"`, `"1,234"`) into its components so it can be re-emitted in house
 * style. Returns null when the string isn't a recognisable single number.
 */
export function parseFormattedNumber(raw: string): {
  value: number
  currency: string | null
  percent: boolean
  multiple: boolean
  suffix: string
} | null {
  if (typeof raw !== 'string') return null
  let s = raw.trim()
  if (!s) return null
  let negative = false
  // Parenthesised negative.
  const paren = /^\((.*)\)$/.exec(s)
  if (paren) { negative = true; s = paren[1].trim() }
  let currency: string | null = null
  const curMatch = /^([$€£¥])\s?/.exec(s)
  if (curMatch) { currency = curMatch[1]; s = s.slice(curMatch[0].length) }
  if (s.startsWith('-')) { negative = true; s = s.slice(1).trim() }
  if (s.startsWith('+')) { s = s.slice(1).trim() }
  let percent = false
  let multiple = false
  let suffix = ''
  // Magnitude suffix (1.2B, 340M) — preserve verbatim.
  const magMatch = /([KkMmBbTt])$/.exec(s)
  if (s.endsWith('%')) { percent = true; s = s.slice(0, -1).trim() }
  else if (s.endsWith('x') || s.endsWith('X')) { multiple = true; s = s.slice(0, -1).trim() }
  else if (magMatch) { suffix = magMatch[1]; s = s.slice(0, -1).trim() }
  const digits = s.replace(/,/g, '')
  if (!/^\d+(\.\d+)?$/.test(digits)) return null
  const value = (negative ? -1 : 1) * Number(digits)
  if (!Number.isFinite(value)) return null
  return { value, currency, percent, multiple, suffix }
}

function groupThousands(intPart: string, on: boolean): string {
  if (!on) return intPart
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * Render a numeric value in the configured house style. Used both to format
 * fresh numbers and (via `reformatNumberToHouseStyle`) to auto-fix an existing
 * value string that deviates from the desk convention.
 */
export function formatNumberWithHouseStyle(
  value: number,
  nf: HouseStyleNumberFormat,
  opts: { currency?: string | null; percent?: boolean; multiple?: boolean; suffix?: string } = {},
): string {
  const decimals = opts.percent ? nf.percentDecimals : nf.decimals
  const negative = value < 0
  const abs = Math.abs(value)
  const fixed = abs.toFixed(decimals)
  const [intPart, fracPart] = fixed.split('.')
  let body = groupThousands(intPart, nf.thousandsSeparator)
  if (fracPart) body += `.${fracPart}`
  const currency = opts.currency ?? null
  let out = `${currency ?? ''}${body}${opts.suffix ?? ''}`
  if (opts.percent) out += '%'
  if (opts.multiple) out += 'x'
  if (negative) out = nf.negativeStyle === 'parentheses' ? `(${out})` : `-${out}`
  return out
}

/**
 * If `raw` parses as a single number that does NOT already match house style,
 * return the reformatted string; otherwise return null (already compliant or
 * not a number). Deterministic — this is the "safe auto-fix" the verification
 * engine offers for number-format issues.
 */
export function reformatNumberToHouseStyle(
  raw: string,
  nf: HouseStyleNumberFormat,
): string | null {
  const parsed = parseFormattedNumber(raw)
  if (!parsed) return null
  const fixed = formatNumberWithHouseStyle(parsed.value, nf, {
    currency: parsed.currency,
    percent: parsed.percent,
    multiple: parsed.multiple,
    suffix: parsed.suffix,
  })
  return fixed === raw.trim() ? null : fixed
}

/**
 * Apply preferred-terminology substitutions to a block of prose. Whole-word,
 * case-insensitive; preserves the leading capitalisation of the matched token.
 */
export function applyTerminology(text: string, rules: TerminologyRule[]): string {
  if (!text || rules.length === 0) return text
  let out = text
  for (const rule of rules) {
    if (!rule.from) continue
    const escaped = rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'gi')
    out = out.replace(re, (match) => {
      // Preserve title-case if the source token was capitalised.
      if (match[0] === match[0]?.toUpperCase() && rule.to.length > 0) {
        return rule.to[0].toUpperCase() + rule.to.slice(1)
      }
      return rule.to
    })
  }
  return out
}

/** Find banned terms present in a block of text (case-insensitive, whole-word). */
export function findBannedTerms(text: string, banned: string[]): string[] {
  if (!text || banned.length === 0) return []
  const hits: string[] = []
  for (const term of banned) {
    if (!term) continue
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`, 'i')
    if (re.test(text)) hits.push(term)
  }
  return hits
}

// ── Persistence (Clerk-org-scoped) ───────────────────────────────────────────

export function defaultHouseStyle(): HouseStyle {
  return {
    enabled: true,
    config: structuredClone(DEFAULT_HOUSE_STYLE),
    updatedByUserId: null,
    updatedAt: null,
  }
}

/**
 * Load the org's house style, or the platform default when none is saved.
 * Returns the default (never throws) on any read error so generators degrade
 * gracefully rather than failing an export.
 */
export async function getHouseStyle(orgId: string, userId: string): Promise<HouseStyle> {
  try {
    return await withClerkContext(orgId, userId, async (tx) => {
      const rows = await tx
        .select()
        .from(houseStyleTable)
        .where(eq(houseStyleTable.orgId, orgId))
        .limit(1)
      if (rows.length === 0) return defaultHouseStyle()
      const r = rows[0]
      return {
        enabled: r.enabled,
        config: normalizeHouseStyleConfig(r.config),
        updatedByUserId: r.updatedByUserId,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : (r.updatedAt as unknown as string ?? null),
      }
    })
  } catch {
    return defaultHouseStyle()
  }
}

export interface HouseStyleUpdate {
  enabled?: boolean
  config?: unknown
}

/**
 * Upsert the org's house style. `config` is fully normalised before write, so
 * a partial / hostile payload can never persist an invalid document. Returns
 * the stored value.
 */
export async function updateHouseStyle(
  orgId: string,
  userId: string,
  patch: HouseStyleUpdate,
): Promise<HouseStyle> {
  const current = await getHouseStyle(orgId, userId)
  const nextEnabled = typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled
  // Merge partial config onto the current document, then normalise the union.
  const merged = patch.config !== undefined
    ? mergeConfig(current.config, patch.config)
    : current.config
  const nextConfig = normalizeHouseStyleConfig(merged)

  return await withClerkContext(orgId, userId, async (tx) => {
    await tx
      .insert(houseStyleTable)
      .values({
        orgId,
        enabled: nextEnabled,
        config: nextConfig,
        updatedByUserId: userId,
      })
      .onConflictDoUpdate({
        target: houseStyleTable.orgId,
        set: {
          enabled: nextEnabled,
          config: nextConfig,
          updatedByUserId: userId,
          updatedAt: new Date(),
        },
      })
    return {
      enabled: nextEnabled,
      config: nextConfig,
      updatedByUserId: userId,
      updatedAt: new Date().toISOString(),
    }
  })
}

/** Shallow-merge a partial config patch onto a base config (one level deep for
 *  brand / numberFormat objects; arrays + scalars replace wholesale). */
function mergeConfig(base: HouseStyleConfig, patch: unknown): Record<string, unknown> {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(p)) {
    if ((k === 'brand' || k === 'numberFormat') && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = { ...(base as unknown as Record<string, Record<string, unknown>>)[k], ...(v as Record<string, unknown>) }
    } else {
      out[k] = v
    }
  }
  return out
}

/** A compact, audit-safe descriptor of the applied house style (no prompts). */
export function houseStyleAuditSummary(hs: HouseStyle): Record<string, unknown> {
  return {
    enabled: hs.enabled,
    brand: hs.config.brand,
    fontFace: hs.config.fontFace,
    numberFormat: hs.config.numberFormat,
    terminologyRules: hs.config.terminology.length,
    bannedTerms: hs.config.bannedTerms.length,
    reusablePrompts: hs.config.reusablePrompts.length,
  }
}
