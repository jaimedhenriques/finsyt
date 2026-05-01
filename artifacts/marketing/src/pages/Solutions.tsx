import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Briefcase, Landmark, Building, LineChart, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

const solutions = [
  {
    id: "hedge-funds",
    icon: <LineChart className="w-6 h-6 text-primary" />,
    title: "Hedge Funds",
    description: "Generate alpha faster by synthesizing alternative data, broker research, and market sentiment in seconds, not days.",
    features: [
      "Instantly extract KPI tables from messy earnings transcripts.",
      "Monitor thematic trends across hundreds of companies simultaneously.",
      "Back-test hypotheses using historical filing archives."
    ]
  },
  {
    id: "asset-managers",
    icon: <PieChart className="w-6 h-6 text-primary" />,
    title: "Asset Managers",
    description: "Scale your coverage universe without scaling headcount. Maintain deep, continuous diligence across your entire portfolio.",
    features: [
      "Automate quarterly earnings summaries and variance analysis.",
      "Track management sentiment shifts across sequential calls.",
      "Compare ESG initiatives and regulatory compliance across peers."
    ]
  },
  {
    id: "investment-banking",
    icon: <Landmark className="w-6 h-6 text-primary" />,
    title: "Investment Banking",
    description: "Accelerate deal prep and pitchbook creation. Finsyt acts as an elite junior analyst that never sleeps.",
    features: [
      "Instantly generate precedent transaction comps and trading multiples.",
      "Draft comprehensive industry landscapes and competitive positioning slides.",
      "Extract structured data directly into your Excel valuation models."
    ]
  },
  {
    id: "private-equity",
    icon: <Briefcase className="w-6 h-6 text-primary" />,
    title: "Private Equity",
    description: "De-risk acquisitions with exhaustive, AI-powered commercial due diligence and market mapping.",
    features: [
      "Ingest and analyze massive VDR data rooms in hours.",
      "Map out niche, fragmented markets using unstructured web data.",
      "Identify synergistic add-on targets based on specific operational criteria."
    ]
  },
  {
    id: "corporate-strategy",
    icon: <Building className="w-6 h-6 text-primary" />,
    title: "Corporate Strategy",
    description: "Maintain an information advantage over your competitors. Understand market shifts before they show up in lagging indicators.",
    features: [
      "Monitor competitor product launches, pricing changes, and R&D focus.",
      "Analyze the regulatory landscape and potential M&A roadblocks.",
      "Benchmark your operational metrics against industry best-in-class."
    ]
  }
];

export default function Solutions() {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-display font-bold mb-6"
          >
            Built for elite finance.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground"
          >
            Whatever your mandate, Finsyt accelerates your specific research workflows with precision and auditability.
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

        <div className="mt-32 text-center bg-card border border-border rounded-2xl p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
          <h2 className="text-3xl font-display font-bold mb-4 relative z-10">See how Finsyt fits your mandate.</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto relative z-10">
            Request a personalized demo to see Finsyt applied to your specific coverage universe and proprietary models.
          </p>
          <Link href="/request-access" className="relative z-10">
             <Button size="lg" className="h-14 px-8 text-base">Request Personalized Demo</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}