import "server-only";

import { and, eq, lte, sql } from "drizzle-orm";
import { db, workflowsTable, type WorkflowSchedule, type WorkflowRow } from "@workspace/db";
import { runWorkflow } from "./executor";

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Compute the next UTC trigger time for a workflow schedule, relative to `from`
 * (defaults to now). All times are interpreted in UTC to match the in-process
 * cron and the agents table convention.
 *
 *   • Daily   — next occurrence of HH:MM today, else tomorrow.
 *   • Weekly  — next occurrence of `day` at HH:MM (1–7 days out).
 *   • Monthly — same day-of-month next month at HH:MM (clamped to month length).
 */
export function computeNextRunAt(schedule: WorkflowSchedule, from: Date = new Date()): Date {
  const [hh, mm] = parseTime(schedule.time);
  const base = new Date(from.getTime());

  if (schedule.frequency === "Daily") {
    const next = atUtc(base, hh, mm);
    if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  if (schedule.frequency === "Weekly") {
    const targetDow = schedule.day ? WEEKDAY_INDEX[schedule.day] ?? 1 : 1;
    const next = atUtc(base, hh, mm);
    let delta = (targetDow - next.getUTCDay() + 7) % 7;
    if (delta === 0 && next.getTime() <= from.getTime()) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
  }

  // Monthly — same day-of-month at HH:MM, advancing to the next month when
  // that moment has already passed. When the next month is shorter than the
  // anchor day (e.g. Jan 31 → February), clamp to that month's last day so we
  // never skip a month (the naive `setUTCMonth(+1)` rolls Jan 31 into Mar 3).
  const anchorDom = base.getUTCDate();
  const next = atUtc(base, hh, mm);
  if (next.getTime() <= from.getTime()) {
    const y = next.getUTCFullYear();
    const m = next.getUTCMonth();
    // Day 0 of month (m + 2) is the last day of month (m + 1) — the target month.
    const lastDayOfNextMonth = new Date(Date.UTC(y, m + 2, 0)).getUTCDate();
    const day = Math.min(anchorDom, lastDayOfNextMonth);
    return new Date(Date.UTC(y, m + 1, day, hh, mm, 0, 0));
  }
  return next;
}

function parseTime(time?: string): [number, number] {
  if (!time) return [9, 0];
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return [9, 0];
  const hh = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return [hh, mm];
}

function atUtc(base: Date, hh: number, mm: number): Date {
  const d = new Date(base.getTime());
  d.setUTCHours(hh, mm, 0, 0);
  return d;
}

// ── Cron tick ────────────────────────────────────────────────────────────────

export interface WorkflowTickResult {
  due: number;
  ok: number;
  failed: number;
}

/**
 * One scheduler tick for workflows: select Active workflows whose `next_run_at`
 * has elapsed and that carry a schedule, run each once, and re-anchor
 * `next_run_at` to the following occurrence. Mirrors the agent scheduler: the
 * cross-org scan uses the unrestricted DB client, then `runWorkflow` re-binds
 * each execution to the workflow's own org via `withClerkContext`.
 *
 * On failure we still advance `next_run_at` (to its normal next occurrence) so
 * a permanently-broken workflow can't tight-loop the scheduler.
 */
export async function tickWorkflowScheduler(limit = 25): Promise<WorkflowTickResult> {
  const due: WorkflowRow[] = await db
    .select()
    .from(workflowsTable)
    .where(
      and(
        eq(workflowsTable.status, "Active"),
        lte(workflowsTable.nextRunAt, sql`now()`),
      ),
    )
    .limit(limit);

  let ok = 0;
  let failed = 0;

  for (const wf of due) {
    const schedule = wf.schedule as WorkflowSchedule | null;
    try {
      await runWorkflow({
        orgId: wf.orgId,
        userId: wf.authorUserId,
        workflowId: wf.id,
        triggeredBy: "scheduled",
      });
      ok++;
    } catch (e) {
      failed++;
      console.error(`[workflow-scheduler] workflow ${wf.id} failed`, (e as Error).message);
    } finally {
      // Re-anchor regardless of outcome so the row leaves the due window.
      const nextRunAt = schedule ? computeNextRunAt(schedule) : null;
      try {
        await db
          .update(workflowsTable)
          .set({ nextRunAt, updatedAt: new Date() })
          .where(eq(workflowsTable.id, wf.id));
      } catch {
        // best-effort
      }
    }
  }

  return { due: due.length, ok, failed };
}
