import React from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import {
  Check,
  Minus,
  X,
  ArrowRight,
  Layers,
  Quote,
  DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

type Support = "full" | "partial" | "none";

const COMPETITORS = [
  "Finsyt",
  "AlphaSense",
  "Hebbia",
  "Rogo",
  "Quartr",
  "Daloopa",
  "Terminals",
] as const;

type Competitor = (typeof COMPETITORS)[number];

type Row = {
  capability: string;
  detail: string;
  values: Record<Competitor, Support>;
};

// Honest, defensible positioning. Where a competitor genuinely offers a
// capability we mark it; "partial" means narrower scope than Finsyt, not
// "worse". Differentiator rows are surfaced separately above the grid.
const ROWS: Row[] = [
  {
    capability: "Sentence-level provenance",
    detail:
      "Every fact, figure, and quote links to the exact source sentence — across filings, transcripts, and your own documents.",
    values: {
      Finsyt: "full",
      AlphaSense: "full",
      Hebbia: "full",
      Rogo: "partial",
      Quartr: "partial",
      Daloopa: "full",
      Terminals: "partial",
    },
  },
  {
    capability: "Bring-your-own-license federation",
    detail:
      "Plug in your existing FactSet, Capital IQ, Bloomberg, Refinitiv, or PitchBook license and query it in place — no rip-and-replace.",
    values: {
      Finsyt: "full",
      AlphaSense: "none",
      Hebbia: "partial",
      Rogo: "none",
      Quartr: "none",
      Daloopa: "none",
      Terminals: "none",
    },
  },
  {
    capability: "Builds the financial model",
    detail:
      "Extracts normalized statements and pushes them straight into Excel via the add-in, formulas intact.",
    values: {
      Finsyt: "full",
      AlphaSense: "partial",
      Hebbia: "partial",
      Rogo: "full",
      Quartr: "none",
      Daloopa: "full",
      Terminals: "partial",
    },
  },
  {
    capability: "Drafts the investment memo & deck",
    detail:
      "Generates a structured memo and a banker-style slide deck with an attribution appendix.",
    values: {
      Finsyt: "full",
      AlphaSense: "none",
      Hebbia: "partial",
      Rogo: "full",
      Quartr: "none",
      Daloopa: "none",
      Terminals: "none",
    },
  },
  {
    capability: "Decision Matrix (cross-company extraction)",
    detail:
      "Run one question across a basket of companies and get a structured, cited comparison grid.",
    values: {
      Finsyt: "full",
      AlphaSense: "partial",
      Hebbia: "full",
      Rogo: "partial",
      Quartr: "none",
      Daloopa: "partial",
      Terminals: "partial",
    },
  },
  {
    capability: "Ingests your internal memos & models",
    detail:
      "Your proprietary research, data-room files, and Excel models become first-class, queryable sources.",
    values: {
      Finsyt: "full",
      AlphaSense: "partial",
      Hebbia: "full",
      Rogo: "full",
      Quartr: "none",
      Daloopa: "none",
      Terminals: "none",
    },
  },
  {
    capability: "Live earnings transcripts & events",
    detail:
      "Real-time transcripts, call coverage, and an earnings calendar across global names.",
    values: {
      Finsyt: "full",
      AlphaSense: "full",
      Hebbia: "partial",
      Rogo: "partial",
      Quartr: "full",
      Daloopa: "none",
      Terminals: "full",
    },
  },
  {
    capability: "No training on your data",
    detail:
      "Customer content is never used to train any model — contractual no-train endpoints only.",
    values: {
      Finsyt: "full",
      AlphaSense: "full",
      Hebbia: "full",
      Rogo: "full",
      Quartr: "partial",
      Daloopa: "full",
      Terminals: "partial",
    },
  },
  {
    capability: "Transparent, published per-seat pricing",
    detail:
      "Seat pricing you can see before a sales call — benchmarked against terminal seats and analyst hours.",
    values: {
      Finsyt: "full",
      AlphaSense: "none",
      Hebbia: "none",
      Rogo: "none",
      Quartr: "partial",
      Daloopa: "none",
      Terminals: "none",
    },
  },
];

const DIFFERENTIATORS: {
  icon: typeof Layers;
  title: string;
  body: string;
}[] = [
  {
    icon: Layers,
    title: "Bring-your-own-license federation",
    body:
      "You already pay for FactSet, Capital IQ, Bloomberg, Refinitiv, or PitchBook. Finsyt routes queries through your existing entitlements instead of forcing a second data contract — so your investment committee sees the numbers it already trusts.",
  },
  {
    icon: Quote,
    title: "Sentence-level provenance",
    body:
      "Not a footnote to a 200-page PDF — a link to the exact sentence behind every claim, across filings, transcripts, and your own files. Compliance can audit any output without taking the model's word for it.",
  },
  {
    icon: DollarSign,
    title: "Price you can actually see",
    body:
      "Published per-seat pricing benchmarked against a terminal seat and the analyst hours it replaces — no opaque enterprise-only quote to find out if it fits your budget.",
  },
];

function Cell({ value }: { value: Support }) {
  if (value === "full") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-500/10 text-green-600">
        <Check className="w-4 h-4" strokeWidth={3} />
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/10 text-amber-600">
        <Minus className="w-4 h-4" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted text-muted-foreground/50">
      <X className="w-4 h-4" strokeWidth={2.5} />
    </span>
  );
}

export default function Compare() {
  return (
    <main className="min-h-screen bg-background">
      {/* HERO */}
      <section className="relative pt-32 pb-16 md:pt-40 md:pb-20 px-6 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-secondary/60 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto relative text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={FADE_UP}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6 tracking-wide"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            HOW FINSYT COMPARES
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={FADE_UP}
            className="font-display font-bold text-foreground tracking-[-0.03em] leading-[1.03] text-4xl md:text-6xl mb-6"
          >
            One workspace that builds the model, drafts the memo, and shows its
            work.
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={FADE_UP}
            className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed"
          >
            Most tools do one slice well — search, or transcripts, or
            extraction. Finsyt unifies the deliverable workflow over the data
            licenses you already own, with provenance on every line.
          </motion.p>
        </div>
      </section>

      {/* DIFFERENTIATORS */}
      <section className="px-6 pb-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-3 gap-5">
          {DIFFERENTIATORS.map((d) => (
            <motion.div
              key={d.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="w-11 h-11 rounded-xl bg-secondary border border-border flex items-center justify-center mb-5">
                <d.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground mb-2 leading-snug">
                {d.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {d.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* MATRIX */}
      <section className="py-16 md:py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-10">
            <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
              CAPABILITY MATRIX
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] leading-[1.1] text-foreground mb-4">
              An honest head-to-head.
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              Where a competitor genuinely ships a capability, we say so. A
              half-circle means a narrower scope than Finsyt — not that the tool
              is bad at it.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm min-w-[860px] border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left font-semibold px-5 py-4 align-bottom text-foreground w-[280px]">
                    Capability
                  </th>
                  {COMPETITORS.map((c) => (
                    <th
                      key={c}
                      className={`px-3 py-4 text-center font-semibold align-bottom ${
                        c === "Finsyt"
                          ? "text-primary bg-primary/5"
                          : "text-muted-foreground"
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row, i) => (
                  <tr
                    key={row.capability}
                    className={
                      i < ROWS.length - 1 ? "border-b border-border" : ""
                    }
                  >
                    <td className="px-5 py-4 align-top">
                      <div className="font-semibold text-foreground mb-1">
                        {row.capability}
                      </div>
                      <div className="text-xs text-muted-foreground leading-snug max-w-[260px]">
                        {row.detail}
                      </div>
                    </td>
                    {COMPETITORS.map((c) => (
                      <td
                        key={c}
                        className={`px-3 py-4 text-center align-middle ${
                          c === "Finsyt" ? "bg-primary/5" : ""
                        }`}
                      >
                        <div className="flex justify-center">
                          <Cell value={row.values[c]} />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-6 mt-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10 text-green-600">
                <Check className="w-3 h-3" strokeWidth={3} />
              </span>
              Full capability
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 text-amber-600">
                <Minus className="w-3 h-3" strokeWidth={3} />
              </span>
              Partial / narrower scope
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-muted-foreground/50">
                <X className="w-3 h-3" strokeWidth={2.5} />
              </span>
              Not offered
            </span>
          </div>
          <p className="mt-4 text-xs text-muted-foreground max-w-3xl">
            Comparison reflects Finsyt's assessment of publicly documented
            capabilities as of 2026 and is provided for evaluation purposes.
            Competitor offerings evolve — we encourage you to verify against
            current vendor documentation.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto rounded-3xl border border-border bg-card p-10 md:p-14 text-center">
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] text-foreground mb-4">
            See the difference on your own coverage.
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            We'll run Finsyt live against your target companies and the data
            licenses you already pay for.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/request-access">
              <Button size="lg" className="h-12 px-6 text-base gap-2 rounded-md font-semibold">
                Request Access <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-6 text-base rounded-md font-semibold border-foreground/15 hover:bg-secondary"
              >
                Compare pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
