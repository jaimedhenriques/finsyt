type EnvValue = string | undefined;

type CandidateKey =
  | "DATABASE_URL"
  | "POSTGRES_PRISMA_URL"
  | "POSTGRES_URL"
  | "SUPABASE_DATABASE_URL"
  | "DIRECT_URL"
  | "POSTGRES_URL_NON_POOLING"
  | "SUPABASE_DIRECT_URL";

type Candidate = {
  key: CandidateKey;
  value: EnvValue;
};

function normalize(value: EnvValue): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function pickFirst(candidates: Candidate[]) {
  for (const candidate of candidates) {
    const value = normalize(candidate.value);
    if (value) {
      return {
        value,
        source: candidate.key,
      };
    }
  }

  return {
    value: undefined,
    source: null,
  };
}

export function resolveDatabaseUrls(environment: NodeJS.ProcessEnv = process.env) {
  const pooled = pickFirst([
    { key: "DATABASE_URL", value: environment.DATABASE_URL },
    { key: "POSTGRES_PRISMA_URL", value: environment.POSTGRES_PRISMA_URL },
    { key: "POSTGRES_URL", value: environment.POSTGRES_URL },
    { key: "SUPABASE_DATABASE_URL", value: environment.SUPABASE_DATABASE_URL },
  ]);

  const direct = pickFirst([
    { key: "DIRECT_URL", value: environment.DIRECT_URL },
    { key: "POSTGRES_URL_NON_POOLING", value: environment.POSTGRES_URL_NON_POOLING },
    { key: "SUPABASE_DIRECT_URL", value: environment.SUPABASE_DIRECT_URL },
    { key: "POSTGRES_URL", value: environment.POSTGRES_URL },
    { key: "SUPABASE_DATABASE_URL", value: environment.SUPABASE_DATABASE_URL },
  ]);

  return {
    pooledUrl: pooled.value,
    pooledSource: pooled.source,
    directUrl: direct.value ?? pooled.value,
    directSource: direct.source ?? pooled.source,
    configured: Boolean(pooled.value),
  };
}
