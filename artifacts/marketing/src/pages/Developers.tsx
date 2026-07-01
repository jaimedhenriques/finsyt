import React from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Code2,
  Plug,
  Zap,
  Globe,
  Terminal,
  ChevronRight,
  ExternalLink,
  Bot,
  Network,
  Shield,
  FileCode,
  Database,
  TrendingUp,
  Building2,
  Newspaper,
  BarChart3,
  Mic,
  LineChart,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const STAGGER: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const AI_CLIENTS = [
  {
    name: "Claude",
    maker: "Anthropic",
    badge: "MCP Native",
    badgeColor: "text-violet-700 bg-violet-500/10",
    description:
      "Claude Desktop connects to the Finsyt MCP server in one step. Ask Claude to pull a DCF, run a peer comparison, or summarise filings — it calls Finsyt tools directly.",
    steps: [
      'Add the Finsyt MCP entry to claude_desktop_config.json under "mcpServers".',
      "Restart Claude Desktop.",
      'Ask: "What\'s NVDA\'s free cash flow for the last four quarters?"',
    ],
  },
  {
    name: "ChatGPT / GPT-4o",
    maker: "OpenAI",
    badge: "REST + Tools",
    badgeColor: "text-green-700 bg-green-500/10",
    description:
      "Wire the Finsyt public REST surface into a Custom GPT or Assistants API integration and surface structured financial data as function-callable tools.",
    steps: [
      "Add /api/v1 as an Actions schema in your Custom GPT settings.",
      "Set your Finsyt API key in the Authentication header.",
      "ChatGPT calls your configured endpoints as tool calls mid-conversation.",
    ],
  },
  {
    name: "Perplexity",
    maker: "Perplexity AI",
    badge: "REST",
    badgeColor: "text-blue-700 bg-blue-500/10",
    description:
      "Augment Perplexity Pro searches with live structured data from Finsyt — quotes, filings, estimates, and macro indicators — via the v1 REST API.",
    steps: [
      "Call /api/v1/quote, /api/v1/financials, or /api/v1/news from your Perplexity workflow.",
      "Each response includes a source attribution field for transparency.",
      "Chain results back into your Perplexity prompt for synthesis.",
    ],
  },
  {
    name: "Copilot for Excel",
    maker: "Microsoft",
    badge: "REST + Add-in",
    badgeColor: "text-emerald-700 bg-emerald-500/10",
    description:
      "The Finsyt Excel add-in pushes normalised financial tables directly into your model — formulas intact, every cell traceable. Copilot for Excel can then reason over the live data in situ.",
    steps: [
      "Install the Finsyt Excel add-in from the Microsoft AppSource.",
      "Authenticate with your Finsyt workspace credentials.",
      'Ask Copilot: "Populate column B with NVDA\'s last 8 quarters of revenue from Finsyt."',
    ],
  },
];

const MCP_TOOLS = [
  { icon: TrendingUp, name: "get_quote", desc: "Real-time and delayed quotes with bid/ask, volume, and after-hours data." },
  { icon: BarChart3, name: "get_financials", desc: "Income statement, balance sheet, and cash flow across any period." },
  { icon: LineChart, name: "get_estimates", desc: "Analyst consensus estimates, revisions, and surprise history." },
  { icon: Newspaper, name: "get_news", desc: "Company-specific and macro news with sentiment scoring." },
  { icon: FileCode, name: "get_filings", desc: "SEC EDGAR 10-K, 10-Q, 8-K, and proxy filings — full text searchable." },
  { icon: Mic, name: "get_transcripts", desc: "Earnings call transcripts aligned by speaker turn and question cluster." },
  { icon: Globe, name: "get_macro", desc: "FRED, World Bank, and Census macro indicators in a single call." },
  { icon: Building2, name: "get_deals", desc: "M&A transaction history, deal terms, and premiums via FMP." },
  { icon: Database, name: "compare_peers", desc: "Structured peer comparison table with configurable metric columns." },
  { icon: BookOpen, name: "score_filing", desc: "AI-extracted risk and materiality score for any SEC filing." },
];

const REST_ENDPOINTS = [
  { method: "GET", path: "/api/v1/quote", desc: "Single-ticker quote" },
  { method: "GET", path: "/api/v1/financials", desc: "Financial statements" },
  { method: "GET", path: "/api/v1/news", desc: "Company news feed" },
  { method: "GET", path: "/api/v1/estimates", desc: "Analyst estimates" },
  { method: "GET", path: "/api/v1/census", desc: "U.S. Census / demographic data" },
  { method: "POST", path: "/api/agent/ask", desc: "Streaming agentic research (SSE)" },
  { method: "GET", path: "/api/mcp", desc: "MCP tool manifest (JSON-RPC 2.0)" },
];

export default function Developers() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={STAGGER}
          className="max-w-3xl"
        >
          <motion.div
            variants={FADE_UP}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6 tracking-wide"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            DEVELOPERS &amp; INTEGRATIONS
          </motion.div>

          <motion.h1
            variants={FADE_UP}
            className="text-5xl md:text-6xl font-display font-bold text-foreground mb-6 leading-[1.03] tracking-[-0.03em]"
          >
            MCP is the USB-C of AI finance.{" "}
            <span className="text-primary">Finsyt is the socket.</span>
          </motion.h1>

          <motion.p variants={FADE_UP} className="text-xl text-muted-foreground leading-relaxed mb-8">
            Finsyt runs a live MCP server — the emerging open protocol that lets every AI
            tool call structured financial data the same way USB-C lets every device charge
            from the same port. Claude, ChatGPT, Perplexity, and Copilot for Excel all plug
            in today, with zero custom integration work on your end.
          </motion.p>

          <motion.div variants={FADE_UP} className="flex flex-col sm:flex-row gap-4">
            <a href="/platform/app/connectors">
              <Button size="lg" className="h-12 px-6 text-base gap-2 font-semibold">
                <Plug className="w-4 h-4" /> Open Connector Hub
              </Button>
            </a>
            <a href="/api/v1" target="_blank" rel="noopener noreferrer">
              <Button size="lg" variant="outline" className="h-12 px-6 text-base font-semibold border-foreground/15 hover:bg-secondary gap-2">
                <ExternalLink className="w-4 h-4" /> REST API Reference
              </Button>
            </a>
          </motion.div>
        </motion.div>
      </section>

      {/* Agentic control plane pitch */}
      <section className="border-y border-border bg-muted/40 py-20 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-10">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="flex flex-col gap-4"
          >
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Network className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold">Agentic control plane</h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Finsyt acts as the orchestration layer that routes any agent's tool call to the
              right upstream data provider — FMP, FRED, SEC EDGAR, Census, and your own
              connected licences — and returns a single, attributed response. Your agent never
              talks to a dozen APIs; it talks to one.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="flex flex-col gap-4"
          >
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold">Federation, not replacement</h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Already paying for FactSet, Bloomberg, or Capital IQ? Finsyt federates over your
              existing licences through the Connector Hub — the same credentials, routed through
              the same MCP surface, with the same audit trail. No rip-and-replace.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col gap-4"
          >
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-display font-bold">Audited, cited, attributable</h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Every tool call from every AI client is logged, attributed to the upstream provider
              that answered it, and surfaced in the workspace audit trail. Compliance teams can
              trace any agent answer back to the exact API call that produced it.
            </p>
          </motion.div>
        </div>
      </section>

      {/* MCP tool reference */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div>
              <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">MCP TOOL REFERENCE</div>
              <h2 className="text-3xl font-display font-bold mb-4">
                10 tools. Every data domain covered.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                The Finsyt MCP server exposes a tool manifest at{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono border border-border">
                  /api/mcp
                </code>{" "}
                following the JSON-RPC 2.0 spec. Any MCP-compatible client discovers
                and calls these tools automatically — no manual schema work required.
              </p>
              <a href="/api/mcp" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2 border-foreground/15 hover:bg-secondary">
                  <Code2 className="w-4 h-4" /> View live tool manifest
                  <ExternalLink className="w-3.5 h-3.5 ml-1 text-muted-foreground" />
                </Button>
              </a>
            </div>

            <div className="grid gap-3">
              {MCP_TOOLS.map((tool, i) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: i * 0.04 }}
                  className="flex items-start gap-4 bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <tool.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-mono text-sm font-semibold text-foreground mb-0.5">
                      {tool.name}
                    </div>
                    <div className="text-sm text-muted-foreground leading-snug">{tool.desc}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI clients */}
      <section className="py-24 px-6 bg-muted/40 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">SUPPORTED AI CLIENTS</div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Plugs into every AI tool your firm already uses.
            </h2>
            <p className="text-lg text-muted-foreground">
              Connect once via MCP or REST. The same financial data surface is available in Claude,
              ChatGPT, Perplexity, and Copilot for Excel — with no per-tool re-integration.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {AI_CLIENTS.map((client, i) => (
              <motion.div
                key={client.name}
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-card border border-border rounded-2xl p-8 flex flex-col gap-6"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-display font-bold">{client.name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{client.maker}</p>
                  </div>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${client.badgeColor}`}>
                    {client.badge}
                  </span>
                </div>

                <p className="text-muted-foreground leading-relaxed">{client.description}</p>

                <ol className="space-y-3">
                  {client.steps.map((step, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">
                        {j + 1}
                      </span>
                      <span className="text-foreground leading-snug">{step}</span>
                    </li>
                  ))}
                </ol>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* REST API reference */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">PUBLIC REST API</div>
              <h2 className="text-3xl font-display font-bold mb-4">
                A clean v1 surface for direct integration.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                The Finsyt public REST API at{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono border border-border">
                  /api/v1
                </code>{" "}
                accepts an API key and returns structured JSON with a{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono border border-border">
                  source
                </code>{" "}
                attribution field on every response. No pagination surprises, no undocumented
                envelope changes. Build against it with confidence.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>API key auth via <code className="text-sm bg-muted px-1 py-0.5 rounded font-mono border border-border">Authorization: Bearer</code> header.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>Every response includes a <code className="text-sm bg-muted px-1 py-0.5 rounded font-mono border border-border">source</code> field naming the upstream provider.</span>
                </li>
                <li className="flex items-start gap-3">
                  <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <span>OpenAPI schema published at <code className="text-sm bg-muted px-1 py-0.5 rounded font-mono border border-border">/api/v1/openapi.json</code>.</span>
                </li>
              </ul>
              <a href="/api/v1" target="_blank" rel="noopener noreferrer">
                <Button className="gap-2">
                  <Terminal className="w-4 h-4" /> Open API Reference
                  <ExternalLink className="w-3.5 h-3.5 ml-1" />
                </Button>
              </a>
            </div>

            {/* REST endpoint list */}
            <div className="bg-[#0F111F] rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                <span className="ml-2 text-xs font-mono text-white/40">finsyt REST v1</span>
              </div>
              <div className="space-y-2">
                {REST_ENDPOINTS.map((ep) => (
                  <div
                    key={ep.path}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/5 transition-colors group"
                  >
                    <span
                      className={`shrink-0 w-10 text-center text-[10px] font-bold rounded px-1 py-0.5 font-mono ${
                        ep.method === "GET"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <code className="flex-1 text-sm font-mono text-white/80 group-hover:text-white transition-colors">
                      {ep.path}
                    </code>
                    <span className="text-xs text-white/40 hidden lg:block">{ep.desc}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 pt-4 border-t border-white/10 text-xs font-mono text-white/30">
                Base URL: https://finsyt.com · Auth: Bearer token
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MCP connection quickstart */}
      <section className="py-24 px-6 bg-muted/40 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Quickstart code */}
            <div className="bg-[#0F111F] rounded-2xl p-6 border border-white/10">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
                <span className="ml-2 text-xs font-mono text-white/40">claude_desktop_config.json</span>
              </div>
              <pre className="text-sm font-mono text-white/80 leading-relaxed overflow-x-auto whitespace-pre">{`{
  "mcpServers": {
    "finsyt": {
      "url": "https://finsyt.com/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}`}</pre>
              <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/30 font-mono">
                Works with Claude Desktop · cursor · any MCP-compatible client
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">QUICKSTART</div>
              <h2 className="text-3xl font-display font-bold mb-4">
                Up and running in 90 seconds.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-8">
                Add one JSON block to your AI client's MCP config, paste your Finsyt API key,
                restart the client — and every tool in the manifest is immediately callable.
                No SDK, no wrapper library, no webhook configuration.
              </p>
              <ol className="space-y-5 mb-8">
                {[
                  {
                    n: "01",
                    title: "Get your API key",
                    body: "Sign up or sign in to the Finsyt platform, then copy your API key from Account → Developer Settings.",
                  },
                  {
                    n: "02",
                    title: "Add the MCP entry",
                    body: 'Paste the JSON snippet into your AI client\'s MCP server config under "mcpServers". The URL is always https://finsyt.com/api/mcp.',
                  },
                  {
                    n: "03",
                    title: "Restart and ask",
                    body: 'Restart your AI client. Tools are auto-discovered. Try: "What are AAPL\'s last four quarters of free cash flow?"',
                  },
                ].map((step) => (
                  <li key={step.n} className="flex items-start gap-5">
                    <span className="font-display font-bold text-3xl text-primary leading-none shrink-0">
                      {step.n}
                    </span>
                    <div>
                      <div className="font-semibold text-foreground mb-1">{step.title}</div>
                      <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="flex gap-4">
                <a href="/platform/sign-up">
                  <Button className="gap-2">
                    Get API key <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
                <a href="/api/mcp" target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="gap-2 border-foreground/15 hover:bg-secondary">
                    <Code2 className="w-4 h-4" /> MCP manifest
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Connector Hub bridge */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-card border border-border rounded-2xl p-10 md:p-14 grid lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                <Bot className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-3xl font-display font-bold mb-4">
                The Connector Hub: your federation control plane.
              </h2>
              <p className="text-muted-foreground text-lg leading-relaxed mb-6">
                Beyond first-party data, the Connector Hub lets you wire any REST API or MCP server
                into the same surface — FactSet, Bloomberg, CapIQ, Refinitiv, or your own internal
                data lake. Every new connector you add is immediately callable from any AI client as
                an MCP tool named{" "}
                <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono border border-border">
                  conn__&lt;slug&gt;__&lt;op&gt;
                </code>
                . One integration, everywhere.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3 text-sm">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>~50 curated catalog tiles covering every major financial data provider.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Custom REST or MCP endpoints for proprietary or internal APIs.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>AES-256-GCM envelope encryption on every stored credential.</span>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <ChevronRight className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <span>Full audit log — who called what, when, and what the upstream returned.</span>
                </li>
              </ul>
              <div className="flex gap-4">
                <a href="/platform/app/connectors">
                  <Button className="gap-2">
                    <Plug className="w-4 h-4" /> Open Connector Hub
                  </Button>
                </a>
                <Link href="/solutions">
                  <Button variant="outline" className="gap-2 border-foreground/15 hover:bg-secondary">
                    See all solutions <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5 bg-muted/30 rounded-xl border border-border p-6 space-y-3">
              {[
                { slug: "conn__factset__quotes", label: "FactSet · Quotes", tag: "Premium" },
                { slug: "conn__fmp__financials", label: "FMP · Financials", tag: "Built-in" },
                { slug: "conn__fred__series", label: "FRED · Macro Series", tag: "Built-in" },
                { slug: "conn__spglobal__deals", label: "CapIQ · Deals", tag: "Premium" },
                { slug: "conn__apify__sec_filings", label: "Apify · SEC Filings", tag: "Alt Data" },
              ].map((item) => (
                <div
                  key={item.slug}
                  className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg px-4 py-3"
                >
                  <code className="text-xs font-mono text-muted-foreground truncate">
                    {item.slug}
                  </code>
                  <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded px-2 py-0.5 ${
                    item.tag === "Built-in"
                      ? "bg-blue-500/10 text-blue-700"
                      : item.tag === "Premium"
                      ? "bg-amber-500/10 text-amber-700"
                      : "bg-violet-500/10 text-violet-700"
                  }`}>
                    {item.tag}
                  </span>
                </div>
              ))}
              <div className="text-xs text-center text-muted-foreground pt-1">
                +45 more in the catalog · any REST or MCP endpoint via custom tile
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 pb-24">
        <div className="max-w-7xl mx-auto rounded-3xl bg-primary text-primary-foreground px-8 md:px-16 py-20 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 50%)",
            }}
          />
          <div className="relative max-w-3xl">
            <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.02em] leading-[1.05] mb-6">
              Let your AI tools call real financial data.
            </h2>
            <p className="text-lg md:text-xl text-primary-foreground/85 mb-10 leading-relaxed">
              Get an API key, add one JSON block, and your entire AI stack has access to
              quotes, financials, filings, transcripts, estimates, and macro data — all from
              the same authenticated, audited surface.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="/platform/sign-up">
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 px-6 text-base gap-2 rounded-md font-semibold bg-background text-foreground hover:bg-background/90"
                >
                  Get API key free <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
              <a href="/api/mcp" target="_blank" rel="noopener noreferrer">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-base rounded-md font-semibold bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 gap-2"
                >
                  <Code2 className="w-4 h-4" /> MCP manifest
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
