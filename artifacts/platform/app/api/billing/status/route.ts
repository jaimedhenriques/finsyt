import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { getBillingStatus } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const status = await getBillingStatus(orgId);
  return NextResponse.json(status);
}
