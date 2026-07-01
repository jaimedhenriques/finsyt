import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { CATALOG, CATEGORY_LABELS, AUTH_LABELS } from "@/lib/connectors/catalog";

export const runtime = "nodejs";

/**
 * GET /api/connectors/catalog
 * Returns the curated catalog plus the category/auth label maps so the UI
 * can render filters without duplicating the constants client-side.
 *
 * The list is small (≈50 entries) and static, so we ship it on every
 * request rather than paginating.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    entries: CATALOG.map((c) => {
      // Hide credential-validation probes (templates marked `hidden: true`)
      // from the user-facing catalog response — the Hub UI's "X ops" badge
      // and the connect modal's operation preview should advertise the
      // tools the user will actually see in the agent / MCP registry, not
      // the internal users/me-style probes.
      const visibleOps = (c.operationTemplates || []).filter((o) => o.hidden !== true);
      return {
        slug: c.slug,
        name: c.name,
        category: c.category,
        description: c.description,
        authType: c.authType,
        baseUrl: c.baseUrl,
        docUrl: c.docUrl,
        isFirstParty: !!c.isFirstParty,
        isPremium: !!c.isPremium,
        operationCount: visibleOps.length,
        operationTemplates: visibleOps,
        hasOauth: !!c.oauth,
        // Per-connector credential prompts surfaced into the connect modal.
        // We deliberately do not expose `credentialDefaults` to the client —
        // those are server-only defaults merged into the cred bag at create time.
        credentialFields: c.credentialFields || [],
        credentialNotes: c.credentialNotes || null,
        validateOperation: c.validateOperation || null,
      };
    }),
    categoryLabels: CATEGORY_LABELS,
    authLabels: AUTH_LABELS,
  });
}
