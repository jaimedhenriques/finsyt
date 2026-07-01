/**
 * Social proof configuration — the single source of truth for all partner
 * logos, testimonials, and metrics on the marketing site.
 *
 * HOW TO ADD REAL CONTENT (no code changes required):
 *
 * Logos: set `isPlaceholder: false`, add `displayName` and `logoSrc`.
 *   logoSrc can be a URL or a path inside /public (e.g. "/logos/acme.svg").
 *   Omit `logoSrc` to keep the category tile; add `href` to make it a link.
 *
 * Testimonials: set `isPlaceholder: false`, add real `quote`, `author`,
 *   `role`, `firm`, and `firmType`. Remove the NDA badge by setting
 *   `isPlaceholder: false`.
 *
 * Metrics: update `value`, `label`, `sublabel` freely — no code changes.
 */

export type PartnerLogo = {
  id: string;
  category: "hedge-fund" | "asset-manager" | "bank" | "pe" | "research";
  isPlaceholder: boolean;
  /** Shown as the logo alt text and tile label when real. */
  displayName?: string;
  /** URL or /public path to the partner's SVG/PNG wordmark. */
  logoSrc?: string;
  /** Optional link URL for the logo tile. */
  href?: string;
};

export type Testimonial = {
  id: string;
  quote: string;
  role: string;
  firm: string;
  firmType: string;
  /** True = show NDA badge and render as illustrative placeholder. */
  isPlaceholder: boolean;
  /** Author name — only shown when isPlaceholder is false. */
  author?: string;
};

export type MetricStat = {
  value: string;
  label: string;
  sublabel?: string;
};

// ─── PARTNER LOGOS ───────────────────────────────────────────────────────────
// Replace isPlaceholder with false and add displayName + logoSrc once written
// reference approval is received from the partner.

export const PARTNER_LOGOS: PartnerLogo[] = [
  { id: "hf-1", category: "hedge-fund", isPlaceholder: true },
  { id: "am-1", category: "asset-manager", isPlaceholder: true },
  { id: "ib-1", category: "bank", isPlaceholder: true },
  { id: "pe-1", category: "pe", isPlaceholder: true },
  { id: "hf-2", category: "hedge-fund", isPlaceholder: true },
  { id: "am-2", category: "asset-manager", isPlaceholder: true },
];

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────
// Quotes below are illustrative of the kinds of outcomes the product is
// designed to produce. Replace with approved customer quotes (isPlaceholder: false)
// once written permission is received.

export const TESTIMONIALS: Testimonial[] = [
  {
    id: "t-1",
    quote:
      "Illustrative quote: a research team describes cutting earnings-prep time " +
      "and appreciating the sentence-level citations that let IC trace every " +
      "figure back to the source filing.",
    role: "Head of Research",
    firm: "Multi-Strategy Fund",
    firmType: "Undisclosed AUM",
    isPlaceholder: true,
  },
  {
    id: "t-2",
    quote:
      "Illustrative quote: a PE partner describes running a VDR-to-CDD-memo " +
      "proof of value and finding the provenance trail the deciding factor for " +
      "the team's adoption decision.",
    role: "Partner",
    firm: "Mid-Market PE Firm",
    firmType: "Growth Equity",
    isPlaceholder: true,
  },
  {
    id: "t-3",
    quote:
      "Illustrative quote: a technology director describes federating an existing " +
      "data licence through the Connector Hub so every workflow runs against " +
      "numbers the investment committee already trusts.",
    role: "Director of Technology",
    firm: "Global Asset Manager",
    firmType: "Long-Only Equity",
    isPlaceholder: true,
  },
];

// ─── METRICS ─────────────────────────────────────────────────────────────────

export const METRIC_STATS: MetricStat[] = [
  {
    value: "40+",
    label: "Firms in private beta",
    sublabel: "across hedge funds, PE, and asset managers",
  },
  {
    value: "2 hrs",
    label: "Target CDD memo time",
    sublabel: "from raw VDR to fully-cited draft",
  },
  {
    value: "80%",
    label: "Research time targeted",
    sublabel: "to shift from data sourcing to generating insight",
  },
];
