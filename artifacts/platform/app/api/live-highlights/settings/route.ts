import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth-server'
import {
  getLiveHighlightsSettings,
  redactSettingsForAudit,
  updateLiveHighlightsSettings,
} from '@/lib/live-highlights'
import { audit, blueprintsTable, FINSYT_PUBLISHED_ORG_ID } from '@workspace/db'
import { eq, or } from 'drizzle-orm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  // Surface a small set of selectable Blueprints so the user can swap the
  // default. We restrict to the curated published library + the user's own
  // org to keep cross-tenant data out of the dropdown.
  let availableBlueprints: { id: string; name: string; publishedSlug: string | null; orgId: string }[] = []
  try {
    const { db } = await import('@workspace/db')
    availableBlueprints = await db
      .select({
        id: blueprintsTable.id,
        name: blueprintsTable.name,
        publishedSlug: blueprintsTable.publishedSlug,
        orgId: blueprintsTable.orgId,
      })
      .from(blueprintsTable)
      .where(
        or(
          eq(blueprintsTable.orgId, FINSYT_PUBLISHED_ORG_ID),
          eq(blueprintsTable.orgId, orgId),
        ),
      )
      .limit(100)
  } catch {
    /* ignore — UI can still toggle enabled/disabled without a list */
  }

  return NextResponse.json({
    settings: await getLiveHighlightsSettings(orgId),
    availableBlueprints,
  })
}

interface PatchBody {
  enabled?: unknown
  blueprintId?: unknown
  disabledSymbols?: unknown
  adHocSymbols?: unknown
  deliveryChannels?: unknown
  slackWebhookUrl?: unknown
  emailRecipients?: unknown
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!orgId)  return NextResponse.json({ error: 'no_workspace' }, { status: 409 })

  let raw: PatchBody = {}
  try { raw = (await req.json()) as PatchBody } catch { /* empty body */ }

  // Accept the delivery prefs partial in any of the natural shapes —
  // explicit `{ email: bool, slack: bool }` or the looser `{ email: bool }`
  // that the toggle UI sends — and ignore unknown keys.
  let deliveryChannels: { email?: boolean; slack?: boolean } | undefined
  if (raw.deliveryChannels && typeof raw.deliveryChannels === 'object') {
    const dc = raw.deliveryChannels as Record<string, unknown>
    deliveryChannels = {}
    if (typeof dc.email === 'boolean') deliveryChannels.email = dc.email
    if (typeof dc.slack === 'boolean') deliveryChannels.slack = dc.slack
  }

  const before = await getLiveHighlightsSettings(orgId)
  const next = await updateLiveHighlightsSettings(orgId, {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    blueprintId: typeof raw.blueprintId === 'string' ? raw.blueprintId : raw.blueprintId === null ? null : undefined,
    disabledSymbols: Array.isArray(raw.disabledSymbols)
      ? (raw.disabledSymbols as unknown[]).filter((x) => typeof x === 'string') as string[]
      : undefined,
    adHocSymbols: Array.isArray(raw.adHocSymbols)
      ? (raw.adHocSymbols as unknown[]).filter((x) => typeof x === 'string') as string[]
      : undefined,
    deliveryChannels,
    slackWebhookUrl: typeof raw.slackWebhookUrl === 'string'
      ? raw.slackWebhookUrl
      : raw.slackWebhookUrl === null ? null : undefined,
    emailRecipients: Array.isArray(raw.emailRecipients)
      ? (raw.emailRecipients as unknown[]).filter((x) => typeof x === 'string') as string[]
      : undefined,
  })

  // Audit settings changes — opt-out and Blueprint swaps are reviewable.
  try {
    await audit.log({
      orgId,
      actorId: userId,
      actorType: 'user',
      action: 'live_highlight.settings.updated',
      resourceType: 'live_highlights_settings',
      resourceId: orgId,
      metadata: {
        // Redact secret-bearing fields (Slack webhook URL) so a live
        // credential never lands in the durable audit log. Recipient
        // emails are also reduced to a count for the same reason.
        before: redactSettingsForAudit(before),
        after: redactSettingsForAudit(next),
      },
    })
  } catch {
    /* swallow */
  }

  return NextResponse.json({ settings: next })
}
