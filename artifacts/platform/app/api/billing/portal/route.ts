import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { db, orgSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getStripe, appBaseUrl, stripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json({ error: "Select a workspace first." }, { status: 400 });
  }

  const rows = await db
    .select({ stripeCustomerId: orgSubscriptionsTable.stripeCustomerId })
    .from(orgSubscriptionsTable)
    .where(eq(orgSubscriptionsTable.clerkOrgId, orgId))
    .limit(1);

  const customerId = rows[0]?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "No billing account found. Upgrade to Pro first." },
      { status: 404 },
    );
  }

  const stripe = getStripe();
  const base = appBaseUrl();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${base}/platform/app/settings`,
  });

  return NextResponse.json({ url: session.url });
}
