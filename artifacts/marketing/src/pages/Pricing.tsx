import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Pricing() {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-6xl font-display font-bold mb-6"
          >
            Institutional power.<br />Transparent pricing.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-muted-foreground"
          >
            Equip your analysts with the ultimate research advantage.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Analyst Tier */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="border border-border rounded-2xl p-8 bg-card flex flex-col"
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">Analyst</h3>
              <p className="text-muted-foreground text-sm">For individual researchers and boutique funds.</p>
            </div>
            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">$1,200</span>
                <span className="text-muted-foreground">/user/mo</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Billed annually</p>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Unlimited global SEC filings & transcripts</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Standard broker research integration</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Up to 500 document uploads / month</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Basic AI summarization & querying</span>
              </li>
            </ul>
            <a href="/platform/app/upgrade" className="w-full">
              <Button variant="outline" className="w-full h-12">Start 14-Day Trial</Button>
            </a>
          </motion.div>

          {/* Team Tier */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="border-2 border-primary rounded-2xl p-8 bg-card relative flex flex-col shadow-xl shadow-primary/5"
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              Most Popular
            </div>
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">Team</h3>
              <p className="text-muted-foreground text-sm">For collaborative research teams & mid-sized funds.</p>
            </div>
            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">$2,500</span>
                <span className="text-muted-foreground">/user/mo</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Billed annually</p>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm font-medium">Everything in Analyst, plus:</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Premium broker & independent research</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Unlimited internal document ingestion</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Shared team workspaces & annotations</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Excel add-in & financial modeling tools</span>
              </li>
            </ul>
            <a href="/platform/app/upgrade" className="w-full">
              <Button className="w-full h-12">Request Access</Button>
            </a>
          </motion.div>

          {/* Enterprise Tier */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="border border-border rounded-2xl p-8 bg-card flex flex-col"
          >
            <div className="mb-8">
              <h3 className="text-2xl font-bold mb-2">Enterprise</h3>
              <p className="text-muted-foreground text-sm">For global asset managers & investment banks.</p>
            </div>
            <div className="mb-8">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">Custom</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">Volume-based pricing</p>
            </div>
            <ul className="space-y-4 mb-8 flex-1">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm font-medium">Everything in Team, plus:</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Custom LLM fine-tuning on proprietary data</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">API access & workflow automation</span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">Dedicated customer success manager</span>
              </li>
              <li className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-sm">On-premise / VPC deployment options</span>
              </li>
            </ul>
            <a href="mailto:hello@finsyt.com" className="w-full">
              <Button variant="secondary" className="w-full h-12">Contact Sales</Button>
            </a>
          </motion.div>
        </div>
      </div>
    </main>
  );
}