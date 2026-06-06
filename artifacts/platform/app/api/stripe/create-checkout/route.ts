import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { auth } from "@/lib/auth-server";
import { getStripe, proPriceId, appBaseUrl, stripeConfigured } from "@/lib/stripe";
import { db, orgSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Billing is not configured. Contact support." },
      { status: 503 },
    );
  }

  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json(
      { error: "Select or create a workspace before upgrading." },
      { status: 400 },
    );
  }

  const plan = req.nextUrl.searchParams.get("plan") || "pro";
  if (plan !== "pro") {
    return NextResponse.json({ error: "Unsupported plan." }, { status: 400 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  const existing = await db
    .select({ stripeCustomerId: orgSubscriptionsTable.stripeCustomerId })
    .from(orgSubscriptionsTable)
    .where(eq(orgSubscriptionsTable.clerkOrgId, orgId))
    .limit(1);

  let customerId = existing[0]?.stripeCustomerId ?? null;
  const stripe = getStripe();

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      metadata: { clerk_org_id: orgId, clerk_user_id: userId },
    });
    customerId = customer.id;
  }

  const base = appBaseUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: proPriceId(), quantity: 1 }],
    success_url: `${base}/platform/app/settings?checkout=success`,
    cancel_url: `${base}/platform/app/upgrade?checkout=canceled`,
    client_reference_id: orgId,
    metadata: { clerk_org_id: orgId, plan: "pro" },
    subscription_data: {
      metadata: { clerk_org_id: orgId, plan: "pro" },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Could not create checkout session." }, { status: 500 });
  }

  return NextResponse.redirect(session.url);
}
