import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Zap, Users, Building2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import SocialProof from "@/components/marketing/SocialProof";

type TierFeature = { label: string; lead: boolean; shield?: boolean };

const TIERS: {
  name: string;
  blurb: string;
  price: string;
  unit: string;
  note: string;
  cta: string;
  ctaHref: string;
  ctaExternal?: boolean;
  variant: "outline" | "default" | "secondary";
  featured: boolean;
  valueLine: string;
  features: TierFeature[];
}[] = [
  {
    name: "Starter",
    blurb: "Self-serve access for independent researchers and solo practitioners.",
    price: "$149",
    unit: "/mo",
    note: "Billed monthly · no credit card to start",
    cta: "Start Free — No Card Needed",
    ctaHref: "/platform/sign-up",
    ctaExternal: true,
    variant: "outline" as const,
    featured: false,
    valueLine: "Get up and running in minutes. No sales call, no contract.",
    features: [
      { label: "AI research agent — 50 queries / month", lead: false },
      { label: "25 document uploads / month", lead: false },
      { label: "U.S. SEC filings & earnings transcripts", lead: false },
      { label: "Company analysis pages & basic screening", lead: false },
      { label: "Email support", lead: false },
    ],
  },
  {
    name: "Analyst",
    blurb: "For individual researchers and boutique funds who need full depth.",
    price: "$1,200",
    unit: "/user/mo",
    note: "Billed annually",
    cta: "Start 14-Day Trial",
    ctaHref: "/platform/sign-up",
    ctaExternal: true,
    variant: "default" as const,
    featured: true,
    valueLine: "Roughly one analyst day a week back — at a fraction of a terminal seat.",
    features: [
      { label: "Everything in Starter, plus:", lead: true },
      { label: "Unlimited AI research agent queries", lead: false },
      { label: "Up to 500 document uploads / month", lead: false },
      { label: "Global SEC filings, transcripts & macro data", lead: false },
      { label: "Sentence-level citations on every AI answer", lead: false },
      { label: "Excel export of extracted tables", lead: false },
    ],
  },
  {
    name: "Team",
    blurb: "For collaborative research teams and mid-sized funds.",
    price: "$2,500",
    unit: "/user/mo",
    note: "Billed annually",
    cta: "Request Access",
    ctaHref: "/request-access",
    variant: "secondary" as const,
    featured: false,
    valueLine: "Cheaper than a second junior analyst — across your whole desk.",
    features: [
      { label: "Everything in Analyst, plus:", lead: true },
      { label: "Shared team workspaces & annotations", lead: false },
      { label: "Unlimited internal document ingestion", lead: false },
      { label: "Memo drafting & deck generation", lead: false },
      { label: "Excel add-in with live cell tracing", lead: false },
      { label: "Bring-your-own-license connector federation", lead: false },
    ],
  },
];

const VALUE_POINTS = [
  {
    icon: Zap,
    stat: "Start in minutes",
    title: "No sales call required",
    body: "The Starter plan is self-serve and free to try — sign up, connect a ticker, and see the research agent in action before spending a dollar.",
  },
  {
    icon: Users,
    stat: "80% → 20%",
    title: "Invert the research ratio",
    body: "Analysts spend most of their time finding and standardizing data. Finsyt flips that, handing back hours that go straight into generating insight.",
  },
  {
    icon: Building2,
    stat: "BYO license",
    title: "Keep the licenses you own",
    body: "Federate over your existing FactSet, Capital IQ, Bloomberg, or Refinitiv entitlements instead of paying twice for the same data.",
  },
];

export default function Pricing() {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-display font-bold mb-6"
          >
            Start free. Scale with<br />your conviction.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground mb-6"
          >
            From solo researcher to full institutional desk — with published
            pricing you can see before a sales call, and a self-serve entry
            point that requires no contract to start.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <a href="/platform/sign-up">
              <Button size="lg" className="h-12 px-6 text-base gap-2 font-semibold">
                Try Starter Free <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="h-12 px-6 text-base font-semibold border-foreground/15 hover:bg-secondary">
                Watch interactive demo
              </Button>
            </Link>
          </motion.div>
        </div>

        {/* VALUE FRAMING */}
        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto mb-16 md:mb-20">
          {VALUE_POINTS.map((v) => (
            <motion.div
              key={v.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <v.icon className="w-5 h-5 text-primary" />
                </div>
                <span className="font-display font-bold text-lg text-primary">{v.stat}</span>
              </div>
              <h3 className="font-semibold text-foreground mb-2">{v.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{v.body}</p>
            </motion.div>
          ))}
        </div>

        {/* TIER CARDS */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className={`rounded-2xl p-8 bg-card flex flex-col ${
                tier.featured
                  ? "border-2 border-primary relative shadow-xl shadow-primary/5"
                  : "border border-border"
              }`}
            >
              {tier.featured && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">{tier.name}</h3>
                <p className="text-muted-foreground text-sm">{tier.blurb}</p>
              </div>
              <div className="mb-4">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tier.unit && <span className="text-muted-foreground">{tier.unit}</span>}
                </div>
                <p className="text-sm text-muted-foreground mt-2">{tier.note}</p>
              </div>
              <div className="mb-6 rounded-lg bg-secondary/60 border border-border px-4 py-3">
                <p className="text-xs text-secondary-foreground leading-snug">{tier.valueLine}</p>
              </div>
              <ul className="space-y-4 mb-8 flex-1">
                {tier.features.map((f) => (
                  <li key={f.label} className="flex items-start gap-3">
                    {f.shield ? (
                      <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    )}
                    <span className={`text-sm ${f.lead ? "font-medium" : ""}`}>{f.label}</span>
                  </li>
                ))}
              </ul>
              {tier.ctaExternal ? (
                <a href={tier.ctaHref} className="block">
                  <Button variant={tier.variant} className="w-full h-12">
                    {tier.cta}
                  </Button>
                </a>
              ) : (
                <Link href={tier.ctaHref}>
                  <Button variant={tier.variant} className="w-full h-12">
                    {tier.cta}
                  </Button>
                </Link>
              )}
            </motion.div>
          ))}
        </div>

        {/* LIMITS NOTE */}
        <p className="text-center text-xs text-muted-foreground mt-8 max-w-xl mx-auto">
          Analyst and Team plans include a 14-day trial at no charge. Starter is available immediately with no trial period required. Billing and plan upgrades are currently managed through our sales team — self-serve checkout coming soon.
        </p>

        {/* SOCIAL PROOF */}
        <div className="mt-20 -mx-6">
          <SocialProof variant="compact" />
        </div>

        {/* ENTERPRISE CTA */}
        <div className="mt-20 max-w-6xl mx-auto rounded-3xl bg-foreground text-background px-8 md:px-14 py-14 md:py-16 relative overflow-hidden">
          <div className="grid lg:grid-cols-12 gap-8 items-center relative">
            <div className="lg:col-span-8">
              <div className="text-xs font-semibold tracking-[0.2em] text-background/60 mb-3">ENTERPRISE</div>
              <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] mb-4 leading-tight">
                Consolidate terminals, point tools, and analyst hours into one auditable workspace.
              </h2>
              <p className="text-background/75 text-lg leading-relaxed max-w-2xl">
                We'll build a side-by-side cost model against your current
                terminal seats and tooling spend, and run a live proof of value
                on your own coverage universe — with SSO, audit logs, and
                deployment options your security team signs off on.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col gap-4 lg:items-end">
              <Link href="/request-access" className="w-full lg:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full h-12 px-6 text-base gap-2 rounded-md font-semibold bg-background text-foreground hover:bg-background/90"
                >
                  Talk to Sales <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link href="/compare" className="w-full lg:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full h-12 px-6 text-base rounded-md font-semibold bg-transparent border-background/30 text-background hover:bg-background/10"
                >
                  Compare vs. alternatives
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
