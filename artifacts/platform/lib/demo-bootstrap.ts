/**
 * Idempotent demo-data bootstrap for `PLATFORM_OPEN_MODE`.
 *
 * When the platform boots in open mode, the demo user/org need to actually
 * exist in the database — otherwise foreign-key-bound writes (creating a
 * research note, asking the agent, etc.) blow up. This module:
 *
 * 1. Inserts the demo `organizations` row at the fixed UUID used by
 *    `withOrgContext`-keyed tables (research_notes, portfolio_positions, …).
 * 2. Adds a `memberships` row tying the demo user to that org.
 * 3. Seeds a small handful of agents, research notes and an inbox run so
 *    the dashboard / agents page / research notebook / inbox don't render
 *    empty states on first load.
 *
 * Every step uses `ON CONFLICT DO NOTHING` (or a SELECT-then-INSERT) so the
 * function is safe to run on every server boot and on first request from
 * the lazy initialiser. It runs through the privileged `db` pool so it can
 * INSERT before any `withOrgContext` block has bound the RLS GUC.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  DEMO_USER_ID,
  DEMO_ORG_ID,
  DEMO_ORG_LOCAL_UUID,
  DEMO_ORG_NAME,
} from "./open-mode";

let bootstrapPromise: Promise<void> | null = null;

/**
 * Lazily ensures the demo workspace exists. Repeated calls share the same
 * in-flight promise so concurrent first requests collapse into a single
 * database roundtrip; subsequent calls are no-ops once it has resolved.
 */
export function ensureDemoData(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().catch((err) => {
      // Don't poison the cache on transient failure — let the next request retry.
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

async function bootstrap(): Promise<void> {
  // 1) Demo organisation row at the fixed UUID. The unique constraint is on
  //    `slug`, so we key the upsert on slug = DEMO_ORG_ID. The id column is
  //    forced to the DEMO_ORG_LOCAL_UUID so withOrgContext-keyed tables resolve
  //    to the same UUID consistently.
  await db.execute(sql`
    INSERT INTO organizations (id, name, slug)
    VALUES (${DEMO_ORG_LOCAL_UUID}::uuid, ${DEMO_ORG_NAME}, ${DEMO_ORG_ID})
    ON CONFLICT (slug) DO NOTHING
  `);

  // 2) Membership row tying the demo user to the demo org as owner.
  //    `memberships_org_user_uniq` is a unique index on (org_id, user_id) —
  //    target it via the column list rather than the constraint name.
  await db.execute(sql`
    INSERT INTO memberships (org_id, user_id, role)
    VALUES (${DEMO_ORG_LOCAL_UUID}::uuid, ${DEMO_USER_ID}, 'owner')
    ON CONFLICT (org_id, user_id) DO NOTHING
  `);

  // 3) Seed agents (Clerk-text-id-keyed table → uses DEMO_ORG_ID).
  const agentSeeds = [
    {
      name: "NVDA Earnings Watch",
      status: "Scheduled" as const,
      templateSlug: "earnings-prep",
      category: "Earnings" as const,
      icon: "◉",
      schedule: { frequency: "Weekly", day: "Mon", time: "7:00 AM", timezone: "ET" },
      instructions:
        "Track NVDA pre-earnings setup: consensus, KPIs, guidance walk, top Street questions.",
    },
    {
      name: "Hyperscaler Capex Tracker",
      status: "Running" as const,
      templateSlug: "competitive-tracking",
      category: "Competitive" as const,
      icon: "◳",
      schedule: { frequency: "Daily", time: "8:30 AM", timezone: "ET" },
      instructions:
        "Watch AAPL, MSFT, GOOGL, META and AMZN for capex commentary and product launches.",
    },
    {
      name: "Macro Daily Brief",
      status: "Scheduled" as const,
      templateSlug: "macro-daily",
      category: "Macro" as const,
      icon: "◷",
      schedule: { frequency: "Daily", time: "6:30 AM", timezone: "ET" },
      instructions: "Summarise overnight macro: rates, FX, commodities, central bank flow.",
    },
  ];
  for (const a of agentSeeds) {
    await db.execute(sql`
      INSERT INTO agents (org_id, author_user_id, name, status, template_slug, category, icon, schedule, instructions)
      SELECT ${DEMO_ORG_ID}, ${DEMO_USER_ID}, ${a.name}, ${a.status}, ${a.templateSlug}, ${a.category}, ${a.icon}, ${JSON.stringify(a.schedule)}::jsonb, ${a.instructions}
      WHERE NOT EXISTS (
        SELECT 1 FROM agents WHERE org_id = ${DEMO_ORG_ID} AND name = ${a.name}
      )
    `);
  }

  // 4) Seed an inbox run so the agents inbox doesn't look empty.
  const sampleRunHeadline = "NVDA: Data Center revenue +18% QoQ; guide above Street";
  const existingRun = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM agent_runs WHERE org_id = ${DEMO_ORG_ID}
  `);
  const runCount = existingRun.rows[0]?.n ?? 0;
  if (runCount === 0) {
    // Pick the first seeded agent to attach the run to.
    interface AgentLookupRow {
      id: string;
      name: string;
      category: string;
      icon: string;
    }
    const agentRow = await db.execute<AgentLookupRow>(sql`
      SELECT id, name, category, icon FROM agents
       WHERE org_id = ${DEMO_ORG_ID} AND name = ${agentSeeds[0].name}
       LIMIT 1
    `);
    const agent: AgentLookupRow | undefined = agentRow.rows[0];
    if (agent) {
      await db.execute(sql`
        INSERT INTO agent_runs (org_id, agent_id, agent_name, category, icon, triggered_by, triggered_by_user_id, headline, summary, findings, sources, run_status)
        VALUES (
          ${DEMO_ORG_ID}, ${agent.id}::uuid, ${agent.name}, ${agent.category}, ${agent.icon},
          'scheduled', ${DEMO_USER_ID},
          ${sampleRunHeadline},
          'NVDA reported strong Q1: Data Center +18% QoQ on Hopper / Blackwell ramp; guide $26B vs $24.6B Street.',
          ${JSON.stringify([
            { title: "Data Center revenue", detail: "$22.6B (+18% QoQ, +427% YoY) — Hopper + Blackwell mix" },
            { title: "Gross margin", detail: "78.4% non-GAAP, +200bps QoQ on mix shift" },
            { title: "Q2 guide", detail: "$26B ± 2% revenue, ahead of $24.6B consensus" },
          ])}::jsonb,
          ${JSON.stringify([
            { label: "NVDA Q1 FY25 transcript", meta: "May 22, 2025" },
            { label: "NVDA 8-K filing", meta: "SEC EDGAR" },
          ])}::jsonb,
          'ok'
        )
      `);
    }
  }

  // 5) Seed a couple of research notes (UUID-keyed table → uses DEMO_ORG_LOCAL_UUID).
  const noteSeeds = [
    {
      title: "[NVDA] Hopper → Blackwell ramp thesis",
      body:
        "Blackwell ramp materially de-risked: TSMC CoWoS-L capacity tripling H2'25, Microsoft + Meta orders confirmed.\n\nWatch: HBM3e supply, networking attach, Sovereign AI pipeline.",
    },
    {
      title: "[AAPL] Services growth durability",
      body:
        "Services 27% of revenue, +14% YoY. App Store + advertising leading. Watch DOJ ruling impact on default search payments from GOOGL.",
    },
  ];
  for (const n of noteSeeds) {
    await db.execute(sql`
      INSERT INTO research_notes (org_id, author_user_id, title, body)
      SELECT ${DEMO_ORG_LOCAL_UUID}::uuid, ${DEMO_USER_ID}, ${n.title}, ${n.body}
      WHERE NOT EXISTS (
        SELECT 1 FROM research_notes WHERE org_id = ${DEMO_ORG_LOCAL_UUID}::uuid AND title = ${n.title}
      )
    `);
  }
}
