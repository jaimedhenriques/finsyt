/**
 * Contract test for the SSE `tool_result` payload that /api/agent/ask
 * emits per tool round-trip. The Research page's "Data sources used"
 * footer reads `provider`, `responseMs`, and `name` directly via
 * `traceFromToolResult`; if the route ever stops emitting one of these
 * the footer silently breaks. These specs lock the shape of the helper
 * the route now delegates to so a regression flips a red test.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildAgentToolResultPayload } from "../agent-tool-result-payload";

const noopSummarise = (_name: string, _out: unknown) => "summary";

test("buildAgentToolResultPayload — emits provider from out.source string", () => {
  const payload = buildAgentToolResultPayload({
    id: "call_1",
    name: "get_quote",
    out: { source: "FMP / EODHD", symbol: "NVDA", price: 950.12 },
    responseMs: 240,
    summarise: (n, o) =>
      `${(o as { symbol: string }).symbol} via ${n}`,
  });

  assert.equal(payload.id, "call_1");
  assert.equal(payload.name, "get_quote");
  assert.equal(payload.ok, true);
  assert.equal(payload.summary, "NVDA via get_quote");
  assert.equal(payload.provider, "FMP / EODHD");
  assert.equal(payload.responseMs, 240);
  assert.equal(typeof payload.responseMs, "number");
  assert.match(payload.raw, /"symbol":"NVDA"/);
});

test("buildAgentToolResultPayload — provider undefined when out.source is missing/non-string", () => {
  const noSource = buildAgentToolResultPayload({
    id: "x",
    name: "get_news",
    out: { articles: [] },
    responseMs: 11,
    summarise: noopSummarise,
  });
  assert.equal(noSource.provider, undefined);

  const numericSource = buildAgentToolResultPayload({
    id: "x",
    name: "get_news",
    out: { source: 42, articles: [] },
    responseMs: 11,
    summarise: noopSummarise,
  });
  assert.equal(numericSource.provider, undefined);
});

test("buildAgentToolResultPayload — providerOverride wins over out.source", () => {
  const payload = buildAgentToolResultPayload({
    id: "memo-1",
    name: "assemble_memo_data",
    out: { source: "ignored", ticker: "NVDA" },
    responseMs: 1234,
    summarise: () => "NVDA · 6/6 sections populated",
    providerOverride: "Finsyt memo assembler",
  });
  assert.equal(payload.provider, "Finsyt memo assembler");
});

test("buildAgentToolResultPayload — empty providerOverride falls back to out.source", () => {
  const payload = buildAgentToolResultPayload({
    id: "x",
    name: "get_quote",
    out: { source: "Yahoo Finance" },
    responseMs: 1450,
    summarise: noopSummarise,
    providerOverride: "",
  });
  assert.equal(payload.provider, "Yahoo Finance");
});

test("buildAgentToolResultPayload — ok=false when out.error is set, true otherwise", () => {
  const failing = buildAgentToolResultPayload({
    id: "x",
    name: "get_quote",
    out: { error: "rate limited", source: "FMP" },
    responseMs: 50,
    summarise: () => "rate limited",
  });
  assert.equal(failing.ok, false);
  assert.equal(failing.provider, "FMP");

  const ok = buildAgentToolResultPayload({
    id: "x",
    name: "get_quote",
    out: { source: "FMP", price: 1 },
    responseMs: 50,
    summarise: () => "ok",
  });
  assert.equal(ok.ok, true);
});

test("buildAgentToolResultPayload — ok=true when out is null/undefined", () => {
  const nul = buildAgentToolResultPayload({
    id: "x",
    name: "noop",
    out: null,
    responseMs: 0,
    summarise: () => "noop",
  });
  assert.equal(nul.ok, true);
  assert.equal(nul.provider, undefined);
  assert.equal(nul.raw, "null");

  const undef = buildAgentToolResultPayload({
    id: "x",
    name: "noop",
    out: undefined,
    responseMs: 0,
    summarise: () => "noop",
  });
  assert.equal(undef.ok, true);
  assert.equal(undef.raw, "null");
});

test("buildAgentToolResultPayload — raw truncates to default 6000 chars", () => {
  const huge = { source: "FMP", blob: "x".repeat(10_000) };
  const payload = buildAgentToolResultPayload({
    id: "x",
    name: "get_quote",
    out: huge,
    responseMs: 12,
    summarise: noopSummarise,
  });
  assert.equal(payload.raw.length, 6000);
});

test("buildAgentToolResultPayload — raw truncates to custom rawMaxLen", () => {
  const huge = { source: "FMP", blob: "x".repeat(2000) };
  const payload = buildAgentToolResultPayload({
    id: "memo-1",
    name: "assemble_memo_data",
    out: huge,
    responseMs: 12,
    summarise: noopSummarise,
    providerOverride: "Finsyt memo assembler",
    rawMaxLen: 600,
  });
  assert.equal(payload.raw.length, 600);
});

test("buildAgentToolResultPayload — unserialisable payloads do not throw", () => {
  const cyclic: Record<string, unknown> = { source: "FMP" };
  cyclic.self = cyclic;
  const payload = buildAgentToolResultPayload({
    id: "x",
    name: "get_quote",
    out: cyclic,
    responseMs: 1,
    summarise: () => "cyclic",
  });
  assert.equal(payload.ok, true);
  assert.equal(payload.provider, "FMP");
  assert.equal(payload.raw, '"[unserialisable]"');
});

test("buildAgentToolResultPayload — preserves all fields the footer/appendix consume", () => {
  // Lock the exact key set the SSE event ships with so the client-side
  // `traceFromToolResult` mapper never sees a missing field silently.
  const payload = buildAgentToolResultPayload({
    id: "call_42",
    name: "get_filings",
    out: { source: "EDGAR", filings: [{ form: "10-K" }] },
    responseMs: 312,
    summarise: (_n, o) => `${(o as { filings: unknown[] }).filings.length} filings`,
  });
  assert.deepEqual(Object.keys(payload).sort(), [
    "id",
    "name",
    "ok",
    "provider",
    "raw",
    "responseMs",
    "summary",
  ]);
});
