import 'server-only'
import { createRequire } from 'node:module'
import { and, eq, lte, ne, sql } from 'drizzle-orm'
import { db, agentsTable, type AgentRow } from '@workspace/db'
import { runAndPersist } from './agent-runner-server'
import { tickCredentialHealthNotifier } from './credential-health-notifier'

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

let started = false
let task: any = null
let credentialNotifierTask: any = null

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
}

export function stopAgentScheduler() {
  if (task) { try { task.stop() } catch {} }
  if (credentialNotifierTask) { try { credentialNotifierTask.stop() } catch {} }
  task = null
  credentialNotifierTask = null
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
