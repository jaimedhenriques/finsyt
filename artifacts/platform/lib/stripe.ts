import "server-only";
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function proPriceId(): string {
  const id = process.env.STRIPE_PRO_PRICE_ID?.trim();
  if (!id) throw new Error("STRIPE_PRO_PRICE_ID is not configured");
  return id;
}

export function appBaseUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
