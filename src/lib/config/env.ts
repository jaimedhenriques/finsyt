import { z } from 'zod';

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().optional(),

  // Redis (optional)
  REDIS_URL: z.string().optional(),

  // Authentication
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // AI Providers
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),

  // Financial Data Providers
  FMP_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  DATABENTO_API_KEY: z.string().optional(),
  POLYGON_API_KEY: z.string().optional(),
  TIINGO_API_KEY: z.string().optional(),
  IEX_API_KEY: z.string().optional(),

  // Application
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
}

export const env = validateEnv();

// Helper to check if a provider is configured
export function isProviderConfigured(
  provider: 'fmp' | 'finnhub' | 'anthropic' | 'openai' | 'groq' | 'perplexity' | 'databento' | 'alpha_vantage'
): boolean {
  switch (provider) {
    case 'fmp':
      return !!env.FMP_API_KEY;
    case 'finnhub':
      return !!env.FINNHUB_API_KEY;
    case 'anthropic':
      return !!env.ANTHROPIC_API_KEY;
    case 'openai':
      return !!env.OPENAI_API_KEY;
    case 'groq':
      return !!env.GROQ_API_KEY;
    case 'perplexity':
      return !!env.PERPLEXITY_API_KEY;
    case 'databento':
      return !!env.DATABENTO_API_KEY;
    case 'alpha_vantage':
      return !!env.ALPHA_VANTAGE_API_KEY;
    default:
      return false;
  }
}

// Get API key or throw helpful error
export function requireApiKey(provider: string): string {
  const keyMap: Record<string, string | undefined> = {
    fmp: env.FMP_API_KEY,
    finnhub: env.FINNHUB_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    openai: env.OPENAI_API_KEY,
    groq: env.GROQ_API_KEY,
    perplexity: env.PERPLEXITY_API_KEY,
    alpha_vantage: env.ALPHA_VANTAGE_API_KEY,
    databento: env.DATABENTO_API_KEY,
    polygon: env.POLYGON_API_KEY,
    tiingo: env.TIINGO_API_KEY,
    iex: env.IEX_API_KEY,
  };

  const key = keyMap[provider.toLowerCase()];
  if (!key) {
    throw new Error(`API key for ${provider} is not configured. Please set the corresponding environment variable.`);
  }
  return key;
}
