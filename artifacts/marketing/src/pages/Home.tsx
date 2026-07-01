import React, { lazy, Suspense } from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Search,
  FileText,
  BarChart3,
  LayoutGrid,
  BrainCircuit,
  ShieldCheck,
  Plug,
  Server,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SourceMarquee from "@/components/marketing/SourceMarquee";
import SocialProof from "@/components/marketing/SocialProof";

const HeroScene = lazy(() => import("@/components/three/HeroScene"));

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const STAGGER = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const SOLUTIONS = [
  "Investment Banking",
  "Hedge Funds",
  "Private Equity",
  "Asset Management",
  "Corporate Strategy",
  "Equity Research",
  "Credit Research",
  "Wealth Management",
];

const DIFFERENTIATORS = [
  {
    icon: Workflow,
    label: "AGENTIC WORKFLOWS",
    title: "Agents & Blueprints",
    body: "Deploy pre-built research agents — earnings synthesis, peer comparison, diligence matrix — or compose your own. Agents run autonomously, surface citations, and write results directly into your workspace.",
    cta: "Explore the platform",
    href: "/platform/app",
    external: true,
  },
  {
    icon: Plug,
    label: "CONNECTOR HUB",
    title: "150+ data connectors. One control plane.",
    body: "Wire any REST API or MCP server into your workspace from a curated catalog of 150+ sources. Every connector call is logged, rate-limit-aware, and attributed in the citation trail — no shadow integrations.",
    cta: "See the Hub",
    href: "/platform/app/connectors",
    external: true,
  },
  {
    icon: Server,
    label: "MCP + BYO-LICENSE FEDERATION",
    title: "Keep your data licenses. Federate over them.",
    body: "Finsyt exposes a standards-compliant MCP server at /api/mcp. Plug in your FactSet, Capital IQ, Bloomberg DL, or Refinitiv credentials and every agent in the platform runs against the numbers your investment committee already trusts — no rip-and-replace.",
    cta: "Coming from FactSet / CapIQ?",
    href: "/solutions#coming-from",
    external: false,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* HERO */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 px-6 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[600px] bg-gradient-to-b from-secondary/60 to-transparent pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none opacity-60 mix-blend-multiply">
          <Suspense fallback={null}>
            <HeroScene />
          </Suspense>
        </div>
        <div className="max-w-7xl mx-auto relative">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={STAGGER}
            className="grid lg:grid-cols-12 gap-12 items-center"
          >
            <div className="lg:col-span-7">
              <motion.div
                variants={FADE_UP}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6 tracking-wide"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                FINSYT PLATFORM — NOW WITH MCP SERVER &amp; CONNECTOR HUB
              </motion.div>

              <motion.h1
                variants={FADE_UP}
                className="font-display font-bold text-foreground tracking-[-0.03em] leading-[1.02] text-5xl md:text-6xl lg:text-7xl mb-6"
              >
                The agentic control plane for{" "}
                <span className="text-primary">
                  institutional research.
                </span>
              </motion.h1>

              <motion.p
                variants={FADE_UP}
                className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed"
              >
                Finsyt federates your existing data licenses — FactSet, Capital IQ,
                Bloomberg, Refinitiv — through a single MCP-compatible control plane.
                Deploy research agents, build connector workflows, and get
                audit-ready citations on every output. No rip-and-replace required.
              </motion.p>

              <motion.div
                variants={FADE_UP}
                className="flex flex-col sm:flex-row items-start sm:items-center gap-4"
              >
                <a href="/platform/sign-up">
                  <Button
                    size="lg"
                    className="h-12 px-6 text-base gap-2 rounded-md font-semibold"
                  >
                    Start Free Trial <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
                <Link href="/demo">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 px-6 text-base rounded-md font-semibold border-foreground/15 hover:bg-secondary"
                  >
                    Watch interactive demo
                  </Button>
                </Link>
              </motion.div>
            </div>

            {/* Mock product visual */}
            <motion.div
              variants={FADE_UP}
              className="lg:col-span-5 relative"
            >
              <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10 overflow-hidden">
                <div className="h-10 border-b border-border flex items-center px-3 gap-2 bg-muted/40">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
                    <div className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
                    <div className="w-2.5 h-2.5 rounded-full bg-foreground/15" />
                  </div>
                  <div className="ml-2 flex-1 flex items-center bg-background rounded border border-border px-2.5 h-6 text-xs text-muted-foreground">
                    <Search className="w-3 h-3 mr-1.5" />
                    finsyt.com / research
                  </div>
                </div>

                <div className="p-5">
                  <div className="rounded-lg bg-secondary border border-secondary p-3 mb-4">
                    <div className="text-[11px] font-semibold text-secondary-foreground uppercase tracking-wider mb-1">
                      Finsyt Agent
                    </div>
                    <div className="text-sm text-foreground leading-snug">
                      Compare MSFT vs GOOGL margin expansion across the last 4 quarters.
                    </div>
                  </div>

                  <div className="flex gap-3 mb-4">
                    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <BrainCircuit className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Synthesizing via FMP + Capital IQ connector · 4 transcripts · 8 filings…
                    </p>
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <BarChart3 className="w-3.5 h-3.5 text-primary" />
                        Operating margin
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        Q3'23 → Q2'24
                      </span>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border">
                          <th className="text-left font-medium px-3 py-1.5">Co</th>
                          <th className="text-right font-medium px-3 py-1.5">Q3</th>
                          <th className="text-right font-medium px-3 py-1.5">Q4</th>
                          <th className="text-right font-medium px-3 py-1.5">Q1</th>
                          <th className="text-right font-medium px-3 py-1.5">Q2</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border/60">
                          <td className="px-3 py-1.5 font-semibold text-foreground">MSFT</td>
                          <td className="px-3 py-1.5 text-right text-foreground">47.6</td>
                          <td className="px-3 py-1.5 text-right text-foreground">43.6</td>
                          <td className="px-3 py-1.5 text-right text-foreground">42.3</td>
                          <td className="px-3 py-1.5 text-right text-primary font-semibold">44.8</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-1.5 font-semibold text-foreground">GOOGL</td>
                          <td className="px-3 py-1.5 text-right text-foreground">27.8</td>
                          <td className="px-3 py-1.5 text-right text-foreground">27.5</td>
                          <td className="px-3 py-1.5 text-right text-foreground">31.6</td>
                          <td className="px-3 py-1.5 text-right text-primary font-semibold">32.4</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {["MSFT 10-Q · p.24", "GOOGL Q2 call", "Capital IQ connector"].map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-secondary text-secondary-foreground text-[10px] font-medium border border-border"
                      >
                        <FileText className="w-2.5 h-2.5" />
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <SourceMarquee />

      {/* THREE DIFFERENTIATORS — above the fold narrative */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-16">
            <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
              WHY FINSYT
            </p>
            <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.02em] leading-[1.05] text-foreground">
              Three things no point-solution gives you.
            </h2>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              Query tools search documents. Finsyt orchestrates your entire data stack — 
              your licensed feeds, your connectors, your agents — from a single control plane.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {DIFFERENTIATORS.map((d, i) => (
              <motion.div
                key={d.label}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-background border border-border rounded-2xl p-8 flex flex-col hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-[border-color,box-shadow]"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <d.icon className="w-6 h-6 text-primary" />
                </div>
                <p className="text-[10px] font-semibold text-primary tracking-[0.2em] mb-3">
                  {d.label}
                </p>
                <h3 className="font-display font-bold text-xl md:text-2xl tracking-[-0.01em] text-foreground mb-4 leading-tight">
                  {d.title}
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed flex-1">
                  {d.body}
                </p>
                {d.external ? (
                  <a href={d.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                    {d.cta} <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <Link href={d.href} className="mt-6">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                      {d.cta} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </Link>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT FINSYT SHIPS */}
      <section className="py-24 md:py-32 px-6 bg-muted/40 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-16">
            <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
              WHAT FINSYT SHIPS TODAY
            </p>
            <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.02em] leading-[1.05] text-foreground">
              Outcomes, not just answers.
            </h2>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              Other tools hand you a search result. Finsyt hands you structured
              research output — and every figure traces back to a primary source
              via the citation trail.
            </p>
          </div>

          <div className="space-y-6">
            {[
              {
                num: "01",
                title: "Synthesize across filings & transcripts",
                body: "The Finsyt Agent reads across SEC filings, earnings calls, and your connected data providers simultaneously. Ask one question and get a structured, cited answer — not a list of links.",
                badge: null,
              },
              {
                num: "02",
                title: "Draft investment memos",
                body: "Turn a coverage question into a structured investment memo — thesis, financials, risks, and comps — each claim linked to the source sentence so your investment committee can audit it.",
                badge: null,
              },
              {
                num: "03",
                title: "Run the decision matrix",
                body: "Ask one question across a whole basket of companies and get a structured, cited comparison grid back. Screen, compare, and stress-test theses across your universe at once.",
                badge: null,
              },
              {
                num: "04",
                title: "Generate slide decks with attribution",
                body: "Generate a research deck with a 'Data sources used' appendix that lists every provider and connector that fed each section. Decks ship self-attributed — no manual citation hunt.",
                badge: null,
              },
              {
                num: "05",
                title: "Push to Excel",
                body: "Export structured financial tables from any agent output directly to Excel. A native Excel add-in with live formula mapping is in active development.",
                badge: "Coming soon",
              },
            ].map((f, i) => (
              <motion.div
                key={f.num}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="grid lg:grid-cols-12 gap-8 items-start bg-background border border-border rounded-2xl p-8 md:p-10 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-[border-color,box-shadow]"
              >
                <div className="lg:col-span-2">
                  <div className="font-display font-bold text-5xl md:text-6xl text-primary leading-none">
                    {f.num}
                  </div>
                </div>
                <div className="lg:col-span-10">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.01em] text-foreground leading-tight">
                      {f.title}
                    </h3>
                    {f.badge && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-700 border border-amber-200 dark:text-amber-300 dark:border-amber-800">
                        {f.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                    {f.body}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Provenance trust layer */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="mt-8 grid lg:grid-cols-12 gap-8 items-center bg-foreground text-background rounded-2xl p-8 md:p-10"
          >
            <div className="lg:col-span-2 flex">
              <div className="w-16 h-16 rounded-xl bg-background/10 border border-background/20 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-background" />
              </div>
            </div>
            <div className="lg:col-span-7">
              <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.01em] mb-3 leading-tight">
                Audit-ready citations on every output.
              </h3>
              <p className="text-base md:text-lg text-background/75 leading-relaxed">
                Every agent response, memo, and deck carries a citation trail —
                provider name, role, response time, and source passage — so
                compliance never has to take the model's word for it.
              </p>
            </div>
            <div className="lg:col-span-3 flex lg:justify-end">
              <Link href="/security">
                <Button
                  variant="secondary"
                  className="h-11 px-5 rounded-md font-semibold gap-2 bg-background text-foreground hover:bg-background/90"
                >
                  Trust Center <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* SOLUTIONS EXPLORER */}
      <section className="py-24 md:py-32 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
                EXPLORE SOLUTIONS
              </p>
              <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.02em] leading-[1.05] text-foreground">
                AI workflows that speak your market's language.
              </h2>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                Purpose-built for the people who set the agenda — from sell-side
                bankers to long/short PMs to corporate strategists.
              </p>
              <Link href="/solutions">
                <Button
                  variant="outline"
                  className="mt-8 h-11 px-5 rounded-md font-semibold border-foreground/15 hover:bg-secondary gap-2"
                >
                  Browse all solutions <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            <div className="lg:col-span-7 grid sm:grid-cols-2 gap-px bg-border rounded-xl overflow-hidden border border-border">
              {SOLUTIONS.map((s) => (
                <Link
                  key={s}
                  href="/solutions"
                  className="group bg-background hover:bg-secondary transition-colors p-5 flex items-center justify-between"
                >
                  <span className="font-semibold text-foreground">{s}</span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SocialProof />

      {/* CTA */}
      <section className="px-6 py-24">
        <div className="max-w-7xl mx-auto rounded-3xl bg-primary text-primary-foreground px-8 md:px-16 py-20 md:py-24 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 50%)",
          }} />
          <div className="relative max-w-3xl">
            <h2 className="font-display font-bold text-4xl md:text-6xl tracking-[-0.02em] leading-[1.05] mb-6">
              Ready to federate your research stack?
            </h2>
            <p className="text-lg md:text-xl text-primary-foreground/85 mb-10 leading-relaxed">
              Plug your existing data licenses into Finsyt's agentic control plane
              and get audit-ready research output from day one.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="/platform/sign-up">
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 px-6 text-base gap-2 rounded-md font-semibold bg-background text-foreground hover:bg-background/90"
                >
                  Start Free Trial <ArrowRight className="w-4 h-4" />
                </Button>
              </a>
              <Link href="/demo">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-base rounded-md font-semibold bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  Watch interactive demo
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
