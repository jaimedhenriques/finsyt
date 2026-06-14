import React from "react";
import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import {
  ShieldCheck,
  Lock,
  Globe2,
  Server,
  Trash2,
  BadgeCheck,
  KeyRound,
  Users,
  Network,
  BrainCircuit,
  Mail,
  FileText,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FADE_UP: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const STAGGER = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

type StatusLabel = "Certified" | "In progress" | "Roadmap";

const statusStyles: Record<StatusLabel, string> = {
  Certified: "bg-green-500/10 text-green-600 border-green-500/20",
  "In progress": "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Roadmap: "bg-muted text-muted-foreground border-border",
};

function StatusBadge({ status }: { status: StatusLabel }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

const PILLARS: {
  icon: typeof ShieldCheck;
  title: string;
  body: string;
  status: StatusLabel;
}[] = [
  {
    icon: BrainCircuit,
    title: "No Training on Your Data",
    body:
      "Customer prompts, uploaded documents, and AI outputs are never used to train Finsyt's or any third-party model. All inference runs through contractual no-train endpoints.",
    status: "Certified",
  },
  {
    icon: Lock,
    title: "Encryption Everywhere",
    body:
      "TLS 1.2+ for every request in transit. AES-256 at rest for documents, embeddings, databases, and backups. Keys are managed by our cloud provider's KMS with regular rotation.",
    status: "Certified",
  },
  {
    icon: Globe2,
    title: "Data Residency",
    body:
      "Customer data is stored in US (us-east) regions by default. EU residency is available for Enterprise customers on request, with no cross-region replication of customer content.",
    status: "In progress",
  },
  {
    icon: Server,
    title: "Isolation & Tenant Separation",
    body:
      "Every workspace is logically isolated with row-level tenant scoping enforced in the data layer. Vector indexes, document stores, and audit logs are partitioned per workspace.",
    status: "Certified",
  },
  {
    icon: Trash2,
    title: "Data Retention & Deletion",
    body:
      "You control your data. Documents and chat history can be deleted on demand and are purged from primary storage and backups within 30 days. Account deletion removes all customer content.",
    status: "Certified",
  },
  {
    icon: BadgeCheck,
    title: "Compliance & Certifications",
    body:
      "We are pursuing SOC 2 Type 2 and ISO 27001 attestations and operate to the controls expected of an enterprise SaaS handling sensitive financial research.",
    status: "In progress",
  },
  {
    icon: KeyRound,
    title: "Authentication & SSO",
    body:
      "Email + password with optional MFA today. SAML 2.0 / OIDC SSO and SCIM provisioning are on the Enterprise roadmap, with enforced SSO and just-in-time provisioning.",
    status: "Roadmap",
  },
  {
    icon: Users,
    title: "Access Control",
    body:
      "Role-based access control across workspaces, teams, and projects. Detailed audit logs of authentication, document access, and admin actions, exportable for Enterprise customers.",
    status: "In progress",
  },
  {
    icon: Network,
    title: "Vendor & Data Provider Posture",
    body:
      "We diligence every subprocessor and data vendor for security, retention, and AI-training posture. We only use providers whose terms align with our customer commitments.",
    status: "Certified",
  },
];

const CERTIFICATIONS: {
  name: string;
  status: StatusLabel;
  detail: string;
  Logo: React.FC<{ className?: string }>;
}[] = [
  {
    name: "SOC 2 Type 2",
    status: "In progress",
    detail:
      "Controls implementation and observation period underway. Report request available to qualified prospects under NDA.",
    Logo: ({ className }) => (
      <svg
        viewBox="0 0 80 80"
        className={className}
        aria-hidden="true"
        role="img"
      >
        <title>SOC 2 Type 2</title>
        <path
          d="M40 4l32 11v22c0 21-14 33-32 39C22 70 8 58 8 37V15L40 4z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <text
          x="40"
          y="38"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fontFamily="Inter, sans-serif"
          fill="currentColor"
        >
          SOC 2
        </text>
        <text
          x="40"
          y="54"
          textAnchor="middle"
          fontSize="9"
          fontWeight="600"
          letterSpacing="1"
          fontFamily="Inter, sans-serif"
          fill="currentColor"
        >
          TYPE 2
        </text>
      </svg>
    ),
  },
  {
    name: "ISO 27001",
    status: "Roadmap",
    detail:
      "ISMS scoping in progress. Targeted certification following SOC 2 attestation.",
    Logo: ({ className }) => (
      <svg
        viewBox="0 0 80 80"
        className={className}
        aria-hidden="true"
        role="img"
      >
        <title>ISO 27001</title>
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <text
          x="40"
          y="36"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fontFamily="Inter, sans-serif"
          fill="currentColor"
        >
          ISO
        </text>
        <text
          x="40"
          y="54"
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fontFamily="Inter, sans-serif"
          fill="currentColor"
        >
          27001
        </text>
      </svg>
    ),
  },
  {
    name: "GDPR",
    status: "Certified",
    detail:
      "DPA available on request. Data minimization, lawful basis, and subject-rights workflows in production.",
    Logo: ({ className }) => (
      <svg
        viewBox="0 0 80 80"
        className={className}
        aria-hidden="true"
        role="img"
      >
        <title>GDPR</title>
        <rect
          x="6"
          y="10"
          width="68"
          height="60"
          rx="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <g fill="currentColor">
          <circle cx="22" cy="28" r="2" />
          <circle cx="32" cy="22" r="2" />
          <circle cx="42" cy="20" r="2" />
          <circle cx="52" cy="22" r="2" />
          <circle cx="58" cy="28" r="2" />
          <circle cx="22" cy="50" r="2" />
          <circle cx="58" cy="50" r="2" />
          <circle cx="40" cy="58" r="2" />
        </g>
        <text
          x="40"
          y="46"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fontFamily="Inter, sans-serif"
          fill="currentColor"
        >
          GDPR
        </text>
      </svg>
    ),
  },
];

const SUBPROCESSORS: {
  name: string;
  purpose: string;
  data: string;
}[] = [
  {
    name: "Amazon Web Services",
    purpose: "Application hosting, storage, and managed databases",
    data: "All customer content (encrypted at rest), service logs",
  },
  {
    name: "Clerk",
    purpose: "Authentication, MFA, and session management",
    data: "Account identifiers, emails, hashed credentials",
  },
  {
    name: "OpenAI / Anthropic / Google (AI providers)",
    purpose: "Server-side LLM inference for research workflows",
    data:
      "Prompts and document context for the duration of the request. Contractual no-training endpoints.",
  },
  {
    name: "Polygon.io",
    purpose: "Market data (prices, fundamentals, reference data)",
    data: "Ticker queries only — no customer content",
  },
  {
    name: "Financial Modeling Prep (FMP)",
    purpose: "Fundamentals and statements",
    data: "Ticker queries only — no customer content",
  },
  {
    name: "Yahoo Finance",
    purpose: "Reference and historical pricing",
    data: "Ticker queries only — no customer content",
  },
  {
    name: "EODHD",
    purpose: "End-of-day pricing and macro data",
    data: "Ticker queries only — no customer content",
  },
  {
    name: "Alpha Vantage",
    purpose: "Technical indicators and supplementary data",
    data: "Ticker queries only — no customer content",
  },
  {
    name: "SEC EDGAR",
    purpose: "Public filings ingestion",
    data: "Public filing identifiers — no customer content",
  },
  {
    name: "PostHog",
    purpose: "Product analytics and event telemetry",
    data: "De-identified usage events, account IDs",
  },
];

export default function Security() {
  return (
    <main className="min-h-screen bg-background">
      {/* HERO */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-24 px-6 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[500px] bg-gradient-to-b from-secondary/60 to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={STAGGER}
          >
            <motion.div
              variants={FADE_UP}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold mb-6 tracking-wide"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-primary" />
              TRUST · SECURITY · PRIVACY
            </motion.div>
            <motion.h1
              variants={FADE_UP}
              className="font-display font-bold text-foreground tracking-[-0.03em] leading-[1.02] text-5xl md:text-6xl lg:text-7xl mb-6"
            >
              Security &amp; Data Protection
            </motion.h1>
            <motion.p
              variants={FADE_UP}
              className="text-lg md:text-xl text-muted-foreground max-w-3xl leading-relaxed"
            >
              Finsyt is built for institutional research, where trust is the
              product. Enterprise-grade controls, tenant isolation, and
              responsible AI — your data is yours, and it never trains anyone's
              model.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="py-16 md:py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
              SECURITY PILLARS
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] leading-[1.1] text-foreground">
              The controls that protect your research surface.
            </h2>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={STAGGER}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {PILLARS.map((p) => (
              <motion.div
                key={p.title}
                variants={FADE_UP}
                className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 transition-[border-color,box-shadow]"
              >
                <div className="flex items-start justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-secondary border border-border flex items-center justify-center">
                    <p.icon className="w-5 h-5 text-primary" />
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <h3 className="font-display font-bold text-lg text-foreground mb-2 leading-snug">
                  {p.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {p.body}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CERTIFICATIONS */}
      <section className="py-16 md:py-20 px-6 bg-muted/40 border-y border-border">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
              CERTIFICATIONS &amp; COMPLIANCE
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] leading-[1.1] text-foreground mb-4">
              Honest status, no theater.
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              We publish where we stand on each framework. We do not claim
              certifications we have not earned.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {CERTIFICATIONS.map((c) => (
              <div
                key={c.name}
                className="rounded-2xl border border-border bg-background p-6 flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="w-16 h-16 rounded-xl bg-secondary border border-border flex items-center justify-center text-primary shrink-0">
                    <c.Logo className="w-10 h-10" />
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="font-display font-bold text-xl text-foreground mb-2">
                  {c.name}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                  {c.detail}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-background p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="font-semibold text-foreground mb-1">
                Need our SOC 2 report or DPA?
              </div>
              <p className="text-sm text-muted-foreground">
                Available to qualified prospects and customers under NDA.
              </p>
            </div>
            <Link href="/request-access">
              <Button className="gap-2 h-11 px-5 rounded-md font-semibold">
                Request our security package <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* SUBPROCESSORS */}
      <section className="py-16 md:py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl mb-10">
            <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
              SUBPROCESSORS
            </p>
            <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] leading-[1.1] text-foreground mb-4">
              Every vendor we touch your data with.
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              The third parties Finsyt relies on, what they do, and what data
              flows to them. Market-data vendors only receive ticker queries —
              never your prompts or documents.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="font-semibold px-5 py-3">Provider</th>
                  <th className="font-semibold px-5 py-3">Purpose</th>
                  <th className="font-semibold px-5 py-3">Data shared</th>
                </tr>
              </thead>
              <tbody>
                {SUBPROCESSORS.map((s, i) => (
                  <tr
                    key={s.name}
                    className={
                      i < SUBPROCESSORS.length - 1
                        ? "border-b border-border"
                        : ""
                    }
                  >
                    <td className="px-5 py-4 font-semibold text-foreground align-top">
                      {s.name}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground align-top">
                      {s.purpose}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground align-top">
                      {s.data}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Material changes to this list are communicated to customers in
            advance per our DPA.
          </p>
        </div>
      </section>

      {/* RESPONSIBLE AI */}
      <section className="py-16 md:py-20 px-6 bg-muted/40 border-y border-border">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-4">
                RESPONSIBLE AI
              </p>
              <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] leading-[1.1] text-foreground">
                Your prompts stay yours.
              </h2>
            </div>
            <div className="lg:col-span-7 space-y-5">
              {[
                {
                  title: "No training on customer content",
                  body:
                    "Prompts, uploaded documents, generated outputs, and feedback are never used to train Finsyt's or any third-party model. All AI providers are accessed via contractual no-train endpoints.",
                },
                {
                  title: "Server-side proxied inference",
                  body:
                    "AI calls are made server-side from Finsyt's backend. Provider API keys never live in your browser, and we strip identifiers from telemetry to AI providers.",
                },
                {
                  title: "Grounded answers, sentence-level citations",
                  body:
                    "Generative outputs are grounded in retrieved primary sources. Every fact and figure links to the underlying document so you can verify before you trade.",
                },
                {
                  title: "Human-in-the-loop by default",
                  body:
                    "Finsyt is a research copilot, not an autonomous trading agent. Outputs are advisory and surfaced with their sources for analyst review.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-3"
                >
                  <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-foreground mb-1">
                      {item.title}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {item.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* VULN REPORTING */}
      <section className="py-16 md:py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-3xl border border-border bg-card p-8 md:p-12">
            <div className="grid lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-2">
                <div className="w-14 h-14 rounded-xl bg-secondary border border-border flex items-center justify-center">
                  <ShieldCheck className="w-7 h-7 text-primary" />
                </div>
              </div>
              <div className="lg:col-span-10">
                <p className="text-xs font-semibold text-primary tracking-[0.2em] mb-3">
                  RESPONSIBLE DISCLOSURE
                </p>
                <h2 className="font-display font-bold text-3xl md:text-4xl tracking-[-0.02em] leading-[1.1] text-foreground mb-4">
                  Report a vulnerability
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed mb-6 max-w-2xl">
                  We welcome reports from security researchers. Please email us
                  with reproduction steps and we will respond within two
                  business days. We do not pursue legal action against
                  good-faith research conducted under our policy.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href="mailto:security@finsyt.com"
                    className="inline-flex"
                  >
                    <Button className="h-11 px-5 rounded-md font-semibold gap-2">
                      <Mail className="w-4 h-4" /> security@finsyt.com
                    </Button>
                  </a>
                  <a
                    href="/.well-known/security.txt"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Button
                      variant="outline"
                      className="h-11 px-5 rounded-md font-semibold border-foreground/15 hover:bg-secondary gap-2"
                    >
                      <FileText className="w-4 h-4" /> security.txt
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
