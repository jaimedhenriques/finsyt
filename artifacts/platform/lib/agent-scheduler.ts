import 'server-only'
import { createRequire } from 'node:module'
import { and, eq, lte, ne, sql } from 'drizzle-orm'
import { db, agentsTable, type AgentRow } from '@workspace/db'
import { runAndPersist } from './agent-runner-server'
import { tickCredentialHealthNotifier } from './credential-health-notifier'
import { tickFilingRerunWatcher } from './filing-rerun-watcher'

// Module-scoped CJS require for the rare deps that ship as CommonJS only
// (e.g. node-cron). `import 'server-only'` above already keeps this file
// out of client/edge graphs.
const nodeRequire = createRequire(import.meta.url)

// ── In-process node-cron scheduler ─────────────────────────────────────────
// Runs once per minute, picks up all agents whose `next_run_at` has elapsed
// (status != Paused/Draft), and executes them through the same persistence
// path the manual UI uses. Uses the unrestricted DB role so we can scan
// across orgs; the run itself is then bound back to the agent's org via
// withClerkContext inside runAndPersist.
//
// Started exactly once per Node process (Next dev sometimes calls
// instrumentation twice via fast-refresh — the module-level guards prevent
// double-scheduling).

const MAX_PARALLEL = 2 // be polite to upstream LLM/data providers
const TICK_CRON = '* * * * *' // every minute
const SCAN_LIMIT = 25         // safety cap per tick
// Filing-rerun watcher cadence — runs every 5 minutes. Filings land in
// minutes-to-hours, so a per-minute fan-out across SEC EDGAR would be
// wasteful (and unkind to a fair-use API).
const FILING_WATCHER_CRON = '*/5 * * * *'
// Live Highlights retention sweep — runs once a day at 03:17 UTC. The
// off-peak quarter-past window keeps the bulk DELETE off the same minute
// as the per-minute agent tick (which runs cross-org SELECTs against the
// same Pool). Cutoffs themselves are read from env inside
// `pruneLiveHighlights()` so this cron is timing-only.
const LIVE_HIGHLIGHTS_CLEANUP_CRON = '17 3 * * *'

let started = false
let task: any = null
let credentialNotifierTask: any = null
let filingWatcherTask: any = null
let filingWatcherInFlight = false
let liveHighlightsCleanupTask: any = null
let liveHighlightsCleanupInFlight = false

export function startAgentScheduler() {
  if (started) return
  started = true

  // Lazy-load node-cron via createRequire so this CommonJS dep doesn't
  // need to be statically imported (and so a missing install doesn't crash
  // the whole module on import).
  let cron: any
  try { cron = nodeRequire('node-cron') } catch (e) {
    console.error('[agent-scheduler] node-cron not installed — scheduler disabled', e)
    started = false
    return
  }

  console.log('[agent-scheduler] starting in-process scheduler (every minute)')
  task = cron.schedule(TICK_CRON, () => { tick().catch((e) => console.error('[agent-scheduler] tick error', e)) })

  // Kick a tick on boot so freshly-started servers don't have to wait a
  // full minute before catching overdue agents.
  setTimeout(() => { tick().catch(() => {}) }, 5_000)

  // Piggy-back the credential-health notifier on the same per-minute
  // cron. It's cheap (one Map scan + at most one HTTP POST on transition)
  // and avoids spinning up a second cron just for ops paging.
  // Lives outside `tick()` so a slow agent run can't delay credential
  // alerts past their next minute.
  // Track the handle so `stopAgentScheduler()` can tear it down too —
  // otherwise dev hot-reload paths that call stop→start would leak a
  // notifier cron per cycle.
  credentialNotifierTask = cron.schedule(TICK_CRON, () => {
    tickCredentialHealthNotifier().catch((e) =>
      console.error('[credential-health-notifier] tick error', (e as Error).message),
    )
  })

  // Also kick the notifier on boot so a key that gets rejected during
  // the first wave of upstream calls (e.g. by /api/health probes) is
  // surfaced without waiting a full cron minute.
  setTimeout(() => {
    tickCredentialHealthNotifier().catch(() => {})
  }, 10_000)

  // Filing-rerun watcher: every 5 minutes, scan matrices flagged
  // `rerunOnFiling=true`, poll SEC EDGAR for the latest filing per row
  // ticker, and mark cells dirty when a fresh document lands.
  // Gated by env so single-tenant dev or perf-sensitive hosts can opt
  // out without disabling the whole agent scheduler.
  if (process.env.FILING_WATCHER_DISABLED !== '1') {
    filingWatcherTask = cron.schedule(FILING_WATCHER_CRON, () => {
      runFilingWatcherTick().catch((e) =>
        console.error('[filing-rerun-watcher] tick error', (e as Error).message),
      )
    })
    // Boot kick — if a filing landed while the server was offline we want
    // to surface it on the next page load, not wait the full 5 minutes.
    setTimeout(() => { runFilingWatcherTick().catch(() => {}) }, 15_000)
  }

  // Live Highlights retention sweep — daily DELETE pass over the
  // `live_highlights_*` tables. Cheap (a few sub-second DELETEs at the
  // configured cutoffs) but kept on its own daily cron so it never
  // interleaves with the per-minute agent tick. Gated by env so a
  // single-tenant dev instance with no scheduler can opt out.
  if (process.env.LIVE_HIGHLIGHTS_CLEANUP_DISABLED !== '1') {
    liveHighlightsCleanupTask = cron.schedule(LIVE_HIGHLIGHTS_CLEANUP_CRON, () => {
      runLiveHighlightsCleanupTick().catch((e) =>
        console.error('[live-highlights-cleanup] tick error', (e as Error).message),
      )
    })
    // Boot kick — if the server was offline through the daily cron slot
    // we still want to prune within the first minute so disk usage and
    // per-org read latency stay bounded after a long downtime.
    setTimeout(() => { runLiveHighlightsCleanupTick().catch(() => {}) }, 30_000)
  }
}

async function runLiveHighlightsCleanupTick() {
  if (liveHighlightsCleanupInFlight) return
  liveHighlightsCleanupInFlight = true
  try {
    const { pruneLiveHighlights } = await import('@workspace/db')
    const res = await pruneLiveHighlights()
    if (res.notificationsDeleted + res.pinsDeleted + res.callsDeleted > 0) {
      console.log(
        `[live-highlights-cleanup] pruned ${res.notificationsDeleted} notifs ` +
          `(>${res.notificationCutoffDays}d), ${res.pinsDeleted} pins + ` +
          `${res.callsDeleted} ended calls (>${res.endedCallCutoffDays}d)`,
      )
    }
  } finally {
    liveHighlightsCleanupInFlight = false
  }
}

async function runFilingWatcherTick() {
  if (filingWatcherInFlight) return
  filingWatcherInFlight = true
  try {
    const res = await tickFilingRerunWatcher()
    if (res.scannedMatrices > 0 && res.newFilings > 0) {
      console.log(
        `[filing-rerun-watcher] scanned ${res.scannedMatrices} matrices, ${res.scannedSymbols} symbols, dirtied ${res.newFilings} cells`,
      )
    }
  } finally {
    filingWatcherInFlight = false
  }
}

export function stopAgentScheduler() {
  if (task) { try { task.stop() } catch {} }
  if (credentialNotifierTask) { try { credentialNotifierTask.stop() } catch {} }
  if (filingWatcherTask) { try { filingWatcherTask.stop() } catch {} }
  if (liveHighlightsCleanupTask) { try { liveHighlightsCleanupTask.stop() } catch {} }
  task = null
  credentialNotifierTask = null
  filingWatcherTask = null
  filingWatcherInFlight = false
  liveHighlightsCleanupTask = null
  liveHighlightsCleanupInFlight = false
  started = false
}

// One scheduler tick: select due agents, run them with bounded parallelism.
let tickInFlight = false
async function tick() {
  if (tickInFlight) return // prevent overlapping ticks if a previous one is slow
  tickInFlight = true
  try {
    // Cross-org scan — RLS will reject this when the runtime role is
    // app_runtime *unless* we use the unrestricted owner. The shared db
    // client already authenticates as the owner role, so this select is
    // allowed; per-row work is then re-bound via withClerkContext.
    const due: AgentRow[] = await db.select().from(agentsTable)
      .where(and(
        lte(agentsTable.nextRunAt, sql`now()`),
        ne(agentsTable.status, 'Paused'),
        ne(agentsTable.status, 'Draft'),
      ))
      .limit(SCAN_LIMIT)

    if (due.length === 0) return
    console.log(`[agent-scheduler] ${due.length} agent(s) due — executing`)

    // Bounded parallelism — process MAX_PARALLEL at a time.
    let cursor = 0
    async function worker() {
      while (cursor < due.length) {
        const idx = cursor++
        const agent = due[idx]
        try {
          await runAndPersist({ agent, triggeredBy: 'scheduled' })
        } catch (e) {
          console.error(`[agent-scheduler] agent ${agent.id} failed`, e)
          // On failure, push nextRunAt forward 30 minutes so we don't tight-loop.
          try {
            await db.update(agentsTable)
              .set({ nextRunAt: new Date(Date.now() + 30 * 60_000), updatedAt: new Date() })
              .where(eq(agentsTable.id, agent.id))
          } catch {}
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, due.length) }, () => worker()))
  } finally {
    tickInFlight = false
  }
}
