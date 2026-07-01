import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Play,
  FileText,
  BarChart3,
  BrainCircuit,
  FileSpreadsheet,
  FileSignature,
  Presentation,
  LayoutGrid,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Download,
  Users,
  ExternalLink,
  Lock,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    id: "ask",
    label: "Ask a question",
    icon: BrainCircuit,
    tag: "LIVE",
    tagColor: "bg-green-500/10 text-green-600",
    headline: "Type a research question in plain English",
    description:
      "Ask anything about a company, a sector, or a cross-company theme. Finsyt understands financial context — tickers, reporting periods, metric names — without you having to be precise.",
  },
  {
    id: "synthesize",
    label: "Agent synthesizes",
    icon: Sparkles,
    tag: "LIVE",
    tagColor: "bg-green-500/10 text-green-600",
    headline: "The agent reads primary sources in real time",
    description:
      "Finsyt fans out across SEC filings, earnings transcripts, and connected data providers simultaneously, then cites every number back to the exact sentence it came from.",
  },
  {
    id: "deliverables",
    label: "Cited deliverables",
    icon: FileSignature,
    tag: "LIVE",
    tagColor: "bg-green-500/10 text-green-600",
    headline: "Finished work products, not just answers",
    description:
      "Every output — model, memo, deck, matrix — ships with sentence-level citations so your investment committee can audit the work, not just trust it.",
  },
  {
    id: "export",
    label: "Export & collaborate",
    icon: Users,
    tag: "LIVE",
    tagColor: "bg-green-500/10 text-green-600",
    headline: "Push to Excel, share the workspace, keep the trail",
    description:
      "Export extracted tables straight into your Excel model via the add-in. Share the research workspace with your team, with every agent action logged for compliance.",
  },
];

const QUERIES = [
  "Draft a one-page investment memo on NVDA's margin trajectory.",
  "Compare AI capex guidance across MSFT, GOOGL, META, and AMZN for the last 4 quarters.",
  "Build a 3-statement model for AAPL using the last 8 quarters of 10-Qs.",
  "What did Jensen Huang say about data-center supply constraints on the Q4 call?",
];

function TypingText({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-middle" />}
    </span>
  );
}

function StepAsk({ active }: { active: boolean }) {
  const [queryIdx, setQueryIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;
    timerRef.current = setTimeout(() => {
      setQueryIdx((i) => (i + 1) % QUERIES.length);
    }, 5000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, queryIdx]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="h-9 border-b border-border flex items-center px-3 gap-2 bg-muted/40">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
          ))}
        </div>
        <div className="text-xs text-muted-foreground ml-2">Finsyt Agent</div>
      </div>
      <div className="p-5 space-y-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Ask Finsyt anything about a company or market
        </div>
        <div className="rounded-lg border border-primary/30 bg-secondary/50 p-4 min-h-[64px] flex items-start">
          <div className="text-sm text-foreground leading-relaxed">
            {active ? <TypingText key={queryIdx} text={QUERIES[queryIdx]} speed={30} /> : <span className="text-muted-foreground">Click a step to start the demo…</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["SEC Filings", "Earnings Calls", "FMP Data", "Connected tools"].map((tag) => (
            <span key={tag} className="px-2 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-medium border border-border">
              {tag}
            </span>
          ))}
        </div>
        <Button size="sm" className="w-full gap-2 mt-1" disabled>
          <Play className="w-3.5 h-3.5" /> Ask Finsyt
        </Button>
      </div>
    </div>
  );
}

function StepSynthesize({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);
  const SYNTH_STEPS = [
    { text: "Fetching NVDA FY24 10-K, pages 24–31…", done: false },
    { text: "Reading Q4 earnings transcript (26,400 words)…", done: false },
    { text: "Pulling FMP financials — 8 quarters…", done: false },
    { text: "Cross-referencing sell-side estimates…", done: false },
    { text: "Synthesizing memo draft with citations…", done: false },
  ];

  useEffect(() => {
    if (!active) { setStep(0); return; }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setStep(i);
      if (i >= SYNTH_STEPS.length) clearInterval(id);
    }, 800);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="h-9 border-b border-border flex items-center px-3 gap-2 bg-muted/40">
        <BrainCircuit className="w-3.5 h-3.5 text-primary" />
        <div className="text-xs text-muted-foreground">Finsyt Intelligence Engine · synthesizing</div>
        {active && step < SYNTH_STEPS.length && (
          <div className="ml-auto flex gap-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}
      </div>
      <div className="p-5 space-y-2.5">
        {SYNTH_STEPS.map((s, i) => (
          <div key={s.text} className={`flex items-center gap-3 text-sm transition-all duration-300 ${i < step ? "opacity-100" : "opacity-0"}`}>
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${i < step - 1 || (i === step - 1 && step >= SYNTH_STEPS.length) ? "text-green-500" : "text-primary"}`} />
            <span className={i < step - 1 ? "text-muted-foreground line-through" : "text-foreground"}>{s.text}</span>
          </div>
        ))}
        {step >= SYNTH_STEPS.length && (
          <div className="mt-4 rounded-lg bg-green-500/5 border border-green-500/20 p-3 text-sm text-green-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Synthesis complete — 5 sources, 14 citations
          </div>
        )}
      </div>
    </div>
  );
}

function StepDeliverables() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="h-9 border-b border-border flex items-center px-3 gap-2 bg-muted/40">
        <FileSignature className="w-3.5 h-3.5 text-primary" />
        <div className="text-xs font-medium">Investment Memo — NVDA</div>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Thesis</div>
          <p className="text-sm leading-relaxed">
            Data-center demand continues to outpace supply, with capital return weighted toward buybacks. In FY2024 the company returned{" "}
            <span className="bg-primary/10 text-primary px-1 rounded font-semibold">$9.9B</span>{" "}
            to shareholders via buybacks and dividends combined.
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-[11px] border border-border text-muted-foreground cursor-pointer hover:border-primary/40 transition-colors">
            <FileText className="w-3 h-3" /> NVDA FY24 10-K · p.38
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-[11px] border border-border text-muted-foreground cursor-pointer hover:border-primary/40 transition-colors">
            <FileText className="w-3 h-3" /> Q4 '24 earnings call
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-[11px] border border-border text-muted-foreground cursor-pointer hover:border-primary/40 transition-colors">
            <FileText className="w-3 h-3" /> FMP financials
          </span>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border flex items-center gap-2">
            <BarChart3 className="w-3 h-3" /> Key metrics
          </div>
          <table className="w-full text-xs">
            <tbody className="divide-y divide-border/60">
              {[["Revenue", "$60.9B", "+122% YoY"], ["Gross Margin", "72.7%", "+8pp YoY"], ["Free Cash Flow", "$26.9B", "+156% YoY"]].map(([m, v, d]) => (
                <tr key={m}>
                  <td className="px-3 py-2 text-muted-foreground">{m}</td>
                  <td className="px-3 py-2 font-semibold text-foreground text-right">{v}</td>
                  <td className="px-3 py-2 text-primary text-right">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          All figures traceable · 14 citations attached
        </div>
      </div>
    </div>
  );
}

function StepExport() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="h-9 border-b border-border flex items-center px-3 gap-2 bg-muted/40">
        <Users className="w-3.5 h-3.5 text-primary" />
        <div className="text-xs text-muted-foreground">Finsyt Workspace — NVDA Coverage</div>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <button className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col items-start gap-2 hover:border-primary/40 hover:bg-secondary transition-all text-left">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            <div>
              <div className="text-xs font-semibold">Export to Excel</div>
              <div className="text-[11px] text-muted-foreground">Push extracted tables to model</div>
            </div>
          </button>
          <button className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col items-start gap-2 hover:border-primary/40 hover:bg-secondary transition-all text-left">
            <Presentation className="w-5 h-5 text-blue-600" />
            <div>
              <div className="text-xs font-semibold">Generate Deck</div>
              <div className="text-[11px] text-muted-foreground">Banker-style slides, self-sourced</div>
            </div>
          </button>
          <button className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col items-start gap-2 hover:border-primary/40 hover:bg-secondary transition-all text-left">
            <Download className="w-5 h-5 text-purple-600" />
            <div>
              <div className="text-xs font-semibold">Export Memo</div>
              <div className="text-[11px] text-muted-foreground">PDF with citation appendix</div>
            </div>
          </button>
          <button className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col items-start gap-2 hover:border-primary/40 hover:bg-secondary transition-all text-left">
            <LayoutGrid className="w-5 h-5 text-amber-600" />
            <div>
              <div className="text-xs font-semibold">Run Matrix</div>
              <div className="text-[11px] text-muted-foreground">Extend across your universe</div>
            </div>
          </button>
        </div>
        <div className="rounded-lg bg-muted/40 border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Shared with your team</div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {["J", "A", "M"].map((l) => (
                <div key={l} className="w-6 h-6 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-[10px] font-bold text-primary">
                  {l}
                </div>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">3 analysts · all actions logged for compliance</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEP_PANELS = [StepAsk, StepSynthesize, StepDeliverables, StepExport];

export default function Demo() {
  const [activeStep, setActiveStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!autoPlay) return;
    autoRef.current = setInterval(() => {
      setActiveStep((s) => (s + 1) % STEPS.length);
    }, 6000);
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [autoPlay]);

  function goTo(i: number) {
    setAutoPlay(false);
    setActiveStep(i);
  }

  const Panel = STEP_PANELS[activeStep];

  return (
    <main className="min-h-screen bg-background">
      {/* HERO */}
      <section className="pt-32 pb-16 px-6 bg-gradient-to-b from-secondary/50 to-background border-b border-border">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-6 border border-primary/20">
            <Zap className="w-3 h-3" /> Interactive Demo
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-bold tracking-[-0.03em] leading-[1.03] mb-6">
            See Finsyt in action.{" "}
            <span className="text-primary">No sales call required.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-8">
            Walk through a live research workflow — from question to cited memo
            to Excel export — in four steps. Every feature shown is live in the
            product today.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a href="/platform/sign-up">
              <Button size="lg" className="h-12 px-6 text-base gap-2 font-semibold">
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <Link href="/request-access">
              <Button size="lg" variant="outline" className="h-12 px-6 text-base font-semibold border-foreground/15 hover:bg-secondary">
                Talk to Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* INTERACTIVE TOUR */}
      <section className="py-16 md:py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-5 gap-8 items-start">
            {/* Step selector */}
            <div className="lg:col-span-2 space-y-3">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <button
                    key={step.id}
                    onClick={() => goTo(i)}
                    className={`w-full text-left rounded-xl border p-5 transition-all duration-200 ${
                      activeStep === i
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-primary/40 hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${activeStep === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-semibold text-sm text-foreground">{step.label}</div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${step.tagColor}`}>
                            {step.tag}
                          </span>
                        </div>
                        {activeStep === i && (
                          <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                            {step.description}
                          </p>
                        )}
                      </div>
                      <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 transition-transform ${activeStep === i ? "text-primary rotate-90" : "text-muted-foreground"}`} />
                    </div>
                    {activeStep === i && !autoPlay && (
                      <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: "100%" }} />
                      </div>
                    )}
                    {activeStep === i && autoPlay && (
                      <div className="mt-3 h-1 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          key={i}
                          className="h-full bg-primary rounded-full"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 6, ease: "linear" }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Panel */}
            <div className="lg:col-span-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeStep}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="mb-4">
                    <h2 className="text-2xl font-display font-bold tracking-tight text-foreground">
                      {STEPS[activeStep].headline}
                    </h2>
                  </div>
                  {activeStep === 0 && <StepAsk active={true} />}
                  {activeStep === 1 && <StepSynthesize active={true} />}
                  {activeStep === 2 && <StepDeliverables />}
                  {activeStep === 3 && <StepExport />}
                </motion.div>
              </AnimatePresence>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => goTo((activeStep - 1 + STEPS.length) % STEPS.length)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Previous
                </button>
                {activeStep < STEPS.length - 1 ? (
                  <button
                    onClick={() => goTo(activeStep + 1)}
                    className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                  >
                    Next step <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <a href="/platform/sign-up" className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                    Try it yourself <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HONESTY PASS — what's live vs coming */}
      <section className="py-16 px-6 border-t border-border bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">WHAT'S LIVE TODAY</div>
            <h2 className="text-3xl font-display font-bold tracking-tight text-foreground mb-3">
              No vaporware. Here's what you get on day one.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Every feature marked Live is available to trial users today. Coming Soon features are on our public roadmap.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            {[
              { label: "AI research agent with sentence-level citations", live: true },
              { label: "SEC filings, 10-K/10-Q/8-K, earnings transcripts", live: true },
              { label: "Investment memo drafting", live: true },
              { label: "Banker-style slide deck generation", live: true },
              { label: "Decision matrix across a company basket", live: true },
              { label: "Excel add-in for table extraction", live: true },
              { label: "Shared team workspaces with audit log", live: true },
              { label: "Connector Hub (FactSet, CapIQ, Bloomberg BYO)", live: true },
              { label: "Football-field valuations chart", live: true },
              { label: "Broker research federation", live: false },
              { label: "Live earnings call listen-and-annotate", live: false },
              { label: "Native iOS / Android app", live: false },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                {f.live ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                )}
                <span className="text-sm text-foreground">{f.label}</span>
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0 ${f.live ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                  {f.live ? "Live" : "Soon"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto rounded-3xl bg-primary text-primary-foreground px-8 md:px-14 py-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-display font-bold tracking-[-0.02em] leading-[1.05] mb-4">
              Ready to use the real thing?
            </h2>
            <p className="text-lg text-primary-foreground/80 mb-8 max-w-xl mx-auto">
              Start a free 14-day trial — no credit card, no sales call. Your workspace is provisioned in under a minute.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="/platform/sign-up">
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 px-8 text-base gap-2 font-semibold bg-background text-foreground hover:bg-background/90"
                >
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
              <Link href="/request-access">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-8 text-base font-semibold bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  Talk to Sales
                </Button>
              </Link>
            </div>
            <p className="mt-5 text-primary-foreground/60 text-sm flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              SOC 2 in progress · All data encrypted at rest and in transit
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
