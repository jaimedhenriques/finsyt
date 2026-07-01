import React from "react";
import { motion } from "framer-motion";

const SOURCES = [
  "Connector Hub",
  "SEC EDGAR",
  "Earnings Transcripts",
  "FactSet · BYO License",
  "Capital IQ · BYO License",
  "Bloomberg DL · BYO License",
  "FMP",
  "Finnhub",
  "World Bank",
  "FRED",
  "Apify Alt-Data",
  "MCP Server",
  "Refinitiv / LSEG · BYO License",
  "PitchBook · BYO License",
  "U.S. Census Bureau",
];

export default function SourceMarquee() {
  const row = [...SOURCES, ...SOURCES];
  return (
    <div className="border-y border-zinc-200 bg-white overflow-hidden py-6">
      <motion.div
        className="flex gap-12 whitespace-nowrap"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 55, ease: "linear", repeat: Infinity }}
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
