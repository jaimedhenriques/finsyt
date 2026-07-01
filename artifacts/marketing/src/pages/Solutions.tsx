import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Briefcase, Landmark, Building, LineChart, PieChart, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import SocialProof from "@/components/marketing/SocialProof";

// Premium-data providers Finsyt federates over via the Connector Hub.
// Each entry's `slug` matches a CatalogEntry in
// `artifacts/platform/lib/connectors/catalog.ts` so the deep-link lands the
// reader directly on a tile they can connect their existing licence to.
const PREMIUM_PROVIDERS: Array<{ slug: string; name: string; pitch: string }> = [
  { slug: "factset", name: "FactSet", pitch: "Symbology, Prices, Fundamentals & Estimates over your existing FactSet API key." },
  { slug: "spglobal-capiq", name: "S&P Capital IQ", pitch: "Quotes, financials, and transactions through the Capital IQ Marketplace API." },
  { slug: "refinitiv-lseg", name: "Refinitiv / LSEG", pitch: "RDP symbology, real-time pricing, and news with your bearer token + App Key." },
  { slug: "bloomberg-dl", name: "Bloomberg Data License", pitch: "BEAP catalogs, universes, and DL request status over your DL service account." },
  { slug: "pitchbook", name: "PitchBook", pitch: "Private companies, funding rounds, and deal flow against your PitchBook seat." },
];

const solutions = [
  {
    id: "hedge-funds",
    icon: <LineChart className="w-6 h-6 text-primary" />,
    title: "Hedge Funds",
    description: "Generate alpha faster by running research agents across alternative data, broker research, and your licensed market data feeds — all in a single control plane.",
    features: [
      "Extract KPI tables from earnings transcripts and filings with agent-level precision.",
      "Monitor thematic trends across hundreds of companies with the decision-matrix agent.",
      "Federate your existing FactSet or Bloomberg license so agents run against your trusted numbers.",
      "Every answer cites the providers and connectors it touched, with response times and source passages."
    ]
  },
  {
    id: "asset-managers",
    icon: <PieChart className="w-6 h-6 text-primary" />,
    title: "Asset Managers",
    description: "Scale your coverage universe without scaling headcount. Deploy agents that maintain continuous diligence across your entire portfolio.",
    features: [
      "Automate quarterly earnings summaries and variance analysis with the earnings blueprint.",
      "Track management sentiment shifts across sequential calls.",
      "Compare ESG initiatives and regulatory compliance across peers.",
      "Every memo carries a 'Data sources used' footer showing exactly which feeds powered each section."
    ]
  },
  {
    id: "investment-banking",
    icon: <Landmark className="w-6 h-6 text-primary" />,
    title: "Investment Banking",
    description: "Accelerate deal prep and pitchbook creation. Finsyt's research agents act as elite junior analysts that work autonomously and cite their sources.",
    features: [
      "Generate precedent transaction comps and trading multiples via the peer-comparison agent.",
      "Draft industry landscapes and competitive positioning sections with citations.",
      "Export structured financial tables to Excel — native add-in with formula mapping in development.",
      "Pitchbooks ship with provider attribution baked in — no manual source-hunting before sending."
    ]
  },
  {
    id: "private-equity",
    icon: <Briefcase className="w-6 h-6 text-primary" />,
    title: "Private Equity",
    description: "De-risk acquisitions with AI-powered commercial due diligence. Ingest VDR data rooms and mapped market data through the Connector Hub.",
    features: [
      "Sync data-room folders (Box, Dropbox, Datasite, Intralinks, SecureDocs) directly into a diligence workspace.",
      "Run the decision-matrix agent across VDR documents and public filings simultaneously.",
      "Connect PitchBook to surface private company comparables without leaving the workspace.",
      "Diligence answers cite every connector touched — IC reviewers can trace provenance instantly."
    ]
  },
  {
    id: "corporate-strategy",
    icon: <Building className="w-6 h-6 text-primary" />,
    title: "Corporate Strategy",
    description: "Maintain an information advantage over your competitors. Finsyt agents monitor market shifts and surface structured intelligence on demand.",
    features: [
      "Monitor competitor product launches, pricing changes, and R&D focus across filings and transcripts.",
      "Analyze the regulatory landscape and potential M&A roadblocks with a dedicated macro agent.",
      "Benchmark operational metrics against industry peers using the peer-comparison workflow.",
      "Strategy briefings show which feeds powered each insight, with deep links into the Connector Hub."
    ]
  }
];

export default function Solutions() {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6 tracking-wide"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            AGENTIC RESEARCH · BY MANDATE
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-display font-bold mb-6"
          >
            Built for institutional finance.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground"
          >
            One agentic control plane. Purpose-built workflows for each mandate —
            from sell-side bankers to long/short PMs to corporate strategists.
            Federate your existing data licenses through the Connector Hub so
            agents run against the numbers your investment committee already trusts.
          </motion.p>
        </div>

        <div className="flex flex-col gap-12 md:gap-24">
          {solutions.map((solution, index) => (
            <motion.div 
              key={solution.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className={`grid md:grid-cols-2 gap-12 items-center ${index % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
            >
              <div className={index % 2 === 1 ? 'md:order-2' : 'md:order-1'}>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-6">
                  {solution.icon}
                </div>
                <h2 className="text-3xl font-display font-bold mb-4">{solution.title}</h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  {solution.description}
                </p>
                <ul className="space-y-4 mb-8">
                  {solution.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/request-access">
                  <Button variant="outline" className="gap-2">
                    Explore {solution.title} Workflow <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
              
              <div className={`bg-muted/30 border border-border rounded-2xl p-8 h-full min-h-[300px] flex items-center justify-center ${index % 2 === 1 ? 'md:order-1' : 'md:order-2'}`}>
                 <div className="text-center text-muted-foreground/50 font-display font-medium text-lg">
                    Interactive Workflow Visualization<br />
                    <span className="text-sm font-sans font-normal">(Client-specific demo available upon request)</span>
                 </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Coming-from-X bridge: speaks directly to teams who already pay
            for FactSet / CapIQ / Refinitiv / Bloomberg DL / PitchBook and
            wonders whether they have to rip-and-replace. They do not — every
            tile in this list is a one-credential connect away on the platform. */}
        <motion.section
          id="coming-from"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mt-32"
          aria-labelledby="coming-from-heading"
        >
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="w-12 h-12 mx-auto rounded-lg bg-primary/10 flex items-center justify-center mb-6">
              <Plug className="w-6 h-6 text-primary" />
            </div>
            <h2 id="coming-from-heading" className="text-3xl md:text-4xl font-display font-bold mb-4">
              Coming from FactSet, Capital&nbsp;IQ, Bloomberg, Refinitiv, or PitchBook?
            </h2>
            <p className="text-lg text-muted-foreground">
              Keep your data licences. Finsyt federates over them. Plug your existing credentials into the Connector
              Hub and every workflow above runs against the same numbers your investment committee already trusts.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PREMIUM_PROVIDERS.map((p) => (
              <a
                key={p.slug}
                href={`/platform/app/connectors?source=${encodeURIComponent(p.slug)}`}
                className="group bg-card border border-border rounded-xl p-6 transition hover:border-primary/60 hover:bg-primary/5"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="text-lg font-display font-semibold">{p.name}</h3>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-300">
                    BYO License
                  </span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {p.pitch}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary opacity-90 group-hover:opacity-100">
                  Connect in the Hub <ArrowRight className="w-4 h-4" />
                </span>
              </a>
            ))}
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Finsyt redistributes none of these feeds. You bring the licence, we route the call,
            cache the response, audit who read what, and surface the upstream rate-limit headroom.
          </p>
        </motion.section>

        <div className="mt-32 -mx-6">
          <SocialProof variant="compact" />
        </div>

        <div className="mt-16 text-center bg-card border border-border rounded-2xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
          <h2 className="text-3xl font-display font-bold mb-4 relative z-10">See Finsyt federated over your data stack.</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto relative z-10">
            Request a personalized demo to see Finsyt's agentic control plane applied to your specific coverage universe, connector stack, and proprietary data.
          </p>
          <Link href="/request-access" className="relative z-10">
             <Button size="lg" className="h-14 px-8 text-base">Request Personalized Demo</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
