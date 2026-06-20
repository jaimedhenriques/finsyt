import "server-only";

import {
  withClerkContext,
  withOrgContext,
  workflowsTable,
  workflowRunsTable,
  researchNotesTable,
  type WorkflowGraph,
  type WorkflowNode,
  type WorkflowNodeResult,
} from "@workspace/db";
import { eq } from "drizzle-orm";

import { resolveLocalOrgId } from "../org-resolver";
import { massiveQuote, yahooQuote, alphaQuote, massiveNews, massiveFinancials } from "../data-providers";
import { worldbankFetchSeries } from "../worldbank-provider";
import { executeAgent } from "../agent-executor";
import { executeConnectionOperation } from "../connectors/executor";
import { upsertNotification } from "../live-highlights";
import {
  renderDeck,
  deckSlideTitles,
  FINSYT_BRAND,
  type DeckSection,
  type DeckTemplate,
  type DataSourceUsed,
} from "../deck-service";
import { putMemo } from "../memo-store";
import { getNodeType } from "./catalog";

// ── Graph validation ─────────────────────────────────────────────────────────

export interface GraphValidationError {
  nodeId?: string;
  message: string;
}

export interface GraphValidationResult {
  ok: boolean;
  errors: GraphValidationError[];
}

/**
 * Validate a workflow graph before it can be saved/run:
 *   1. every node references a known catalog type
 *   2. all required fields are populated
 *   3. every required input port has at least one incoming edge
 *   4. edges reference existing nodes
 *   5. the graph is acyclic (DAG)
 */
export function validateGraph(graph: WorkflowGraph): GraphValidationResult {
  const errors: GraphValidationError[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));

  for (const node of graph.nodes) {
    const def = getNodeType(node.type);
    if (!def) {
      errors.push({ nodeId: node.id, message: `Unknown node type "${node.type}"` });
      continue;
    }
    for (const field of def.fields) {
      if (field.required) {
        const v = node.config?.[field.key];
        if (v === undefined || v === null || String(v).trim() === "") {
          errors.push({ nodeId: node.id, message: `${def.label}: "${field.label}" is required` });
        }
      }
    }
  }

  // Edge integrity
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push({ message: `Edge references missing source node "${edge.source}"` });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({ message: `Edge references missing target node "${edge.target}"` });
    }
  }

  // Required input ports must have an incoming edge
  const incoming = new Map<string, number>();
  for (const edge of graph.edges) {
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  for (const node of graph.nodes) {
    const def = getNodeType(node.type);
    if (!def) continue;
    const requiresInput = def.inputs.some((p) => p.required);
    if (requiresInput && !(incoming.get(node.id) ?? 0)) {
      errors.push({ nodeId: node.id, message: `${def.label} needs at least one connected input` });
    }
  }

  // Cycle detection
  if (hasCycle(graph)) {
    errors.push({ message: "Workflow contains a cycle — connections must form a DAG" });
  }

  return { ok: errors.length === 0, errors };
}

function hasCycle(graph: WorkflowGraph): boolean {
  return topoSort(graph).length !== graph.nodes.length;
}

/** Topological order of node ids (Kahn's algorithm). Empty on cycle. */
function topoSort(graph: WorkflowGraph): string[] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!indeg.has(e.target) || !adj.has(e.source)) continue;
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    adj.get(e.source)!.push(e.target);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if ((indeg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  return order;
}

// ── Per-node execution ───────────────────────────────────────────────────────

/** Normalised output of a single node, fed downstream and persisted. */
interface NodeExecOutput {
  /** Human-readable text threaded into downstream agent prompts / summaries. */
  text: string;
  /** Structured payload for downstream nodes + the UI. */
  data: unknown;
  sources: { label: string; meta: string }[];
}

interface ExecContext {
  orgId: string;
  userId: string;
  workflowId: string;
  outputs: Map<string, NodeExecOutput>;
}

function configString(node: WorkflowNode, key: string, fallback = ""): string {
  const v = node.config?.[key];
  return v === undefined || v === null ? fallback : String(v);
}

function configNumber(node: WorkflowNode, key: string, fallback: number): number {
  const v = node.config?.[key];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Resolved outputs of every node feeding into `node`, in edge order. */
function upstreamOutputs(graph: WorkflowGraph, node: WorkflowNode, ctx: ExecContext): NodeExecOutput[] {
  return graph.edges
    .filter((e) => e.target === node.id)
    .map((e) => ctx.outputs.get(e.source))
    .filter((v): v is NodeExecOutput => v !== undefined);
}

function joinText(values: NodeExecOutput[]): string {
  return values.map((v) => v.text).filter(Boolean).join("\n\n");
}

function asText(data: unknown): string {
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, 2);
}

/** First symbol-like value found among upstream node outputs, upper-cased. */
function upstreamSymbol(values: NodeExecOutput[]): string | null {
  for (const v of values) {
    const d = v.data as { symbol?: unknown } | null;
    if (d && typeof d === "object" && typeof d.symbol === "string" && d.symbol.trim()) {
      return d.symbol.trim().toUpperCase();
    }
  }
  return null;
}

async function executeNode(
  graph: WorkflowGraph,
  node: WorkflowNode,
  ctx: ExecContext,
): Promise<NodeExecOutput> {
  const upstream = upstreamOutputs(graph, node, ctx);

  switch (node.type) {
    // ── Sources ──────────────────────────────────────────────────────────────
    case "source.quote": {
      const symbol = configString(node, "symbol").toUpperCase();
      const quote =
        (await massiveQuote(symbol).catch(() => null)) ||
        (await yahooQuote(symbol).catch(() => null)) ||
        (await alphaQuote(symbol).catch(() => null));
      if (!quote) throw new Error(`No quote available for ${symbol}`);
      const text = `${symbol}: ${quote.price} (${quote.changePct >= 0 ? "+" : ""}${quote.changePct}%)`;
      return { text, data: quote, sources: [{ label: `${symbol} quote`, meta: String(quote.source ?? "") }] };
    }
    case "source.news": {
      const symbol = configString(node, "symbol").toUpperCase();
      const limit = configNumber(node, "limit", 8);
      const news = (await massiveNews(symbol, limit).catch(() => null)) ?? [];
      const list = Array.isArray(news) ? news.slice(0, limit) : [];
      const text = list
        .map((n: Record<string, unknown>) => `• ${n.title ?? n.headline ?? ""}`)
        .join("\n");
      return {
        text: text || `No recent news for ${symbol}`,
        data: { symbol, headlines: list },
        sources: [{ label: `${symbol} news`, meta: `${list.length} headlines` }],
      };
    }
    case "source.financials": {
      const symbol = configString(node, "symbol").toUpperCase();
      const period = configString(node, "period", "annual") === "quarterly" ? "quarterly" : "annual";
      const fin = (await massiveFinancials(symbol, period).catch(() => null)) ?? [];
      return {
        text: `${symbol} ${period} financials (${Array.isArray(fin) ? fin.length : 0} periods)`,
        data: { symbol, period, financials: fin },
        sources: [{ label: `${symbol} financials`, meta: period }],
      };
    }
    case "source.macro": {
      const country = configString(node, "country", "USA");
      const indicator = configString(node, "indicator", "NY.GDP.MKTP.KD.ZG");
      const series = await worldbankFetchSeries({ indicator, country });
      const latest = series.observations.filter((o) => o.value !== null).at(-1);
      return {
        text: `${country} ${indicator}: latest ${latest?.value ?? "n/a"} (${latest?.date ?? "—"})`,
        data: series,
        sources: [{ label: `World Bank ${indicator}`, meta: country }],
      };
    }
    case "source.connector": {
      const connectionId = configString(node, "connectionId");
      const operation = configString(node, "operation");
      let params: Record<string, unknown> | undefined;
      const raw = configString(node, "paramsJson").trim();
      if (raw) {
        try {
          params = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          throw new Error("Connector params is not valid JSON");
        }
      }
      const res = await executeConnectionOperation({
        orgId: ctx.orgId,
        connectionId,
        operation,
        params,
        actorId: ctx.userId,
      });
      if (!res.ok) throw new Error(res.error || `Connector call failed (${res.status})`);
      return {
        text: asText(res.data).slice(0, 4000),
        data: res.data,
        sources: [{ label: `Connector ${operation}`, meta: connectionId }],
      };
    }

    // ── Transforms ─────────────────────────────────────────────────────────────
    case "transform.filter": {
      const limit = configNumber(node, "limit", 5);
      const first = upstream[0];
      if (!first) return { text: "", data: null, sources: [] };
      let data: unknown = first.data;
      if (Array.isArray(first.data)) {
        data = first.data.slice(0, limit);
      } else if (first.data && typeof first.data === "object") {
        const out: Record<string, unknown> = { ...(first.data as Record<string, unknown>) };
        for (const [k, v] of Object.entries(out)) {
          if (Array.isArray(v)) out[k] = v.slice(0, limit);
        }
        data = out;
      }
      return { text: asText(data).slice(0, limit * 280), data, sources: first.sources };
    }
    case "transform.compare": {
      const title = configString(node, "title", "Comparison");
      const data = { title, items: upstream.map((u) => u.data) };
      return { text: `${title}\n\n${joinText(upstream)}`, data, sources: upstream.flatMap((u) => u.sources) };
    }
    case "transform.summarize": {
      const text = joinText(upstream);
      return { text, data: { merged: text }, sources: upstream.flatMap((u) => u.sources) };
    }

    // ── Agent ──────────────────────────────────────────────────────────────────
    case "agent.ask": {
      const prompt = configString(node, "prompt");
      const tickers = configString(node, "tickers")
        .split(/[,\s]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      const context = joinText(upstream);
      const instructions = context ? `${prompt}\n\nUPSTREAM CONTEXT:\n${context}` : prompt;
      const result = await executeAgent({
        agentName: "Workflow Agent",
        category: "workflow",
        instructions,
        tickers,
        orgId: ctx.orgId,
      });
      if (!result.ok) throw new Error(result.errorMessage || "Agent run failed");
      const text = `${result.headline}\n\n${result.summary}`;
      return { text, data: result, sources: result.sources ?? [] };
    }

    // ── Outputs ─────────────────────────────────────────────────────────────────
    case "output.notification": {
      const title = configString(node, "title", "Workflow notification");
      const body = joinText(upstream);
      const message = (body || title).slice(0, 500);
      const symbol = upstreamSymbol(upstream) ?? "WORKFLOW";
      // Persist into the same bell-notification store the live-highlights
      // engine uses, so the run surfaces in the in-app Notifications panel.
      const notif = await upsertNotification(ctx.orgId, {
        id: `workflow:${ctx.workflowId}:${node.id}:${Date.now()}`,
        kind: "workflow",
        symbol,
        event: title.slice(0, 200),
        callKey: `workflow:${ctx.workflowId}`,
        message,
        noteId: null,
        pinCount: null,
      });
      return {
        text: `Sent notification "${title}"${notif ? "" : " (delivery unavailable)"}`,
        data: { kind: "notification", notificationId: notif?.id ?? null, title, symbol, message },
        sources: upstream.flatMap((u) => u.sources),
      };
    }
    case "output.workspace": {
      const title = configString(node, "title", "Workflow output");
      const body = joinText(upstream);
      const localOrgId = await resolveLocalOrgId(ctx.orgId);
      let noteId: string | null = null;
      if (localOrgId) {
        noteId = await withOrgContext(localOrgId, async (orgTx) => {
          const [note] = await orgTx
            .insert(researchNotesTable)
            .values({
              orgId: localOrgId,
              authorUserId: ctx.userId,
              title: title.slice(0, 200),
              body,
            })
            .returning({ id: researchNotesTable.id });
          return note.id;
        });
      }
      return {
        text: `Saved note "${title}"${noteId ? "" : " (notebook unavailable)"}`,
        data: { kind: "note", noteId, title },
        sources: upstream.flatMap((u) => u.sources),
      };
    }
    case "output.deck": {
      const title = configString(node, "title", "Workflow deck");
      const symbol = upstreamSymbol(upstream) ?? "WORKFLOW";
      const asOf = new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });

      // Build a generic deck from upstream outputs and render a real PPTX via
      // the shared deck service, then persist it to App Storage with putMemo.
      const sections: DeckSection[] = [
        { type: "title", data: { title, eyebrow: "Finsyt Workflow", subtitle: asOf } },
      ];
      upstream.forEach((u, i) => {
        const d = u.data as { headline?: string; summary?: string } | null;
        const sectionTitle =
          d && typeof d === "object" && typeof d.headline === "string" && d.headline.trim()
            ? d.headline.trim()
            : `Section ${i + 1}`;
        const raw =
          d && typeof d === "object" && typeof d.summary === "string" && d.summary.trim()
            ? d.summary
            : u.text;
        const bullets = raw
          .split(/\n+/)
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter(Boolean)
          .slice(0, 8);
        sections.push({
          type: "executive-summary",
          data: {
            title: sectionTitle.slice(0, 120),
            bullets: bullets.length ? bullets : ["(no content)"],
          },
        });
      });

      const dataSources: DataSourceUsed[] = upstream.flatMap((u) =>
        u.sources.map((s) => ({ name: s.label, category: "provider" as const, detail: s.meta })),
      );
      if (dataSources.length) {
        sections.push({ type: "sources-used", data: { sources: dataSources } });
      }

      const template: DeckTemplate = {
        templateId: "workflow-brief",
        context: {
          brand: FINSYT_BRAND,
          cover: { eyebrow: "Finsyt Workflow", title, asOf },
          asOf,
          footerLine: "Sources: Finsyt workflow run.",
          dataSources,
        },
        sections,
        meta: { title, author: "Finsyt Agent", subject: symbol },
      };

      const buffer = await renderDeck(template);
      const titles = deckSlideTitles(template);
      const filename = `${title}.pptx`.replace(/[\\/:*?"<>|]/g, "_");
      const { fileId, expiresAt, bytes } = await putMemo({
        buffer,
        filename,
        ticker: symbol,
        userId: ctx.userId,
        slides: titles.length,
      });
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
      const downloadUrl = `${basePath}/api/copilot/memo/${fileId}`;

      return {
        text: `Generated deck "${title}" (${titles.length} slides) — ${downloadUrl}`,
        data: { kind: "deck", fileId, downloadUrl, filename, bytes, expiresAt, slideTitles: titles },
        sources: upstream.flatMap((u) => u.sources),
      };
    }

    default:
      throw new Error(`Unsupported node type "${node.type}"`);
  }
}

// ── Run orchestration ────────────────────────────────────────────────────────

export interface RunWorkflowArgs {
  orgId: string;
  userId: string;
  workflowId: string;
  triggeredBy?: "manual" | "scheduled";
}

export interface RunWorkflowResult {
  runId: string;
  status: "ok" | "error";
  nodeResults: WorkflowNodeResult[];
  errorMessage?: string;
}

/**
 * Execute a stored workflow once. Loads the graph under the caller's Clerk
 * context, validates it, runs nodes in topological order, and persists a
 * `workflow_runs` row with per-node status/output. Node failures are isolated:
 * a failed node marks the run errored, downstream dependants are skipped, and
 * independent branches still complete.
 */
export async function runWorkflow(args: RunWorkflowArgs): Promise<RunWorkflowResult> {
  const { orgId, userId, workflowId, triggeredBy = "manual" } = args;

  const wf = await withClerkContext(orgId, userId, async (tx) => {
    const [row] = await tx.select().from(workflowsTable).where(eq(workflowsTable.id, workflowId)).limit(1);
    return row ?? null;
  });
  if (!wf) throw new Error("Workflow not found");

  const graph = wf.graph as WorkflowGraph;
  const validation = validateGraph(graph);
  if (!validation.ok) {
    throw new Error(`Workflow is invalid: ${validation.errors.map((e) => e.message).join("; ")}`);
  }

  const startedAt = Date.now();
  const ctx: ExecContext = { orgId, userId, workflowId, outputs: new Map() };
  const order = topoSort(graph);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const failed = new Set<string>();
  const nodeResults: WorkflowNodeResult[] = [];

  const labelFor = (node: WorkflowNode) => node.label || getNodeType(node.type)?.label || node.type;

  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    if (!node) continue;

    // Skip if any upstream dependency failed.
    const deps = graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
    if (deps.some((d) => failed.has(d))) {
      failed.add(nodeId);
      nodeResults.push({
        nodeId,
        type: node.type,
        label: labelFor(node),
        status: "skipped",
        text: "Skipped — an upstream node failed",
        sources: [],
        latencyMs: 0,
      });
      continue;
    }

    const t0 = Date.now();
    try {
      const out = await executeNode(graph, node, ctx);
      ctx.outputs.set(nodeId, out);
      nodeResults.push({
        nodeId,
        type: node.type,
        label: labelFor(node),
        status: "ok",
        text: out.text,
        data: out.data,
        sources: out.sources,
        latencyMs: Date.now() - t0,
      });
    } catch (err) {
      failed.add(nodeId);
      nodeResults.push({
        nodeId,
        type: node.type,
        label: labelFor(node),
        status: "error",
        text: "",
        sources: [],
        errorMessage: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - t0,
      });
    }
  }

  const status: "ok" | "error" = failed.size === 0 ? "ok" : "error";
  const errorMessage =
    status === "error"
      ? nodeResults.find((r) => r.status === "error")?.errorMessage ?? "One or more nodes failed"
      : undefined;
  const latencyMs = Date.now() - startedAt;

  const runId = await withClerkContext(orgId, userId, async (tx) => {
    const [run] = await tx
      .insert(workflowRunsTable)
      .values({
        orgId,
        workflowId,
        workflowName: wf.name,
        triggeredBy,
        triggeredByUserId: userId,
        runStatus: status,
        nodeResults: nodeResults as unknown as object,
        errorMessage: errorMessage ?? null,
        latencyMs,
        completedAt: new Date(),
      })
      .returning({ id: workflowRunsTable.id });

    await tx
      .update(workflowsTable)
      .set({ lastRunAt: new Date(), updatedAt: new Date() })
      .where(eq(workflowsTable.id, workflowId));

    return run.id;
  });

  return { runId, status, nodeResults, errorMessage };
}
