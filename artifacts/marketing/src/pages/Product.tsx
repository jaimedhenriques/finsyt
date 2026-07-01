import React from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  FileText,
  BarChart3,
  ChevronRight,
  FileSignature,
  Presentation,
  LayoutGrid,
  ShieldCheck,
  ExternalLink,
  Play,
  Plug,
  Server,
  Workflow,
  BrainCircuit,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Product() {
  return (
    <main className="min-h-screen bg-background">
      {/* Page header */}
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="mb-16 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            THE FINSYT PLATFORM
          </div>
          <h1 className="text-5xl md:text-6xl font-display font-bold text-foreground mb-6 leading-[1.03] tracking-[-0.03em]">
            The agentic control plane for institutional research.
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed mb-8">
            Finsyt doesn't search documents — it orchestrates your entire data stack.
            Federate your existing data licenses through a single MCP-compatible control
            plane, deploy research agents, and get audit-ready citations on every output.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link href="/demo">
              <Button size="lg" className="h-12 px-6 text-base gap-2 font-semibold">
                <Play className="w-4 h-4" /> Watch interactive demo
              </Button>
            </Link>
            <a href="/platform/sign-up">
              <Button size="lg" variant="outline" className="h-12 px-6 text-base font-semibold border-foreground/15 hover:bg-secondary">
                Start free trial
              </Button>
            </a>
          </div>
        </div>

        {/* Differentiator 1 — Agents & Blueprints */}
        <div className="grid lg:grid-cols-2 gap-16 items-center py-16 border-t border-border">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
              <Workflow className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">DIFFERENTIATOR 01 — AGENTS &amp; BLUEPRINTS</div>
            <h2 className="text-3xl font-display font-bold mb-4">Deploy agents. Build blueprints. Own the workflow.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Pre-built research agents handle earnings synthesis, peer comparison,
              diligence matrix, and macro monitoring autonomously. Compose your own
              blueprints by chaining tools, connectors, and output formats — without
              writing a single line of code.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>"Run the earnings blueprint for NVDA and send the summary to the workspace."</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>"Compare my peer basket on forward P/E, EV/EBITDA, and options ITM %."</span>
              </li>
            </ul>
          </div>
          <div className="bg-muted/30 rounded-2xl p-6 md:p-8 border border-border">
            <div className="bg-card rounded-xl border border-border shadow-md p-6">
              <div className="flex items-center gap-3 mb-5">
                <BrainCircuit className="w-4 h-4 text-primary" />
                <div className="text-sm font-semibold">Finsyt Agent · Earnings Blueprint</div>
                <span className="ml-auto text-[10px] bg-green-500/10 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">Running</span>
              </div>
              <div className="space-y-3 text-xs">
                {[
                  { step: "get_filings", status: "done", note: "NVDA 10-Q · Q2'24" },
                  { step: "get_transcripts", status: "done", note: "Q2'24 earnings call" },
                  { step: "get_estimates", status: "active", note: "Consensus via CapIQ connector…" },
                  { step: "draft_memo", status: "pending", note: "Waiting on estimates" },
                ].map((t) => (
                  <div key={t.step} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === "done" ? "bg-green-500" : t.status === "active" ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
                    <code className="font-mono text-foreground">{t.step}</code>
                    <span className="text-muted-foreground ml-auto">{t.note}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Differentiator 2 — Connector Hub */}
        <div className="grid lg:grid-cols-2 gap-16 items-center py-16 border-t border-border">
          <div className="order-2 lg:order-1 bg-muted/30 rounded-2xl p-6 md:p-8 border border-border">
            <div className="bg-card rounded-xl border border-border shadow-md overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/50 flex items-center gap-3">
                <Plug className="w-4 h-4 text-primary" />
                <div className="text-sm font-medium">Connector Hub · Active connections</div>
              </div>
              <div className="divide-y divide-border text-sm">
                {[
                  { name: "Capital IQ", type: "Premium", status: "Connected", ms: "312 ms" },
                  { name: "Financial Modeling Prep", type: "Primary", status: "Connected", ms: "421 ms" },
                  { name: "SEC EDGAR", type: "Public", status: "Connected", ms: "180 ms" },
                  { name: "Apify Alt-Data", type: "Alt-data", status: "Connected", ms: "—" },
                ].map((c) => (
                  <div key={c.name} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                      <span className="font-medium text-foreground">{c.name}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1.5 py-0.5 uppercase tracking-wide">{c.type}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.ms}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
              <Plug className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">DIFFERENTIATOR 02 — CONNECTOR HUB</div>
            <h2 className="text-3xl font-display font-bold mb-4">150+ data connectors. One control plane.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Wire any REST API or MCP server into your workspace from a curated catalog.
              Every connector call is logged, rate-limit-aware, and attributed in the
              citation trail. Add custom REST or MCP endpoints alongside first-party data.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Curated catalog</strong> — FMP, Finnhub, SEC EDGAR, Apify alt-data, World Bank, FRED, and more.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Custom endpoints</strong> — add any REST API or external MCP server in minutes.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Full attribution</strong> — every connector call surfaces in the "Data sources used" footer.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Differentiator 3 — MCP + BYO Federation */}
        <div className="grid lg:grid-cols-2 gap-16 items-center py-16 border-t border-border">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
              <Server className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">DIFFERENTIATOR 03 — MCP + BYO-LICENSE FEDERATION</div>
            <h2 className="text-3xl font-display font-bold mb-4">Keep your data licenses. Federate over them.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Finsyt exposes a standards-compliant MCP server. Plug in your FactSet,
              Capital IQ, Bloomberg DL, or Refinitiv credentials and every Finsyt agent
              runs against the numbers your investment committee already trusts —
              no rip-and-replace required. You bring the licence; Finsyt routes the
              call, caches the response, and audits who read what.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>FactSet, Capital IQ, Bloomberg DL, Refinitiv, PitchBook</strong> — connect with existing credentials.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>MCP server at /api/mcp</strong> — consumable by any MCP-compatible client.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Finsyt redistributes nothing</strong> — your data stays in your licensed provider's infrastructure.</span>
              </li>
            </ul>
          </div>
          <div className="bg-muted/30 rounded-2xl p-6 md:p-8 border border-border">
            <div className="bg-card rounded-xl border border-border shadow-md p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">BYO-License connections</div>
              <ul className="space-y-3 text-sm">
                {[
                  { name: "FactSet", tag: "Symbology · Prices · Fundamentals", color: "bg-primary/10 text-primary" },
                  { name: "Capital IQ", tag: "Quotes · Financials · Transactions", color: "bg-violet-500/10 text-violet-700" },
                  { name: "Bloomberg DL", tag: "BEAP Catalogs · DL Request Status", color: "bg-amber-500/10 text-amber-700" },
                  { name: "Refinitiv / LSEG", tag: "RDP Symbology · Real-Time Pricing", color: "bg-green-500/10 text-green-700" },
                ].map((p) => (
                  <li key={p.name} className="flex items-center justify-between gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.color} uppercase tracking-wide`}>BYO</span>
                      <span className="font-semibold">{p.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground text-right">{p.tag}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed">
                Connect in the Connector Hub → every Finsyt agent uses your credentials automatically.
              </p>
            </div>
          </div>
        </div>

        {/* Research outputs */}
        <div className="py-16 border-t border-border">
          <div className="max-w-3xl mb-12">
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">RESEARCH OUTPUTS</div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">What the agents produce.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Finsyt agents output structured research — not free-form chat.
              Each output type has a consistent schema, a citation trail,
              and a "Data sources used" attribution footer.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: FileSignature,
                label: "Investment Memos",
                desc: "Structured thesis, financials, risks, and comps — each claim linked to the source sentence.",
                badge: null,
              },
              {
                icon: LayoutGrid,
                label: "Decision Matrix",
                desc: "One question across a whole basket of companies — structured, cited, and exportable.",
                badge: null,
              },
              {
                icon: Presentation,
                label: "Research Decks",
                desc: "Slide decks with a 'Data sources used' attribution appendix. Decks ship self-attributed.",
                badge: null,
              },
              {
                icon: BarChart3,
                label: "Finsyt for Excel",
                desc: "An agentic add-in inside Excel: AI chat that sees your sheet, one-click DCF/Comps/WACC templates, and live =FINSYT.* worksheet functions.",
                badge: "New",
                href: "/excel",
              },
            ].map((item) => {
              const inner = (
                <>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-foreground">{item.label}</h3>
                      {item.badge && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                    {item.href && (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-3">
                        Explore Finsyt for Excel <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </>
              );
              return item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="bg-background border border-border rounded-xl p-6 flex gap-5 hover:border-primary/40 transition-colors"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={item.label}
                  className="bg-background border border-border rounded-xl p-6 flex gap-5 hover:border-primary/40 transition-colors"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        </div>

        {/* Trust layer — provenance */}
        <div className="grid lg:grid-cols-2 gap-16 items-center py-16 border-t border-border">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">THE TRUST LAYER</div>
            <h2 className="text-3xl font-display font-bold mb-4">Every output shows its work.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Every agent response, memo, and deck carries a "Data sources used"
              footer that lists each provider and connector that fed the output,
              the role it played, the time it took to respond, and a deep link
              into the Connector Hub. Citation chips anchor the specific source
              passage in every structured answer.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Provider, role, response time, citation count</strong> — surfaced beside every answer.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Deck attribution appendix</strong> mirrors the chat footer so decks stay self-attributed.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Workspace-wide toggle</strong> with per-analyst collapse — defaults on for audit-ready output.</span>
              </li>
            </ul>
          </div>
          <div className="bg-muted/30 rounded-2xl p-6 md:p-8 border border-border">
            <div className="bg-card rounded-xl border border-border shadow-md p-6">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-4">Data sources used</div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase tracking-wide">Primary</span>
                    <span className="font-semibold">Financial Modeling Prep</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>421 ms</span>
                    <span className="inline-flex items-center gap-1 text-primary"><ExternalLink className="w-3 h-3" /> Hub</span>
                  </div>
                </li>
                <li className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 uppercase tracking-wide">Fallback</span>
                    <span className="font-semibold">EOD Historical Data</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>612 ms</span>
                    <span className="inline-flex items-center gap-1 text-primary"><ExternalLink className="w-3 h-3" /> Hub</span>
                  </div>
                </li>
                <li className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-500/10 text-violet-700 uppercase tracking-wide">Citation</span>
                    <span className="font-semibold">SEC EDGAR · 10-K</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>3 cites</span>
                    <span className="inline-flex items-center gap-1 text-primary"><ExternalLink className="w-3 h-3" /> Hub</span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
