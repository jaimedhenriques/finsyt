import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FMP_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  FRED_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  JWT_SECRET: z.string().optional(),
});

export const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  FMP_API_KEY: process.env.FMP_API_KEY,
  FINNHUB_API_KEY: process.env.FINNHUB_API_KEY,
  FRED_API_KEY: process.env.FRED_API_KEY,
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
});
