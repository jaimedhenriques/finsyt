import { NextResponse } from "next/server";
import { requireAuthContext } from "@/lib/auth/session";
import { getOrgPlanLimits } from "@/lib/billing/service";

export async function GET() {
  try {
    const authContext = await requireAuthContext();
    const billing = await getOrgPlanLimits(authContext.orgId);

    return NextResponse.json({
      auth: authContext,
      billing,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 401 }
    );
  }
}
