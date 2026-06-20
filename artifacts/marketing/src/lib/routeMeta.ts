const FINSYT_URL = "https://finsyt.com";

type Schema = Record<string, unknown>;

export interface RouteMeta {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  canonical: string;
  /** JSON-LD structured data injected into the prerendered <head>. */
  schema?: Schema | Schema[];
}

const ORGANIZATION: Schema = {
  "@type": "Organization",
  name: "Finsyt",
  url: FINSYT_URL,
  logo: `${FINSYT_URL}/favicon.svg`,
};

export const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title:
      "Finsyt — AI-powered financial intelligence for institutional investors",
    description:
      "An AI-native financial intelligence platform for institutional investors, analysts, and finance teams. Query filings, transcripts, and research in natural language.",
    ogTitle: "Finsyt — AI-powered financial intelligence",
    ogDescription:
      "Query filings, transcripts, and internal documents in natural language. The next generation of financial software.",
    canonical: `${FINSYT_URL}/`,
    schema: [
      {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Finsyt",
        url: FINSYT_URL,
        logo: `${FINSYT_URL}/favicon.svg`,
        description:
          "An AI-native financial intelligence platform for institutional investors, analysts, and finance teams.",
        sameAs: ["https://x.com/finsyt"],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "sales",
          email: "hello@finsyt.com",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Finsyt",
        url: FINSYT_URL,
        description:
          "AI-powered financial intelligence for institutional investors. Query filings, transcripts, and research in natural language.",
      },
    ],
  },
  "/product": {
    title: "Product — The intelligent research workflow | Finsyt",
    description:
      "Finsyt AI agents transform raw financial data — filings, transcripts, and macro data — into structured, actionable insights for institutional investors.",
    ogTitle: "Finsyt — The intelligent research workflow",
    ogDescription:
      "AI agents that understand financial documents, not just search them. Semantic precision across filings, transcripts, and your firm's internal research.",
    canonical: `${FINSYT_URL}/product`,
    schema: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Finsyt",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: `${FINSYT_URL}/product`,
      description:
        "An intelligent research workflow platform for institutional investors. Finsyt AI agents transform raw financial data — filings, transcripts, macro data — into structured, actionable insights.",
      featureList: [
        "Semantic search across SEC filings and transcripts",
        "AI-powered financial document analysis",
        "Earnings transcript summarization",
        "Multi-source financial data aggregation",
        "Collaborative research workspaces",
        "Excel add-in and workflow automation",
      ],
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: "1200",
        offerCount: "3",
        url: `${FINSYT_URL}/pricing`,
      },
      publisher: ORGANIZATION,
    },
  },
  "/solutions": {
    title: "Solutions — Built for elite finance | Finsyt",
    description:
      "Finsyt accelerates research workflows for investment banking, hedge funds, private equity, asset management, and equity research — with precision and auditability.",
    ogTitle: "Finsyt Solutions — Built for elite finance",
    ogDescription:
      "Whatever your mandate, Finsyt accelerates your specific research workflows with precision and auditability.",
    canonical: `${FINSYT_URL}/solutions`,
  },
  "/pricing": {
    title: "Pricing — Plans for analysts, teams & enterprises | Finsyt",
    description:
      "Finsyt pricing for individual analysts, collaborative research teams, and global asset managers. Plans from $1,200/user/month, billed annually.",
    ogTitle: "Finsyt Pricing — Analyst, Team & Enterprise plans",
    ogDescription:
      "Plans for individual researchers, collaborative teams, and global asset managers. From $1,200/user/month, billed annually.",
    canonical: `${FINSYT_URL}/pricing`,
    schema: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Finsyt",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      url: `${FINSYT_URL}/pricing`,
      description:
        "AI-powered financial intelligence for institutional investors. Plans for individual analysts, research teams, and global asset managers.",
      offers: [
        {
          "@type": "Offer",
          name: "Analyst",
          description:
            "For individual researchers and boutique funds. Unlimited SEC filings and transcripts, standard broker research, AI summarization.",
          price: "1200",
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: "1200",
            priceCurrency: "USD",
            unitText: "user/month, billed annually",
          },
          url: `${FINSYT_URL}/pricing`,
          eligibleCustomerType: "https://schema.org/BusinessEntityType",
        },
        {
          "@type": "Offer",
          name: "Team",
          description:
            "For collaborative research teams and mid-sized funds. Includes shared workspaces, premium research, and Excel add-in.",
          price: "2500",
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: "2500",
            priceCurrency: "USD",
            unitText: "user/month, billed annually",
          },
          url: `${FINSYT_URL}/pricing`,
          eligibleCustomerType: "https://schema.org/BusinessEntityType",
        },
        {
          "@type": "Offer",
          name: "Enterprise",
          description:
            "For global asset managers and investment banks. Custom LLM fine-tuning, API access, on-premise deployment, and a dedicated customer success manager.",
          priceCurrency: "USD",
          url: `${FINSYT_URL}/pricing`,
          eligibleCustomerType: "https://schema.org/BusinessEntityType",
        },
      ],
      publisher: ORGANIZATION,
    },
  },
  "/about": {
    title: "About Finsyt — Building the terminal for the AI era",
    description:
      "Finsyt is building the terminal for the AI era — an AI-native financial intelligence platform for institutional investors, analysts, and finance teams.",
    ogTitle: "About Finsyt — The terminal for the AI era",
    ogDescription:
      "We are building the terminal for the AI era. Learn about the team and mission behind Finsyt.",
    canonical: `${FINSYT_URL}/about`,
  },
  "/request-access": {
    title: "Request access | Finsyt",
    description:
      "Request platform access to Finsyt — AI-powered financial intelligence for institutional investors, analysts, and finance teams.",
    ogTitle: "Request access to Finsyt",
    ogDescription:
      "Request platform access to Finsyt, the AI-native financial intelligence platform for institutional investors.",
    canonical: `${FINSYT_URL}/request-access`,
  },
  "/security": {
    title: "Security & Data Protection | Finsyt",
    description:
      "How Finsyt protects your data: tenant isolation, encryption, access controls, and audit-ready security practices built for institutional investors.",
    ogTitle: "Security & Data Protection | Finsyt",
    ogDescription:
      "Tenant isolation, encryption, and audit-ready controls — security built for institutional finance.",
    canonical: `${FINSYT_URL}/security`,
  },
  "/privacy": {
    title: "Privacy Policy | Finsyt",
    description:
      "Finsyt's Privacy Policy: how we collect, use, and protect your personal information when you use the Finsyt financial intelligence platform.",
    ogTitle: "Privacy Policy | Finsyt",
    ogDescription:
      "How Finsyt collects, uses, and protects your data. AES-256 encryption, no data selling, and GDPR-aligned practices.",
    canonical: `${FINSYT_URL}/privacy`,
  },
  "/terms": {
    title: "Terms of Service | Finsyt",
    description:
      "Finsyt's Terms of Service: the rules and conditions governing your use of the Finsyt financial intelligence platform.",
    ogTitle: "Terms of Service | Finsyt",
    ogDescription:
      "The terms and conditions governing your use of the Finsyt financial intelligence platform for institutional investors.",
    canonical: `${FINSYT_URL}/terms`,
  },
};

export function getRouteMeta(pathname: string): RouteMeta {
  return ROUTE_META[pathname] ?? ROUTE_META["/"];
}
