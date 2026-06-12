import React from "react";
import { motion } from "framer-motion";

export default function About() {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-20"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 border border-primary/20">
            Our Mission
          </div>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-8 leading-tight">
            We are building the terminal for the AI era.
          </h1>
          <div className="prose prose-lg dark:prose-invert prose-p:text-muted-foreground prose-p:leading-relaxed max-w-none">
            <p>
              For the last two decades, financial software has been stagnant. Institutional investors have been forced to rely on legacy terminals that offer little more than keyword search layered over basic document viewers, charging exorbitant fees for outdated technology.
            </p>
            <p>
              Meanwhile, the volume of data—SEC filings, earnings transcripts, broker research, ESG reports, alternative data—has exploded. Analysts spend 80% of their time simply finding and standardizing information, and only 20% actually generating insights.
            </p>
            <p>
              <strong>Finsyt was built to invert that ratio.</strong>
            </p>
            <p>
              Founded by former hedge fund analysts and AI researchers, Finsyt leverages advanced large language models to understand financial context, semantics, and accounting nuances. We don't just search for text; we extract meaning, structure messy data, and provide auditable, cited answers in seconds.
            </p>
          </div>
        </motion.div>

        <div className="p-8 bg-card border border-border rounded-2xl text-center">
           <h3 className="text-2xl font-bold mb-4">Join our mission</h3>
           <p className="text-muted-foreground mb-6 max-w-lg mx-auto">We are always looking for exceptional engineers, product designers, and finance professionals who want to redefine how capital markets operate.</p>
           <a href="#" className="text-primary font-medium hover:underline">View open roles →</a>
        </div>
      </div>
    </main>
  );
}