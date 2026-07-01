import React from "react";
import { motion, type Variants } from "framer-motion";
import { Quote, Users } from "lucide-react";
import { PARTNER_LOGOS, TESTIMONIALS, METRIC_STATS, type PartnerLogo, type Testimonial } from "@/data/social-proof";

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const STAGGER = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const CATEGORY_ABBR: Record<string, string> = {
  "hedge-fund": "HF",
  "asset-manager": "AM",
  "bank": "IB",
  "pe": "PE",
  "research": "RS",
};

const CATEGORY_LABEL: Record<string, string> = {
  "hedge-fund": "Hedge Fund",
  "asset-manager": "Asset Manager",
  "bank": "Inv. Bank",
  "pe": "Private Equity",
  "research": "Research",
};

function LogoTile({ logo }: { logo: PartnerLogo }) {
  const inner = logo.isPlaceholder || !logo.logoSrc ? (
    <div className="h-14 flex items-center justify-center px-6 rounded-xl border border-dashed border-border bg-background/60 hover:border-primary/30 hover:bg-primary/5 transition-colors">
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-bold tracking-[0.15em] text-primary/50 uppercase">
          {CATEGORY_ABBR[logo.category] ?? "FI"}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground/70 whitespace-nowrap">
          {CATEGORY_LABEL[logo.category] ?? "Institution"}
        </span>
      </div>
    </div>
  ) : (
    <div className="h-14 flex items-center justify-center px-6 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-primary/5 transition-colors">
      <img
        src={logo.logoSrc}
        alt={logo.displayName ?? logo.category}
        className="max-h-8 max-w-[120px] object-contain opacity-70 hover:opacity-100 transition-opacity"
      />
    </div>
  );

  return logo.href ? (
    <a href={logo.href} target="_blank" rel="noopener noreferrer">
      {inner}
    </a>
  ) : (
    inner
  );
}

function TestimonialCard({ testimonial, delay = 0 }: { testimonial: Testimonial; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay }}
      className="relative rounded-2xl border border-border bg-card p-7 flex flex-col gap-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-[border-color,box-shadow]"
    >
      {testimonial.isPlaceholder && (
        <span className="absolute -top-3 right-5 rounded-full bg-secondary text-secondary-foreground text-[10px] font-semibold uppercase tracking-wider px-3 py-1 border border-border">
          Reference available under NDA
        </span>
      )}
      <Quote className="w-5 h-5 text-primary/40 shrink-0" />
      <blockquote className="text-sm text-foreground leading-relaxed flex-1">
        "{testimonial.quote}"
      </blockquote>
      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <div className="w-9 h-9 rounded-full bg-primary/10 border border-border flex items-center justify-center shrink-0">
          <span className="text-[10px] font-bold text-primary">
            {testimonial.role.charAt(0)}
          </span>
        </div>
        <div>
          <div className="text-xs font-semibold text-foreground">
            {testimonial.isPlaceholder ? testimonial.role : (testimonial.author ?? testimonial.role)}
          </div>
          <div className="text-xs text-muted-foreground">
            {testimonial.firm} · {testimonial.firmType}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export interface SocialProofProps {
  /** "full" = all testimonials (homepage); "compact" = first testimonial only (Solutions/Pricing) */
  variant?: "full" | "compact";
}

export default function SocialProof({ variant = "full" }: SocialProofProps) {
  const visibleTestimonials = variant === "compact" ? TESTIMONIALS.slice(0, 1) : TESTIMONIALS;

  return (
    <section className="py-24 md:py-32 px-6 bg-muted/30 border-y border-border">
      <div className="max-w-7xl mx-auto">

        {/* SECTION HEADER */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={STAGGER}
          className="text-center mb-14"
        >
          <motion.div
            variants={FADE_UP}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-5 tracking-wide"
          >
            <Users className="w-3.5 h-3.5 text-primary" />
            EARLY ACCESS
          </motion.div>
          <motion.h2
            variants={FADE_UP}
            className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] text-foreground mb-4"
          >
            In private beta with institutional design partners.
          </motion.h2>
          <motion.p variants={FADE_UP} className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Finsyt is live with a select group of hedge funds, PE firms, and asset managers
            helping shape the product before general availability.
          </motion.p>
        </motion.div>

        {/* METRIC STRIP */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={STAGGER}
          className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-2xl overflow-hidden border border-border mb-14"
        >
          {METRIC_STATS.map((stat) => (
            <motion.div
              key={stat.label}
              variants={FADE_UP}
              className="bg-card flex flex-col items-center text-center py-8 px-6"
            >
              <span className="font-display font-bold text-4xl md:text-5xl text-primary mb-1 tracking-tight">
                {stat.value}
              </span>
              <span className="font-semibold text-foreground text-sm mb-1">{stat.label}</span>
              {stat.sublabel && (
                <span className="text-xs text-muted-foreground">{stat.sublabel}</span>
              )}
            </motion.div>
          ))}
        </motion.div>

        {/* LOGO WALL */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
          className="mb-14"
        >
          <p className="text-center text-xs font-semibold text-muted-foreground tracking-[0.2em] uppercase mb-6">
            Design partners — names disclosed under NDA
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {PARTNER_LOGOS.map((logo) => (
              <LogoTile key={logo.id} logo={logo} />
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground/60 mt-4">
            Partner logos appear here once public reference agreements are signed.
            Named references are available to qualified prospects under NDA.
          </p>
        </motion.div>

        {/* TESTIMONIAL CARDS */}
        <div
          className={`grid gap-6 ${
            variant === "full" ? "md:grid-cols-3" : "max-w-2xl mx-auto"
          }`}
        >
          {visibleTestimonials.map((t, i) => (
            <TestimonialCard key={t.id} testimonial={t} delay={i * 0.08} />
          ))}
        </div>

      </div>
    </section>
  );
}
