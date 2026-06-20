import React, { lazy, Suspense } from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Search,
  FileText,
  BarChart3,
  Database,
  BrainCircuit,
  CheckCircle2,
  Sparkles,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SourceMarquee from "@/components/marketing/SourceMarquee";

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

const FEATURES = [
  {
    num: "01",
    title: "Every filing, transcript, and report — in one terminal",
    body:
      "Tap into 15M+ SEC and international filings, live earnings transcripts, the top 50 brokerage research desks, and your firm's internal memos and Excel models. Finsyt unifies the entire research surface in a single, queryable workspace.",
    icon: Database,
  },
  {
    num: "02",
    title: "Workflows that speak your market's language",
    body:
      "Models trained on financial vernacular understand EBITDA, margin compression, segment reporting, and complex accounting methodology out of the box. Ask the way an analyst would — get back precise, structured answers.",
    icon: Layers,
  },
  {
    num: "03",
    title: "Decisions made with confidence, not hesitance",
    body:
      "Generative AI grounded in primary sources gives you real-time intelligence behind every decision. Compare peers, summarize calls, and stress-test theses in seconds — not days.",
    icon: Sparkles,
  },
  {
    num: "04",
    title: "Audit-ready citations on every output",
    body:
      "Every fact, number, and quote links directly to the source document at the sentence level. Click any data point to view the original PDF, highlighted in context. No hallucinations, no guesswork.",
    icon: ShieldCheck,
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
                FINSYT INTELLIGENCE ENGINE v2.0 IS LIVE
              </motion.div>

              <motion.h1
                variants={FADE_UP}
                className="font-display font-bold text-foreground tracking-[-0.03em] leading-[1.02] text-5xl md:text-6xl lg:text-7xl mb-6"
              >
                Accelerate your research with{" "}
                <span className="text-primary">AI insights you can trust.</span>
              </motion.h1>

              <motion.p
                variants={FADE_UP}
                className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed"
              >
                Finsyt is the AI-native financial intelligence platform built for
                institutional investors. Query filings, transcripts, broker
                research, and your firm's internal documents in natural language —
                with sentence-level citations on every answer.
              </motion.p>

              <motion.div
                variants={FADE_UP}
                className="flex flex-col sm:flex-row items-start sm:items-center gap-4"
              >
                <Link href="/request-access">
                  <Button
                    size="lg"
                    className="h-12 px-6 text-base gap-2 rounded-md font-semibold"
                  >
                    Request Access <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Link href="/product">
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 px-6 text-base rounded-md font-semibold border-foreground/15 hover:bg-secondary"
                  >
                    Take the Tour
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
                      Ask Finsyt
                    </div>
                    <div className="text-sm text-foreground leading-snug">
                      Compare margin expansion between MSFT and GOOGL over the
                      last four quarters.
                    </div>
                  </div>

                  <div className="flex gap-3 mb-4">
                    <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                      <BrainCircuit className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Synthesizing across 4 earnings transcripts and 8 filings…
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
                    {["MSFT 10-Q · p.24", "GOOGL Q2 call", "MSFT Q1 10-Q"].map((c) => (
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

      {/* NUMBERED FEATURE BLOCKS */}
      <section className="py-24 md:py-32 px-6 bg-muted/40 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-16">
            <h2 className="font-display font-bold text-4xl md:text-5xl tracking-[-0.02em] leading-[1.05] text-foreground">
              The most expansive collection of curated sources, all in one place.
            </h2>
          </div>

          <div className="space-y-8">
            {FEATURES.map((f, i) => (
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
                <div className="lg:col-span-7">
                  <h3 className="font-display font-bold text-2xl md:text-3xl tracking-[-0.01em] text-foreground mb-3 leading-tight">
                    {f.title}
                  </h3>
                  <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                    {f.body}
                  </p>
                </div>
                <div className="lg:col-span-3 flex lg:justify-end">
                  <div className="w-16 h-16 rounded-xl bg-secondary border border-border flex items-center justify-center">
                    <f.icon className="w-7 h-7 text-primary" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <div className="max-w-7xl mx-auto rounded-3xl bg-primary text-primary-foreground px-8 md:px-16 py-20 md:py-24 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(255,255,255,0.2) 0%, transparent 50%)",
          }} />
          <div className="relative max-w-3xl">
            <h2 className="font-display font-bold text-4xl md:text-6xl tracking-[-0.02em] leading-[1.05] mb-6">
              Ready to upgrade your research edge?
            </h2>
            <p className="text-lg md:text-xl text-primary-foreground/85 mb-10 leading-relaxed">
              See why the most demanding investment teams choose Finsyt to make
              their highest-conviction decisions.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/request-access">
                <Button
                  size="lg"
                  variant="secondary"
                  className="h-12 px-6 text-base gap-2 rounded-md font-semibold bg-background text-foreground hover:bg-background/90"
                >
                  Request Access <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 px-6 text-base rounded-md font-semibold bg-transparent border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
                >
                  View Pricing
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
