/**
 * SSE `tool_result` event payload contract for /api/agent/ask.
 *
 * The Research page's "Data sources used" footer (and the matching deck
 * appendix slide) consume these fields directly via `traceFromToolResult`.
 * Silent removal of `provider` or `responseMs` here breaks the footer
 * with no compile-time signal, so the shape is locked down by
 * `__tests__/agent-tool-result-payload.test.ts`.
 */
export interface AgentToolResultPayload {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
  /**
   * Human-readable upstream provider label ("FMP / EODHD",
   * "Yahoo Finance", "Finsyt memo assembler", ...). Surfaced as a chip
   * in the footer and as the appendix-slide row label. `undefined` when
   * the upstream payload omits a `source` string and no override was
   * passed; the client falls back to inspecting `raw` in that case.
   */
  provider: string | undefined;
  /** Tool round-trip in ms, used for the footer's response-time pill. */
  responseMs: number;
  /** Truncated JSON serialisation of the upstream payload. */
  raw: string;
}

export interface BuildAgentToolResultPayloadOpts {
  id: string;
  name: string;
  out: unknown;
  responseMs: number;
  summarise: (name: string, out: unknown) => string;
  /**
   * Hardcoded provider label (used for synthetic tools like
   * `assemble_memo_data` where there is no upstream `source`). When
   * omitted, the helper derives `provider` from `out.source` if it's a
   * string, otherwise leaves it `undefined`.
   */
  providerOverride?: string;
  /** Maximum length of the serialised `raw` payload. */
  rawMaxLen?: number;
}

const DEFAULT_RAW_MAX = 6000;

/**
 * Build the `tool_result` SSE event payload that /api/agent/ask emits.
 *
 * Pure, side-effect-free, and deliberately tiny so the Research footer's
 * server-side contract can be asserted in unit tests without booting the
 * full Next.js route or the OpenAI client.
 */
export function buildAgentToolResultPayload(
  opts: BuildAgentToolResultPayloadOpts,
): AgentToolResultPayload {
  const { id, name, out, responseMs, summarise, providerOverride, rawMaxLen } = opts;
  const o = out as { error?: unknown; source?: unknown } | null | undefined;

  let provider: string | undefined;
  if (typeof providerOverride === "string" && providerOverride.length > 0) {
    provider = providerOverride;
  } else if (o && typeof o.source === "string") {
    provider = o.source;
  }

  let raw: string;
  try {
    raw = JSON.stringify(out ?? null);
  } catch {
    raw = '"[unserialisable]"';
  }
  const cap = rawMaxLen ?? DEFAULT_RAW_MAX;
  if (raw.length > cap) raw = raw.slice(0, cap);

  return {
    id,
    name,
    ok: !o?.error,
    summary: summarise(name, out),
    provider,
    responseMs,
    raw,
  };
}
