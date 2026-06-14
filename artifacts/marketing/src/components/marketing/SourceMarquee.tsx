import React from "react";
import { motion } from "framer-motion";

const SOURCES = [
  "SEC Filings",
  "Earnings Transcripts",
  "Broker Research",
  "Internal Memos",
  "Excel Models",
  "ESG Reports",
  "Conference Calls",
  "Investor Days",
  "Industry Reports",
  "Regulatory Filings",
  "Press Releases",
  "Analyst Notes",
];

export default function SourceMarquee() {
  const row = [...SOURCES, ...SOURCES];
  return (
    <div className="border-y border-zinc-200 bg-white overflow-hidden py-6">
      <motion.div
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 40, ease: "linear", repeat: Infinity }}
      >
        {row.map((s, i) => (
          <div
            key={i}
            className="flex items-center gap-12 text-zinc-500 text-sm font-medium tracking-wide uppercase"
          >
            <span>{s}</span>
            <span className="text-primary/60">/</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
