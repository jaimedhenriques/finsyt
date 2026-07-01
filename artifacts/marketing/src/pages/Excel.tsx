import React from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Download,
  MessageSquare,
  Wand2,
  LayoutTemplate,
  FunctionSquare,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Table2,
  CheckCircle2,
  KeyRound,
  Sparkles,
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

const PLATFORM_EXCEL = "/platform/app/excel";
const MANIFEST_URL = "/platform/excel-addin/manifest.xml";

const CAPABILITIES = [
  {
    icon: MessageSquare,
    label: "Agent",
    title: "AI chat that sees your sheet",
    body:
      "A Finsyt research agent lives in the task pane. It reads your current selection, streams answers with tool steps and citations, and proposes formula or model inserts you apply with one click.",
  },
  {
    icon: Wand2,
    label: "Build",
    title: "Autonomous model builder",
    body:
      "Describe the model you want and the Build loop scaffolds it end-to-end — pulling data, wiring formulas, and laying out the sheet. You review each step before it writes a cell.",
  },
  {
    icon: LayoutTemplate,
    label: "Templates",
    title: "One-click DCF, Comps, WACC",
    body:
      "Drop institutional DCF, Comps, Sensitivity, and WACC scaffolds at your active cell, pre-wired to live =FINSYT.* calls. Edit assumptions, not boilerplate.",
  },
  {
    icon: FunctionSquare,
    label: "Functions",
    title: "Live =FINSYT.* worksheet functions",
    body:
      "Native custom functions stream real quotes, financials, estimates, transcripts, filings, news, and macro data straight into any cell — the same data that powers the Finsyt platform, REST API, and MCP.",
  },
];

const FUNCTIONS = [
  { sig: '=FINSYT.QUOTE("AAPL")', desc: "Latest price + change" },
  { sig: '=FINSYT.METRIC("AAPL","revenue","annual",-1)', desc: "Single fundamental metric" },
  { sig: '=FINSYT.FINANCIALS("AAPL","income","revenue","FY-1")', desc: "Statement line item" },
  { sig: '=FINSYT.ESTIMATE("AAPL","eps","next_q","consensus")', desc: "Forward analyst estimate" },
  { sig: '=FINSYT.HISTORY("AAPL","2024-01-01","2024-12-31")', desc: "Daily OHLCV range" },
  { sig: '=FINSYT.ASK("Compare gross margin","AAPL")', desc: "One-shot natural-language answer" },
];

const STEPS = [
  {
    n: "01",
    title: "Open Finsyt for Excel in the platform",
    body:
      "Sign in to Finsyt and open the Finsyt for Excel page. Copy the hosted manifest URL — no build tooling, no npm, no local server.",
  },
  {
    n: "02",
    title: "Sideload the add-in",
    body:
      "In Excel, go to Insert → Office Add-ins → My Add-ins → Upload My Add-in and point it at the manifest. The Finsyt button appears on the Home ribbon.",
  },
  {
    n: "03",
    title: "Sign in and build",
    body:
      "Open the task pane, sign in with your Finsyt account (Clerk popup) or paste an fsk_ API key, and start chatting, building, and inserting =FINSYT.* functions.",
  },
];

const FAQ = [
  {
    q: "How is this different from exporting to a spreadsheet?",
    a: "Finsyt for Excel is a live add-in, not a one-time export. The agent works inside your workbook, functions refresh against real data, and every model the Build loop writes is auditable cell-by-cell before it lands.",
  },
  {
    q: "What's the verify / audit differentiator?",
    a: "Nothing writes to your sheet without your approval. The agent previews every formula and template insert, and =FINSYT.* functions carry source attribution so you can trace any number back to the provider that answered it.",
  },
  {
    q: "How do I authenticate?",
    a: "Two paths: sign in with your Finsyt account through an Office dialog popup (Clerk SSO), or paste an fsk_ API key created in Developer settings. Tokens are scoped per workbook.",
  },
  {
    q: "Which Excel versions are supported?",
    a: "Excel on Windows, Mac, and the web with the Custom Functions runtime — anywhere Office.js add-ins are supported. Installation today is via sideloading the hosted manifest.",
  },
];

export default function Excel() {
  return (
    <main className="min-h-screen bg-background">
      {/* Hero */}
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <motion.div initial="hidden" animate="visible" variants={STAGGER} className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <motion.div
              variants={FADE_UP}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6 tracking-wide"
            >
              <Table2 className="w-3.5 h-3.5 text-primary" />
              FINSYT FOR EXCEL
            </motion.div>
            <motion.h1
              variants={FADE_UP}
              className="text-5xl md:text-6xl font-display font-bold text-foreground mb-6 leading-[1.03] tracking-[-0.03em]"
            >
              Cowork with an analyst agent — inside Excel.
            </motion.h1>
            <motion.p variants={FADE_UP} className="text-xl text-muted-foreground leading-relaxed mb-8">
              Finsyt for Excel puts an agentic research copilot in your task pane: chat that sees
              your sheet, an autonomous Build loop, one-click DCF/Comps/WACC templates, and live{" "}
              <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono border border-border">=FINSYT.*</code>{" "}
              functions. Every write is previewed and approved before it touches a cell.
            </motion.p>
            <motion.div variants={FADE_UP} className="flex flex-col sm:flex-row gap-4">
              <a href={PLATFORM_EXCEL}>
                <Button size="lg" className="h-12 px-6 text-base gap-2 font-semibold">
                  <Download className="w-4 h-4" /> Get Finsyt for Excel
                </Button>
              </a>
              <a href={MANIFEST_URL} target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="h-12 px-6 text-base font-semibold border-foreground/15 hover:bg-secondary gap-2">
                  <ExternalLink className="w-4 h-4" /> View manifest
                </Button>
              </a>
            </motion.div>
          </div>

          {/* Task pane mock */}
          <motion.div variants={FADE_UP} className="bg-[#0F111F] rounded-2xl p-6 border border-white/10 shadow-xl">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400/70" />
              <span className="ml-2 text-xs font-mono text-white/40">Finsyt · task pane</span>
            </div>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg bg-white/5 px-3 py-2.5 text-white/70">
                Build a 5-year DCF for NVDA with a sensitivity table on WACC and terminal growth.
              </div>
              {[
                { step: "get_financials", note: "NVDA revenue, margins, capex" },
                { step: "get_estimates", note: "consensus EPS + revenue" },
                { step: "insert DCF template", note: "wired to =FINSYT.* · awaiting approval" },
              ].map((t, i) => (
                <div key={t.step} className="flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${i < 2 ? "bg-green-400" : "bg-blue-400 animate-pulse"}`} />
                  <code className="font-mono text-xs text-white/85">{t.step}</code>
                  <span className="text-xs text-white/40 ml-auto">{t.note}</span>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <span className="text-[11px] font-semibold rounded px-2.5 py-1 bg-primary text-white">Approve &amp; insert</span>
                <span className="text-[11px] font-semibold rounded px-2.5 py-1 bg-white/5 text-white/60 border border-white/10">Preview cells</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Capabilities */}
      <section className="py-20 px-6 bg-muted/40 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">FOUR WAYS TO WORK</div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Agent, Build, Templates, Functions.</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              The same agentic research surface that powers the Finsyt platform — delivered where
              analysts already build their models.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {CAPABILITIES.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: i * 0.06 }}
                className="bg-card border border-border rounded-2xl p-7 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <c.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-primary tracking-[0.15em] uppercase">{c.label}</span>
                </div>
                <h3 className="font-display font-bold text-xl text-foreground mb-2">{c.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{c.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Verify / audit differentiator */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">VERIFY &amp; AUDIT</div>
            <h2 className="text-3xl font-display font-bold mb-4">Nothing writes to your sheet without approval.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Autonomy without the risk. The agent previews every formula and template insert as a
              diff before it touches a cell, and every <code className="text-sm bg-muted px-1.5 py-0.5 rounded font-mono border border-border">=FINSYT.*</code> value
              carries source attribution — so you can trace any number back to the provider that
              answered it and defend the model in committee.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Preview / approve guard</strong> — review the exact cells the agent proposes before they land.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Attributed data</strong> — every function value names the upstream source, just like the platform.</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span><strong>Live, not frozen</strong> — functions refresh on demand instead of pasting a stale snapshot.</span>
              </li>
            </ul>
          </div>

          {/* Functions preview */}
          <div className="bg-[#0F111F] rounded-2xl p-6 border border-white/10">
            <div className="flex items-center gap-2 mb-5">
              <FunctionSquare className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono text-white/50">worksheet functions</span>
            </div>
            <div className="space-y-2.5">
              {FUNCTIONS.map((f) => (
                <div key={f.sig} className="rounded-lg px-3 py-2.5 hover:bg-white/5 transition-colors">
                  <code className="block text-sm font-mono text-[#9DB1FF] break-all">{f.sig}</code>
                  <span className="text-xs text-white/40">{f.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How to get it */}
      <section className="py-24 px-6 bg-muted/40 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-14">
            <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">GET STARTED</div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Installed in three steps.</h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Sideload the hosted manifest — no local build. Two auth paths get you connected to your
              Finsyt workspace.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 mb-12">
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3">
                <span className="font-display font-bold text-4xl text-primary leading-none">{s.n}</span>
                <div className="font-semibold text-lg text-foreground">{s.title}</div>
                <p className="text-muted-foreground text-sm leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5">
              <KeyRound className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-foreground mb-1">Clerk SSO popup</div>
                <p className="text-sm text-muted-foreground">Sign in with your Finsyt account through an Office dialog.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5">
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-foreground mb-1">fsk_ API key</div>
                <p className="text-sm text-muted-foreground">Paste a key from Developer settings — same one that powers REST + MCP.</p>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 mt-10">
            <a href={PLATFORM_EXCEL}>
              <Button size="lg" className="h-12 px-6 text-base gap-2 font-semibold">
                <Download className="w-4 h-4" /> Get Finsyt for Excel
              </Button>
            </a>
            <a href="/platform/sign-up">
              <Button size="lg" variant="outline" className="h-12 px-6 text-base font-semibold border-foreground/15 hover:bg-secondary">
                Start free trial
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">FAQ</div>
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-10">Questions, answered.</h2>
          <div className="space-y-4">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-start gap-3 mb-2">
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <h3 className="font-semibold text-foreground text-lg leading-snug">{item.q}</h3>
                </div>
                <p className="text-muted-foreground leading-relaxed pl-8">{item.a}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-border bg-card p-8 md:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h3 className="font-display font-bold text-2xl text-foreground mb-2">Bring the agent into your workbook.</h3>
              <p className="text-muted-foreground">Install Finsyt for Excel and start building in minutes.</p>
            </div>
            <a href={PLATFORM_EXCEL} className="shrink-0">
              <Button size="lg" className="h-12 px-6 text-base gap-2 font-semibold">
                Get Finsyt for Excel <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          </div>

          <div className="mt-8 text-sm text-muted-foreground">
            Looking for the developer surface?{" "}
            <Link href="/developers" className="text-primary font-medium hover:underline">
              Explore the REST API and MCP integrations →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
