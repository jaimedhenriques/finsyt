export type ProviderHealth = {
  id: string;
  configured: boolean;
  status: "healthy" | "unconfigured";
};

export type ResearchRequest = {
  question: string;
  ticker?: string;
};

export type Citation = {
  provider: string;
  label: string;
  url?: string;
};

export type ResearchResponse = {
  summary: string;
  confidence: "low" | "medium" | "high";
  citations: Citation[];
  nextActions: string[];
};
