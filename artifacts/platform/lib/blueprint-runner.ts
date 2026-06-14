import 'server-only'
import { and, eq } from 'drizzle-orm'
import {
  withClerkContext,
  withOrgContext,
  audit,
  blueprintRunsTable,
  researchNotesTable,
  type BlueprintRow,
  type BlueprintStep,
  type BlueprintParameter,
} from '@workspace/db'
import { executeAgent, harvestTickers, type RunOutput } from './agent-executor'
import { resolveLocalOrgId } from './org-resolver'

// ── Types ──────────────────────────────────────────────────────────────────
export interface BlueprintRunArgs {
  orgId: string
  userId: string
  blueprint: BlueprintRow
  parameters: Record<string, string | number | string[]>
  target?: { kind?: string; label?: string; payload?: Record<string, unknown> } | null
  triggeredBy?: 'manual' | 'scheduled'
  /** When set, persist a research note with the final output into this org's notebook. */
  pinToNotebook?: boolean
}

export interface BlueprintStepResult {
  stepId: string
  title: string
  headline: string
  summary: string
  findings: { title: string; detail: string }[]
  sources: { label: string; meta: string }[]
  model: string | null
  provider: string
  latencyMs: number
  ok: boolean
  errorMessage?: string
}

export interface BlueprintRunResult {
  runId: string
  status: 'ok' | 'error'
  stepResults: BlueprintStepResult[]
  finalOutput: BlueprintStepResult | null
  pinnedNoteId: string | null
  totalLatencyMs: number
  errorMessage?: string
}

// ── Engine ─────────────────────────────────────────────────────────────────
export async function runBlueprint(args: BlueprintRunArgs): Promise<BlueprintRunResult> {
  const { orgId, userId, blueprint, parameters, target, triggeredBy = 'manual', pinToNotebook = true } = args
  const steps = (blueprint.steps as unknown as BlueprintStep[]) || []
  const params = (blueprint.parameters as unknown as BlueprintParameter[]) || []

  // Validate required parameters before we burn any LLM tokens.
  for (const p of params) {
    if (p.required) {
      const v = parameters[p.key]
      const empty =
        v === undefined ||
        v === null ||
        v === '' ||
        (Array.isArray(v) && v.length === 0)
      if (empty) {
        throw new Error(`missing_parameter:${p.key}`)
      }
    }
  }

  // 1. Insert the run row in `running` state so the UI can poll it.
  const startedAt = new Date()
  const runId = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx
      .insert(blueprintRunsTable)
      .values({
        orgId,
        blueprintId: blueprint.id,
        blueprintVersion: blueprint.version,
        blueprintName: blueprint.name,
        blueprintCategory: blueprint.category,
        blueprintIcon: blueprint.icon,
        triggeredBy,
        triggeredByUserId: userId,
        parameters: parameters as unknown as object,
        target: target ? (target as unknown as object) : null,
        runStatus: 'running',
        startedAt,
      })
      .returning({ id: blueprintRunsTable.id })
    return row.id
  })

  // 2. Execute steps sequentially, threading prior outputs into each prompt.
  const stepResults: BlueprintStepResult[] = []
  let priorOutput: BlueprintStepResult | null = null
  let cumLatency = 0
  let runError: string | undefined

  try {
    for (const step of steps) {
      const renderedPrompt = renderStepPrompt(step.prompt, parameters, priorOutput, target)
      const tickers = harvestTickers(renderedPrompt)

      let out: RunOutput
      try {
        out = await executeAgent({
          agentName: `${blueprint.name} · ${step.title}`,
          category: step.category || blueprint.category,
          templateSlug: blueprint.publishedSlug || blueprint.slug,
          instructions: renderedPrompt,
          tickers,
          orgId,
        })
      } catch (err) {
        // Fail the whole run on hard executor errors, but persist what we have.
        runError = (err as Error).message || 'step_failed'
        break
      }

      const result: BlueprintStepResult = {
        stepId: step.id,
        title: step.title,
        headline: out.headline,
        summary: out.summary,
        findings: out.findings,
        sources: out.sources,
        model: out.model,
        provider: out.provider,
        latencyMs: out.latencyMs,
        ok: out.ok,
        errorMessage: out.errorMessage,
      }
      stepResults.push(result)
      cumLatency += out.latencyMs
      priorOutput = result
      if (!out.ok) {
        runError = out.errorMessage || 'step_returned_error'
        break
      }
    }
  } catch (err) {
    runError = (err as Error).message || 'unknown_error'
  }

  const finalOutput = stepResults.length ? stepResults[stepResults.length - 1] : null
  const status: 'ok' | 'error' = !runError && stepResults.length === steps.length ? 'ok' : 'error'

  // 3. Persist the final state of the run + (optionally) pin a notebook note.
  let pinnedNoteId: string | null = null
  await withClerkContext(orgId, userId, async (tx) => {
    if (pinToNotebook && status === 'ok' && finalOutput) {
      try {
        // Resolve the local org UUID for the workspace notebook (research_notes
        // is keyed by UUID orgId, not Clerk text id).
        const localOrgId = await resolveLocalOrgId(orgId)
        if (localOrgId) {
          // research_notes uses withOrgContext (UUID) — write outside the
          // current Clerk transaction so the GUC channel matches its policy.
          const noteId = await withOrgContext(localOrgId, async (orgTx) => {
            const [note] = await orgTx
              .insert(researchNotesTable)
              .values({
                orgId: localOrgId,
                authorUserId: userId,
                title: `${blueprint.name} — ${finalOutput.headline.slice(0, 120)}`,
                body: composeNotebookBody(blueprint, parameters, stepResults),
              })
              .returning({ id: researchNotesTable.id })
            return note.id
          })
          pinnedNoteId = noteId
        }
      } catch {
        // Notebook write is best-effort — never fails the run.
      }
    }

    await tx
      .update(blueprintRunsTable)
      .set({
        runStatus: status,
        stepResults: stepResults as unknown as object,
        finalOutput: finalOutput as unknown as object,
        sources: (finalOutput?.sources || []) as unknown as object,
        errorMessage: runError ?? null,
        latencyMs: cumLatency,
        pinnedNoteId,
        completedAt: new Date(),
      })
      .where(and(eq(blueprintRunsTable.orgId, orgId), eq(blueprintRunsTable.id, runId)))
  })

  // 4. Audit log — best-effort.
  try {
    await audit.log({
      orgId,
      actorId: userId,
      actorType: 'user',
      action: 'blueprint.run' + (status === 'ok' ? '.success' : '.failed'),
      resourceType: 'blueprint',
      resourceId: blueprint.id,
      metadata: {
        runId,
        blueprintName: blueprint.name,
        blueprintVersion: blueprint.version,
        steps: stepResults.length,
        triggeredBy,
        pinnedNoteId,
        target: target?.label ?? null,
      },
    })
  } catch {
    /* swallow */
  }

  return {
    runId,
    status,
    stepResults,
    finalOutput,
    pinnedNoteId,
    totalLatencyMs: cumLatency,
    errorMessage: runError,
  }
}

// ── Prompt rendering ───────────────────────────────────────────────────────
const TOKEN_RE = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi

function renderStepPrompt(
  prompt: string,
  params: Record<string, string | number | string[]>,
  priorOutput: BlueprintStepResult | null,
  target?: { kind?: string; label?: string; payload?: Record<string, unknown> } | null,
): string {
  const subbed = prompt.replace(TOKEN_RE, (_, key: string) => {
    const v = params[key]
    if (v === undefined || v === null) return `[missing:${key}]`
    if (Array.isArray(v)) return v.join(', ')
    return String(v)
  })

  const preface: string[] = []
  if (priorOutput) {
    preface.push(
      `--- PREVIOUS STEP OUTPUT (use as context, do not repeat verbatim) ---`,
      `Headline: ${priorOutput.headline}`,
      `Summary: ${priorOutput.summary}`,
      ...priorOutput.findings.slice(0, 4).map((f) => `• ${f.title}: ${f.detail}`),
      `--- END PREVIOUS STEP ---`,
      '',
    )
  }
  if (target?.label) {
    preface.push(`Target: ${target.kind || 'context'} — ${target.label}`)
    if (target.payload && Object.keys(target.payload).length) {
      preface.push(`Target payload: ${JSON.stringify(target.payload).slice(0, 800)}`)
    }
    preface.push('')
  }

  return [...preface, subbed].join('\n')
}

function composeNotebookBody(
  blueprint: BlueprintRow,
  parameters: Record<string, string | number | string[]>,
  stepResults: BlueprintStepResult[],
): string {
  const paramLines = Object.entries(parameters)
    .map(([k, v]) => `• ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join('\n')
  const sections = stepResults.map((s) => {
    const findings = s.findings.map((f) => `  · ${f.title} — ${f.detail}`).join('\n')
    const sources = s.sources.map((src) => `  · ${src.label} (${src.meta})`).join('\n')
    return [
      `## ${s.title}`,
      s.headline,
      '',
      s.summary,
      '',
      findings,
      '',
      sources ? `Sources:\n${sources}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  })
  return [
    `Blueprint: ${blueprint.name} (v${blueprint.version})`,
    paramLines ? `\nInputs:\n${paramLines}` : '',
    '',
    ...sections,
  ]
    .filter(Boolean)
    .join('\n')
}
