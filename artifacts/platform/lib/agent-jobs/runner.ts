import { executeAgent, harvestTickers } from '@/lib/agent-executor'
import { generateInvestmentMemo } from '@/lib/memo-service'
import { resolveLocalOrgId } from '@/lib/org-resolver'
import { withOrgContext, researchNotesTable } from '@workspace/db'
import { setRunning, appendStep, finishJob, getJob } from './store'
import { notifyJobFinished } from './notify'
import type { AgentJobRow, JobAttachment, JobResult, JobSource, JobStepEntry, DeliverableType } from '@workspace/db'

// ── Background runner ───────────────────────────────────────────────────────
// `startJobRunner` is fire-and-forget: the POST handler kicks it off and
// returns immediately, so the detached promise keeps running in the same
// long-lived Next.js server process after the request has been answered.
// The runner checkpoints each step into agent_jobs.steps so the jobs inbox
// can stream activity (via polling) even after the analyst closes the tab.
//
// Engine choice: `executeAgent` (the headless scheduler engine) is used for
// the grounded analysis because it fetches Groq / Perplexity / FMP directly
// with server-side API keys — no request cookie or base URL needed, so it is
// safe to run outside the request lifetime. Deck/memo generation additionally
// needs an absolute base URL, which we resolve from env.

function nowStep(kind: JobStepEntry['kind'], label: string, extra?: Partial<JobStepEntry>): JobStepEntry {
  return { ts: Date.now(), kind, label, ...extra }
}

function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const dom = process.env.REPLIT_DOMAINS?.split(',')[0]?.trim()
  if (dom) return `https://${dom}`
  const dev = process.env.REPLIT_DEV_DOMAIN
  if (dev) return `https://${dev}`
  return 'http://localhost:80'
}

function basePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || '/platform'
}

interface RunnerArgs {
  orgId: string
  userId: string
  jobId: string
  recipients: string[]
}

export function startJobRunner(args: RunnerArgs): void {
  // Detach: never await. Errors are caught and persisted as a failed job.
  void runJob(args).catch((e) => {
    console.error(JSON.stringify({ event: 'agent_job_runner_crashed', jobId: args.jobId, error: (e as Error)?.message }))
  })
}

async function runJob({ orgId, userId, jobId, recipients }: RunnerArgs): Promise<void> {
  let job: AgentJobRow | null = null
  try {
    job = await getJob(orgId, userId, jobId)
    if (!job) {
      console.warn(JSON.stringify({ event: 'agent_job_not_found', jobId }))
      return
    }

    await setRunning(orgId, userId, jobId)
    await appendStep(orgId, userId, jobId, nowStep('plan', 'Planning approach from brief'), {
      currentStep: 'Planning',
      progress: 5,
    })

    const ctx = (job.context ?? {}) as { symbol?: string; label?: string }
    const symbol = (ctx.symbol ?? '').toString().trim().toUpperCase()
    const tickers = symbol ? [symbol] : harvestTickers(job.brief)

    await appendStep(
      orgId,
      userId,
      jobId,
      nowStep('tools', tickers.length ? `Gathering market data for ${tickers.join(', ')}` : 'Gathering grounding context'),
      { currentStep: 'Gathering data', progress: 20 },
    )

    // 1) Grounded analysis via the headless engine.
    const analysis = await executeAgent({
      agentName: job.title,
      category: job.deliverableType,
      instructions: job.brief,
      tickers,
      orgId,
    })

    await appendStep(
      orgId,
      userId,
      jobId,
      nowStep('synthesise', 'Synthesising findings', {
        ok: analysis.ok,
        summary: analysis.headline,
        ms: analysis.latencyMs,
      }),
      { currentStep: 'Synthesising', progress: 60 },
    )

    const sources: JobSource[] = (analysis.sources ?? []).map((s) => ({ label: s.label, meta: s.meta }))

    // 2) Build the deliverable from the analysis.
    const result: JobResult = {
      headline: analysis.headline,
      summary: analysis.summary,
      findings: analysis.findings,
      attachments: [],
    }

    const deliverableType = job.deliverableType as DeliverableType
    const attachments: JobAttachment[] = []

    if ((deliverableType === 'memo' || deliverableType === 'deck') && tickers.length) {
      await appendStep(orgId, userId, jobId, nowStep('deliverable', `Rendering ${deliverableType} for ${tickers[0]}`), {
        currentStep: 'Building deck', progress: 75,
      })
      try {
        const baseUrl = `${resolveBaseUrl()}${basePath()}`
        const memo = await generateInvestmentMemo({
          baseUrl,
          ticker: tickers[0],
          userId,
          orgId,
          source: 'agent_ask_intent',
        })
        attachments.push({
          kind: 'pptx',
          label: `${memo.companyName} — ${memo.filename}`,
          downloadUrl: `${basePath()}/api/copilot/memo/${memo.fileId}`,
          fileId: memo.fileId,
          bytes: memo.bytes,
          expiresAt: memo.expiresAt,
        })
        result.summary = `${result.summary}\n\nDeck rendered: ${memo.slideTitles.length} slides (${memo.sourceLine}).`
        await appendStep(orgId, userId, jobId, nowStep('deliverable', `${deliverableType} ready (${memo.bytes} bytes)`, { ok: true }))
      } catch (e) {
        // Best-effort: a memo failure downgrades to the written brief, it does
        // not fail the whole job.
        await appendStep(orgId, userId, jobId, nowStep('error', `Deck generation skipped: ${(e as Error).message}`, { ok: false }))
      }
    } else if (deliverableType === 'research_note') {
      await appendStep(orgId, userId, jobId, nowStep('deliverable', 'Saving research note'), {
        currentStep: 'Saving note', progress: 80,
      })
      try {
        const noteTitle = job.title
        const localOrgId = await resolveLocalOrgId(orgId)
        const body = renderNoteMarkdown(noteTitle, result, sources)
        const [note] = await withOrgContext(localOrgId, (tx) =>
          tx
            .insert(researchNotesTable)
            .values({ orgId: localOrgId, authorUserId: userId, title: noteTitle, body })
            .returning({ id: researchNotesTable.id }),
        )
        attachments.push({
          kind: 'research_note',
          label: `Research note — ${noteTitle}`,
          href: `${basePath()}/app/research`,
          noteId: note?.id,
        })
        await appendStep(orgId, userId, jobId, nowStep('deliverable', 'Research note saved', { ok: true }))
      } catch (e) {
        await appendStep(orgId, userId, jobId, nowStep('error', `Note save skipped: ${(e as Error).message}`, { ok: false }))
      }
    } else {
      // matrix / model / analysis → markdown deliverable inline.
      await appendStep(orgId, userId, jobId, nowStep('deliverable', 'Composing written deliverable'), {
        currentStep: 'Composing', progress: 80,
      })
      attachments.push({
        kind: 'markdown',
        label: `${job.title} — written brief`,
      })
    }

    result.attachments = attachments

    await finishJob(orgId, userId, jobId, {
      status: 'done',
      result,
      sources,
      model: analysis.model,
      provider: analysis.provider,
    })

    // 3) Best-effort completion email.
    const finished = await getJob(orgId, userId, jobId)
    if (finished) {
      const mail = await notifyJobFinished(finished, recipients)
      if (!mail.ok) console.log(JSON.stringify({ event: 'agent_job_email_skipped', jobId, reason: mail.reason }))
    }
  } catch (e) {
    const message = (e as Error)?.message ?? 'Unknown runner error'
    console.error(JSON.stringify({ event: 'agent_job_failed', jobId, error: message }))
    try {
      await finishJob(orgId, userId, jobId, { status: 'failed', error: message })
      const failed = await getJob(orgId, userId, jobId)
      if (failed) await notifyJobFinished(failed, recipients).catch(() => undefined)
    } catch (inner) {
      console.error(JSON.stringify({ event: 'agent_job_persist_failure_error', jobId, error: (inner as Error)?.message }))
    }
  }
}

function renderNoteMarkdown(title: string, result: JobResult, sources: JobSource[]): string {
  const lines: string[] = []
  lines.push(`# ${title}`, '')
  if (result.headline) lines.push(`**${result.headline}**`, '')
  lines.push(result.summary, '')
  if (result.findings?.length) {
    lines.push('## Key findings', '')
    for (const f of result.findings) lines.push(`- **${f.title}** — ${f.detail}`)
    lines.push('')
  }
  if (sources.length) {
    lines.push('## Sources', '')
    for (const s of sources) lines.push(`- ${s.label}${s.meta ? ` — ${s.meta}` : ''}`)
    lines.push('')
  }
  lines.push('_Analysis is AI-generated; verify before acting._')
  return lines.join('\n')
}
