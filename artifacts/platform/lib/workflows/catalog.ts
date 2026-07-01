// ── Workflow node catalog ────────────────────────────────────────────────────
// Fixed, safe catalog of node types for the visual workflow editor. Shared
// between the canvas UI and the server-side DAG executor — keep this pure TS
// (no `server-only`, no Node-only imports) so it can be bundled into the
// client.
//
// Every node belongs to one of four categories that form the natural left→right
// flow of a pipeline: data source → transform → AI agent → output. Each node
// declares typed input/output ports plus a set of configurable fields rendered
// in the properties panel.

export type NodeCategory = "source" | "transform" | "agent" | "output";

export type FieldType = "text" | "ticker" | "number" | "select" | "longtext";

export interface NodeField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: string | number;
  helpText?: string;
}

export interface NodePort {
  key: string;
  label: string;
  /** Required input ports must have at least one incoming edge before a run. */
  required?: boolean;
}

export interface NodeTypeDef {
  type: string;
  category: NodeCategory;
  label: string;
  icon: string;
  description: string;
  inputs: NodePort[];
  outputs: NodePort[];
  fields: NodeField[];
}

const OUT: NodePort[] = [{ key: "out", label: "Output" }];
const IN_REQUIRED: NodePort[] = [{ key: "in", label: "Input", required: true }];

export const NODE_TYPES: NodeTypeDef[] = [
  // ── Data sources ──────────────────────────────────────────────────────────
  {
    type: "source.quote",
    category: "source",
    label: "Quote",
    icon: "💹",
    description: "Live price snapshot for a ticker via the provider waterfall.",
    inputs: [],
    outputs: OUT,
    fields: [
      { key: "symbol", label: "Ticker", type: "ticker", required: true, placeholder: "AAPL" },
    ],
  },
  {
    type: "source.news",
    category: "source",
    label: "News",
    icon: "📰",
    description: "Latest headlines for a ticker.",
    inputs: [],
    outputs: OUT,
    fields: [
      { key: "symbol", label: "Ticker", type: "ticker", required: true, placeholder: "AAPL" },
      { key: "limit", label: "Headlines", type: "number", defaultValue: 8 },
    ],
  },
  {
    type: "source.financials",
    category: "source",
    label: "Financials",
    icon: "📊",
    description: "Income statement / financials for a ticker.",
    inputs: [],
    outputs: OUT,
    fields: [
      { key: "symbol", label: "Ticker", type: "ticker", required: true, placeholder: "AAPL" },
      {
        key: "period",
        label: "Period",
        type: "select",
        options: ["annual", "quarterly"],
        defaultValue: "annual",
      },
    ],
  },
  {
    type: "source.macro",
    category: "source",
    label: "Macro",
    icon: "🌐",
    description: "World Bank macro series for a country + indicator.",
    inputs: [],
    outputs: OUT,
    fields: [
      { key: "country", label: "Country (ISO-3)", type: "text", defaultValue: "USA", placeholder: "USA" },
      {
        key: "indicator",
        label: "Indicator code",
        type: "text",
        defaultValue: "NY.GDP.MKTP.KD.ZG",
        helpText: "World Bank indicator code, e.g. NY.GDP.MKTP.KD.ZG (GDP growth).",
      },
    ],
  },
  {
    type: "source.connector",
    category: "source",
    label: "Connector",
    icon: "🔌",
    description: "Call a connected REST/MCP operation from the Connector Hub.",
    inputs: [],
    outputs: OUT,
    fields: [
      { key: "connectionId", label: "Connection ID", type: "text", required: true, helpText: "From /app/connectors." },
      { key: "operation", label: "Operation", type: "text", required: true, placeholder: "list_items" },
      { key: "paramsJson", label: "Params (JSON)", type: "longtext", placeholder: '{ "ticker": "AAPL" }' },
    ],
  },

  // ── Transforms ──────────────────────────────────────────────────────────────
  {
    type: "transform.filter",
    category: "transform",
    label: "Filter / Trim",
    icon: "🔻",
    description: "Trim upstream output to the first N items / characters.",
    inputs: IN_REQUIRED,
    outputs: OUT,
    fields: [
      { key: "limit", label: "Keep first N", type: "number", defaultValue: 5 },
    ],
  },
  {
    type: "transform.compare",
    category: "transform",
    label: "Compare",
    icon: "⚖️",
    description: "Combine two or more upstream outputs into a comparison block.",
    inputs: [{ key: "in", label: "Inputs", required: true }],
    outputs: OUT,
    fields: [
      { key: "title", label: "Comparison title", type: "text", placeholder: "Peer comparison" },
    ],
  },
  {
    type: "transform.summarize",
    category: "transform",
    label: "Merge context",
    icon: "🧩",
    description: "Concatenate all upstream outputs into one context block.",
    inputs: [{ key: "in", label: "Inputs", required: true }],
    outputs: OUT,
    fields: [],
  },

  // ── AI agent ──────────────────────────────────────────────────────────────
  {
    type: "agent.ask",
    category: "agent",
    label: "AI Agent",
    icon: "🤖",
    description: "Run a Finsyt agent prompt, grounded with upstream context.",
    inputs: [{ key: "context", label: "Context", required: false }],
    outputs: [{ key: "result", label: "Result" }],
    fields: [
      { key: "prompt", label: "Prompt", type: "longtext", required: true, placeholder: "Summarise the key risks for {{symbol}}…" },
      { key: "tickers", label: "Tickers (optional)", type: "text", placeholder: "AAPL, MSFT" },
    ],
  },

  // ── Outputs ──────────────────────────────────────────────────────────────
  {
    type: "output.notification",
    category: "output",
    label: "Notification",
    icon: "🔔",
    description: "Record a workspace notification with the upstream result.",
    inputs: IN_REQUIRED,
    outputs: [],
    fields: [
      { key: "title", label: "Title", type: "text", placeholder: "Daily brief ready" },
    ],
  },
  {
    type: "output.workspace",
    category: "output",
    label: "Save to Notebook",
    icon: "📓",
    description: "Persist the upstream result as a research note.",
    inputs: IN_REQUIRED,
    outputs: [],
    fields: [
      { key: "title", label: "Note title", type: "text", placeholder: "Workflow output" },
    ],
  },
  {
    type: "output.deck",
    category: "output",
    label: "Deck outline",
    icon: "🖼️",
    description: "Compose a slide outline from upstream agent outputs.",
    inputs: IN_REQUIRED,
    outputs: [],
    fields: [
      { key: "title", label: "Deck title", type: "text", placeholder: "Workflow deck" },
    ],
  },
];

export const NODE_TYPE_MAP: Record<string, NodeTypeDef> = Object.fromEntries(
  NODE_TYPES.map((n) => [n.type, n]),
);

export function getNodeType(type: string): NodeTypeDef | undefined {
  return NODE_TYPE_MAP[type];
}

export const CATEGORY_META: Record<NodeCategory, { label: string; color: string }> = {
  source: { label: "Data sources", color: "#3b82f6" },
  transform: { label: "Transforms", color: "#a855f7" },
  agent: { label: "AI agents", color: "#22c55e" },
  output: { label: "Outputs", color: "#f59e0b" },
};
