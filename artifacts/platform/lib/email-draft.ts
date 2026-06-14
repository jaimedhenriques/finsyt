/**
 * Email-draft assistant helpers.
 *
 * Pure utilities used by `/app/workspaces/email-draft` and the matching API
 * route. Kept framework-free so the same helpers run in the browser (CSV +
 * .eml export, prompt building) and on the server (prompt building, parsing).
 *
 * Personas are deliberately separate from `lib/investor-personas.ts` — those
 * model famous investor styles for analysis. Outreach personas describe the
 * *recipient* of an outreach email (analyst, banker, PE associate, etc.) and
 * therefore call for different tone, depth, and CTAs.
 */

export type OutreachPersona = {
  id: string
  label: string
  audience: string        // who is being written to
  tone: string            // tonal guidance for the model
  callToAction: string    // default CTA
}

export const OUTREACH_PERSONAS: OutreachPersona[] = [
  {
    id: 'sell_side_analyst',
    label: 'Sell-side analyst',
    audience: 'A sell-side equity research analyst covering the name',
    tone: 'Crisp, data-led, no fluff. Lead with a non-consensus observation. Numbers in parentheses.',
    callToAction: 'Ask for 20 minutes to compare model assumptions next week.',
  },
  {
    id: 'investment_banker',
    label: 'Investment banker (coverage)',
    audience: 'An MD-level coverage banker at a bulge bracket',
    tone: 'Professional, relationship-focused, framed around capital structure or strategic optionality.',
    callToAction: 'Suggest a short intro call to share our latest perspective.',
  },
  {
    id: 'pe_associate',
    label: 'PE / growth associate',
    audience: 'A private-equity / growth-equity investment associate',
    tone: 'Thesis-first, return-driver framing, comfortable with adjacencies and operational levers.',
    callToAction: 'Offer a 30 min walkthrough of the deep dive plus underlying model.',
  },
  {
    id: 'corp_strategy',
    label: 'Corporate strategy / corp-dev',
    audience: 'A corporate strategy / corp-dev lead at a strategic acquirer',
    tone: 'Strategic, partnership-oriented, focused on competitive positioning and white-space.',
    callToAction: 'Propose a working session with our analyst team.',
  },
  {
    id: 'buyside_pm',
    label: 'Buy-side portfolio manager',
    audience: 'A long-only buy-side PM running a concentrated book',
    tone: 'Variant-perception, risk/reward in two sentences, brevity over completeness.',
    callToAction: 'Offer a 15 minute call to walk through the bear case.',
  },
  {
    id: 'family_office',
    label: 'Family office principal',
    audience: 'A single-family-office principal making direct equity bets',
    tone: 'Plain language, durable-business framing, downside-first.',
    callToAction: 'Suggest a casual catch-up over coffee or video.',
  },
]

export type OutreachIntent = {
  id: string
  label: string
  description: string
  defaultSubjectHint: string
}

export const OUTREACH_INTENTS: OutreachIntent[] = [
  {
    id: 'intro',
    label: 'Cold intro / first touch',
    description: 'A warm, specific first contact that demonstrates we have done the work.',
    defaultSubjectHint: 'Quick thought on {{COMPANY}} ({{SYMBOL}})',
  },
  {
    id: 'coverage_update',
    label: 'Coverage update',
    description: 'A periodic update for an existing relationship — what changed since last contact.',
    defaultSubjectHint: '{{SYMBOL}} update — {{ANGLE}}',
  },
  {
    id: 'earnings_recap',
    label: 'Earnings recap',
    description: 'A tight post-print recap with the one-thing-that-mattered and why.',
    defaultSubjectHint: '{{SYMBOL}} print: the one thing that mattered',
  },
  {
    id: 'pitch',
    label: 'Pitch / variant thesis',
    description: 'A pitch email with our variant view, key debates, and risk/reward.',
    defaultSubjectHint: '{{SYMBOL}} — variant view & risk/reward',
  },
  {
    id: 'meeting_request',
    label: 'Meeting request',
    description: 'A short request for time, anchored to one or two specific topics.',
    defaultSubjectHint: '20 min on {{SYMBOL}}? — {{ANGLE}}',
  },
]

export type Target = {
  symbol: string
  companyName?: string
  recipientName?: string
  recipientEmail?: string
  notes?: string
}

export type GeneratedDraft = {
  symbol: string
  companyName?: string
  subject: string
  body: string
  citations: string[]
  modelUsed?: string
  hasLiveData?: boolean
  generatedAt: number
}

/**
 * Build the prompt sent to the underlying research agent. Kept as a pure
 * function so it can be unit-snapshot-tested and so the page can preview it
 * for power users.
 */
export function buildDraftPrompt(opts: {
  target: Target
  persona: OutreachPersona
  intent: OutreachIntent
  fromName?: string
  signature?: string
  customGuidance?: string
}): string {
  const { target, persona, intent, fromName, signature, customGuidance } = opts
  const company = target.companyName || target.symbol
  const recipient = target.recipientName ? `${target.recipientName}` : persona.audience
  const sender = fromName?.trim() || 'the analyst'

  return [
    `Draft a personalised outreach email about ${company} (${target.symbol}).`,
    ``,
    `RECIPIENT: ${recipient}`,
    `RECIPIENT TONE: ${persona.tone}`,
    `INTENT: ${intent.label} — ${intent.description}`,
    `SENDER: ${sender}`,
    customGuidance?.trim() ? `EXTRA GUIDANCE: ${customGuidance.trim()}` : '',
    ``,
    `Use the live data context above. Ground every concrete claim in a citation`,
    `(e.g. "FMP", "EDGAR 10-K", "transcript Q4'25"). Do not invent figures.`,
    ``,
    `Constraints:`,
    `- Max ~180 words for the body. Three short paragraphs.`,
    `- One specific, non-obvious observation in paragraph one.`,
    `- One quantified data point in paragraph two with inline source.`,
    `- Close with: "${persona.callToAction}"`,
    `- No greeting placeholder like "[Name]" — open with a topical sentence instead.`,
    `- Sign off with the sender's first name only.`,
    signature?.trim() ? `- Append the following signature block verbatim after the sign-off:\n${signature.trim()}` : '',
    ``,
    `Return STRICT JSON (no prose around it) with this exact shape:`,
    `{`,
    `  "subject": "string, <= 80 chars",`,
    `  "body": "string, plain text, line breaks preserved with \\n",`,
    `  "citations": ["short label", "..."]`,
    `}`,
  ].filter(Boolean).join('\n')
}

/**
 * Parse the model output. Tolerant of the common failure modes:
 *  • code-fenced JSON
 *  • leading/trailing prose
 *  • missing citations field
 * Falls back to plain-text → subject + body split when JSON is unrecoverable
 * so the user always sees *something* they can edit.
 */
export function parseDraftResponse(raw: string): { subject: string; body: string; citations: string[] } {
  const text = String(raw || '').trim()
  if (!text) return { subject: '', body: '', citations: [] }

  // 1. Strip code fences and try the largest JSON-looking block.
  const stripped = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    const block = jsonMatch[0]
    // 1a. Strict parse first.
    try {
      const parsed = JSON.parse(block)
      const subject = typeof parsed.subject === 'string' ? parsed.subject.trim() : ''
      const body = typeof parsed.body === 'string' ? parsed.body : ''
      const citations = Array.isArray(parsed.citations)
        ? parsed.citations.filter((c: unknown): c is string => typeof c === 'string').map((c: string) => c.trim()).filter(Boolean)
        : []
      if (subject && body) return { subject, body, citations }
    } catch { /* fall through to lenient parsing */ }

    // 1b. Lenient parse — models commonly emit JSON-shaped output where the
    // body string contains *real* newlines instead of escaped `\n`, which
    // makes strict JSON.parse fail. Pull the fields out with regex instead.
    const lenient = lenientJsonExtract(block)
    if (lenient && (lenient.subject || lenient.body)) return lenient
  }

  // 2. Plain-text fallback. Split on the first blank line; first line = subject.
  const lines = text.split(/\r?\n/)
  const firstNonEmpty = lines.findIndex(l => l.trim().length > 0)
  if (firstNonEmpty < 0) return { subject: '', body: text, citations: [] }
  const subjectLine = lines[firstNonEmpty].replace(/^subject:\s*/i, '').trim()
  const bodyStart = lines.findIndex((l, i) => i > firstNonEmpty && l.trim() === '')
  const body = (bodyStart > 0 ? lines.slice(bodyStart + 1) : lines.slice(firstNonEmpty + 1)).join('\n').trim()
  return { subject: subjectLine.slice(0, 120), body: body || text, citations: [] }
}

/**
 * Extract subject/body/citations from a JSON-ish blob without using JSON.parse.
 * Tolerates unescaped newlines inside string values — the most common reason
 * models emit invalid-but-readable JSON. Returns null if no recognizable
 * subject/body fields are present.
 */
function lenientJsonExtract(block: string): { subject: string; body: string; citations: string[] } | null {
  // Pull "subject": "...".  We allow either escaped quote or end-of-value
  // delimiter (comma/newline followed by another key, or closing brace).
  const subjectMatch = block.match(/"subject"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  // "body" may span many lines and contain real newlines, so match
  // non-greedily up to the next top-level key (`",\s*"citations"` /
  // `",\s*"subject"`) or the closing brace.
  const bodyMatch =
    block.match(/"body"\s*:\s*"([\s\S]*?)"\s*,\s*"citations"\s*:/) ||
    block.match(/"body"\s*:\s*"([\s\S]*?)"\s*\}\s*$/)
  const citationsBlock = block.match(/"citations"\s*:\s*\[([\s\S]*?)\]/)

  const unescape = (s: string): string =>
    s
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
  const subject = subjectMatch ? unescape(subjectMatch[1]).trim() : ''
  const body    = bodyMatch    ? unescape(bodyMatch[1]).trim()    : ''
  const citations = citationsBlock
    ? Array.from(citationsBlock[1].matchAll(/"((?:[^"\\]|\\.)*)"/g))
        .map(m => unescape(m[1]).trim())
        .filter(Boolean)
    : []
  if (!subject && !body) return null
  return { subject, body, citations }
}

/**
 * RFC 5322 quoted-printable-ish encoder for header values that may contain
 * non-ASCII. We keep this minimal — only ASCII passes through unchanged, and
 * anything else is base64 encoded as a `=?utf-8?B?...?=` encoded-word so the
 * subject line shows up correctly in Gmail / Outlook.
 */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  // Browser-safe base64 of UTF-8 bytes.
  const utf8 = typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(value)
    : Buffer.from(value, 'utf-8')
  let bin = ''
  utf8.forEach((b: number) => { bin += String.fromCharCode(b) })
  const b64 = typeof btoa !== 'undefined' ? btoa(bin) : Buffer.from(value, 'utf-8').toString('base64')
  return `=?utf-8?B?${b64}?=`
}

/**
 * Build a single RFC 5322 .eml message body that mail clients (Apple Mail,
 * Outlook, Thunderbird) will open as a fresh draft when downloaded.
 */
export function buildEml(opts: {
  to?: string
  from?: string
  subject: string
  body: string
}): string {
  const lines = [
    'MIME-Version: 1.0',
    `Date: ${new Date().toUTCString()}`,
    opts.from ? `From: ${encodeHeader(opts.from)}` : '',
    opts.to   ? `To: ${encodeHeader(opts.to)}`     : '',
    `Subject: ${encodeHeader(opts.subject || '(no subject)')}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    // RFC 5322 line endings should be CRLF; clients accept LF but CRLF is safest.
    opts.body.replace(/\r?\n/g, '\r\n'),
    '',
  ].filter(Boolean)
  return lines.join('\r\n')
}

/**
 * CSV escape — wraps in quotes when the value contains delimiters / quotes /
 * newlines, and doubles embedded quotes. Excel + Google Sheets safe.
 */
function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function draftsToCsv(rows: GeneratedDraft[], targets: Map<string, Target>): string {
  const header = ['symbol', 'company', 'recipient_name', 'recipient_email', 'subject', 'body', 'citations', 'generated_at']
  const out = [header.join(',')]
  rows.forEach(d => {
    const t = targets.get(d.symbol)
    out.push([
      csvCell(d.symbol),
      csvCell(d.companyName || t?.companyName || ''),
      csvCell(t?.recipientName || ''),
      csvCell(t?.recipientEmail || ''),
      csvCell(d.subject),
      csvCell(d.body),
      csvCell(d.citations.join(' | ')),
      csvCell(new Date(d.generatedAt).toISOString()),
    ].join(','))
  })
  return out.join('\n')
}

/**
 * Best-effort CSV parser for an uploaded target list. Supports quoted cells
 * with embedded commas. Header row drives column mapping — accepts the
 * common ticker column names (`symbol`, `ticker`, `tic`).
 */
export function parseTargetCsv(text: string): Target[] {
  const rows = parseCsvRows(text)
  if (!rows.length) return []
  const header = rows[0].map(c => c.trim().toLowerCase())
  const idx = (...candidates: string[]) => {
    for (const c of candidates) {
      const i = header.indexOf(c)
      if (i >= 0) return i
    }
    return -1
  }
  const symIdx     = idx('symbol', 'ticker', 'tic')
  const nameIdx    = idx('company', 'name', 'company_name')
  const recIdx     = idx('recipient', 'recipient_name', 'contact')
  const emailIdx   = idx('email', 'recipient_email')
  const notesIdx   = idx('notes', 'note', 'context')
  if (symIdx < 0) {
    // Tolerate header-less files: assume column 0 is the symbol.
    return rows
      .map(r => ({ symbol: (r[0] || '').trim().toUpperCase() }))
      .filter(t => /^[A-Z0-9.\-]{1,12}$/.test(t.symbol))
  }
  const out: Target[] = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const symbol = (r[symIdx] || '').trim().toUpperCase()
    if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) continue
    out.push({
      symbol,
      companyName:    nameIdx  >= 0 ? (r[nameIdx]  || '').trim() || undefined : undefined,
      recipientName:  recIdx   >= 0 ? (r[recIdx]   || '').trim() || undefined : undefined,
      recipientEmail: emailIdx >= 0 ? (r[emailIdx] || '').trim() || undefined : undefined,
      notes:          notesIdx >= 0 ? (r[notesIdx] || '').trim() || undefined : undefined,
    })
  }
  return out
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else { inQuotes = false }
      } else { cell += ch }
      continue
    }
    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { cur.push(cell); cell = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(cell); cell = ''
      if (cur.some(c => c.length > 0)) rows.push(cur)
      cur = []
      continue
    }
    cell += ch
  }
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell)
    if (cur.some(c => c.length > 0)) rows.push(cur)
  }
  return rows
}

const SNAPSHOT_KEY = 'finsyt:matrix:snapshots'

export type MatrixSnapshot = {
  id: string
  name: string
  symbols: string[]
  createdAt: number
}

export function loadMatrixSnapshots(): MatrixSnapshot[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return seedDefaultSnapshots()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return seedDefaultSnapshots()
    return parsed.filter(
      (s: any): s is MatrixSnapshot =>
        s && typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.symbols),
    )
  } catch { return seedDefaultSnapshots() }
}

export function saveMatrixSnapshots(list: MatrixSnapshot[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list)) } catch { /* quota / private mode */ }
}

function seedDefaultSnapshots(): MatrixSnapshot[] {
  // Two practical defaults so the matrix-snapshot tab is never empty on first
  // load. Users overwrite these the moment they save their own snapshot.
  const seeded: MatrixSnapshot[] = [
    { id: 'seed-ai-infra',  name: 'AI infrastructure',     symbols: ['NVDA', 'AVGO', 'AMD', 'TSM', 'ASML'], createdAt: Date.now() },
    { id: 'seed-megacap',   name: 'Mega-cap tech coverage', symbols: ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN'], createdAt: Date.now() },
  ]
  saveMatrixSnapshots(seeded)
  return seeded
}
