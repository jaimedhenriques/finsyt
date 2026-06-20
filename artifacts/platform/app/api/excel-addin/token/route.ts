import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { mintAddinToken } from "@/lib/excel-addin-auth";
import { currentUser } from "@clerk/nextjs/server";
import { OPEN_MODE } from "@/lib/open-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mint a short-lived Excel-add-in JWT for the currently signed-in Clerk user.
 *
 * Called by the popup at `/excel-addin/auth` after Clerk completes sign-in.
 * The popup posts the resulting token back to the parent task pane via
 * `Office.context.ui.messageParent`. The token then flows to all `/api/v1/*`
 * routes as `Authorization: Bearer fxa_…`.
 *
 * The route requires an active Clerk session — Clerk middleware would already
 * have rejected unauthenticated callers, but we re-check defensively.
 */
export async function POST(_req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    // The Excel add-in needs an active workspace so per-org rate limits and
    // RLS contexts work. If the user is signed in but hasn't selected an org
    // yet, surface a useful error rather than minting a useless token.
    return NextResponse.json(
      { error: "No active workspace. Open Finsyt at finsyt.com and pick a workspace first." },
      { status: 403 },
    );
  }

  let email: string | null = null;
  if (!OPEN_MODE) {
    try {
      const u = await currentUser();
      email =
        u?.primaryEmailAddress?.emailAddress ??
        u?.emailAddresses?.[0]?.emailAddress ??
        null;
    } catch {/* non-fatal */}
  } else {
    email = "demo@finsyt.com";
  }

  const token = mintAddinToken({ orgId, userId, email });
  return NextResponse.json({ token, email });
}
