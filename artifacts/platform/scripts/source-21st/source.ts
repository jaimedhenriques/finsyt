/**
 * source-21st — pull curated UI components from the user's 21st.dev account
 * into `components/ui/sourced/<slug>/`.
 *
 * Build-time only. Never imported by the runtime bundle.
 *
 * Usage:
 *   pnpm --filter @workspace/platform exec tsx scripts/source-21st/source.ts \
 *     --slug command-palette --slug command-input --slug page-header
 *
 *   # Or pull everything from the curated default set:
 *   pnpm --filter @workspace/platform exec tsx scripts/source-21st/source.ts --all
 *
 * Env:
 *   TWENTY_FIRST_API_KEY (alias TWENTYFIRST_API_KEY) — required.
 *
 * Output:
 *   artifacts/platform/components/ui/sourced/<slug>/<file>.tsx
 *   artifacts/platform/components/ui/sourced/MANIFEST.md   (appended/updated)
 *
 * The script writes a row per pull into MANIFEST.md so reviewers can see what
 * came from 21st.dev, what version, and on what date. Adapter wrappers under
 * components/ui/<name>.tsx are *not* generated — they are hand-written so
 * Finsyt design tokens, accessibility, and density choices stay under our
 * control.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Curated default set ─────────────────────────────────────────────────────
// Slugs are the public 21st.dev component slugs from the user's account.
// Grouped by surface for legibility.
const DEFAULT_SLUGS = [
  // Command surface
  'command-palette',
  'command-input',
  'kbd',
  // Page chrome
  'page-header',
  'toolbar',
  'sidebar-group',
  // Data
  'data-table',
  'metric-tile',
  // States
  'empty-state',
  'loading-skeleton',
  // Inline AI affordances
  'contextual-ask-bar',
  'inline-agent-menu',
  'ai-chat-input',
  // Surfaces
  'popover',
  'drawer',
  'floating-finsyt-agent',
] as const

const __dirname = dirname(fileURLToPath(import.meta.url))
const SOURCED_DIR = join(__dirname, '..', '..', 'components', 'ui', 'sourced')
const MANIFEST_PATH = join(SOURCED_DIR, 'MANIFEST.md')

interface CliArgs { slugs: string[]; all: boolean; dryRun: boolean }
function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { slugs: [], all: false, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') out.all = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--slug') out.slugs.push(argv[++i] ?? '')
  }
  return out
}

interface SourcedFile { path: string; content: string }
interface SourcedComponent { slug: string; version: string; originUrl: string; files: SourcedFile[] }

/**
 * Fetch a single component from 21st.dev via the official Node SDK.
 *
 * The SDK surface evolves — we do a permissive load so the script keeps
 * working when the user upgrades `@21st-sdk/node`.
 */
async function fetchComponent(slug: string, apiKey: string): Promise<SourcedComponent> {
  const sdk: any = await import('@21st-sdk/node').catch(() => null)
  if (!sdk) {
    throw new Error('Install @21st-sdk/node before running this script')
  }
  const ClientCtor: any = sdk.Client ?? sdk.TwentyFirstClient ?? sdk.default
  if (!ClientCtor) throw new Error('Unable to locate Client export on @21st-sdk/node')
  const client = new ClientCtor({ apiKey })

  // The SDK exposes either `components.get(slug)` or `getComponent(slug)`.
  const get = client.components?.get?.bind(client.components) ?? client.getComponent?.bind(client)
  if (!get) throw new Error('Unable to locate component getter on @21st-sdk/node Client')
  const raw = await get(slug)

  // Normalise — different SDK majors return slightly different shapes.
  const files: SourcedFile[] = Array.isArray(raw?.files)
    ? raw.files.map((f: any) => ({ path: String(f.path ?? f.name), content: String(f.content ?? '') }))
    : [{ path: 'index.tsx', content: String(raw?.code ?? raw?.content ?? '') }]
  return {
    slug,
    version: String(raw?.version ?? raw?.commit ?? 'unknown'),
    originUrl: String(raw?.url ?? `https://21st.dev/components/${slug}`),
    files,
  }
}

async function ensureManifestHeader(): Promise<string> {
  if (existsSync(MANIFEST_PATH)) return await readFile(MANIFEST_PATH, 'utf8')
  return [
    '# 21st.dev sourced components',
    '',
    'Each row records a single pull executed via `scripts/source-21st/source.ts`.',
    'Files in this directory are committed verbatim from the user\'s 21st.dev account.',
    'Pages **never** import from this folder directly — they import the Finsyt-branded',
    'adapter that lives under `components/ui/<name>.tsx`.',
    '',
    '| Date | Slug | Version | Origin | Files |',
    '|------|------|---------|--------|-------|',
    '',
  ].join('\n')
}

async function appendManifest(rows: SourcedComponent[]): Promise<void> {
  const header = await ensureManifestHeader()
  const stamp = new Date().toISOString().slice(0, 10)
  const newRows = rows.map(r => `| ${stamp} | \`${r.slug}\` | ${r.version} | ${r.originUrl} | ${r.files.map(f => `\`${f.path}\``).join(' ')} |`).join('\n')
  await writeFile(MANIFEST_PATH, header.trimEnd() + '\n' + newRows + '\n', 'utf8')
}

async function writeComponent(c: SourcedComponent): Promise<void> {
  const dir = join(SOURCED_DIR, c.slug)
  await mkdir(dir, { recursive: true })
  for (const f of c.files) {
    const target = join(dir, f.path.replace(/^\/+/, ''))
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, f.content, 'utf8')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const slugs = args.all ? Array.from(DEFAULT_SLUGS) : args.slugs
  if (slugs.length === 0) {
    console.error('No slugs provided. Pass --slug <name> (repeat) or --all.')
    process.exit(2)
  }
  const apiKey = process.env.TWENTYFIRST_API_KEY ?? process.env.TWENTY_FIRST_API_KEY
  if (!apiKey) {
    console.error('TWENTY_FIRST_API_KEY is not set.')
    process.exit(2)
  }

  await mkdir(SOURCED_DIR, { recursive: true })
  const pulled: SourcedComponent[] = []
  for (const slug of slugs) {
    process.stdout.write(`→ ${slug} … `)
    try {
      const c = await fetchComponent(slug, apiKey)
      if (!args.dryRun) {
        await writeComponent(c)
      }
      pulled.push(c)
      console.log(`${c.files.length} file(s) @ ${c.version}`)
    } catch (err) {
      console.log(`FAILED (${(err as Error).message})`)
    }
  }
  if (pulled.length > 0 && !args.dryRun) await appendManifest(pulled)
  console.log(`\nDone. ${pulled.length}/${slugs.length} component(s) pulled.`)
}

main().catch(err => { console.error(err); process.exit(1) })
