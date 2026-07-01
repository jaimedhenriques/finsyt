/**
 * Idempotently enforces Clerk instance-level organization settings that
 * affect post-sign-in UX. The Clerk Dashboard occasionally re-enables
 * `force_organization_selection` as a side-effect when Organizations is
 * toggled, which routes every signed-in user through a workspace-picker
 * step instead of landing on `/platform/app`. Running this script
 * resets it to the values our app expects.
 *
 * Usage:
 *   CLERK_SECRET_KEY=sk_... pnpm --filter @workspace/scripts enforce:clerk-org
 *
 * Re-run any time after changing Clerk org settings in the dashboard, or
 * whenever sign-in starts forcing the workspace picker again.
 */

const ENDPOINT = 'https://api.clerk.com/v1/instance/organization_settings'

const DESIRED = {
  force_organization_selection: false,
} as const

async function main() {
  const secret = process.env.CLERK_SECRET_KEY
  if (!secret) {
    console.error('CLERK_SECRET_KEY is required')
    process.exit(1)
  }

  const getRes = await fetch(ENDPOINT, {
    headers: { Authorization: `Bearer ${secret}` },
  })
  if (!getRes.ok) {
    console.error(`GET ${ENDPOINT} failed: ${getRes.status} ${await getRes.text()}`)
    process.exit(1)
  }
  const before = (await getRes.json()) as Record<string, unknown>
  console.log('Current organization_settings:')
  for (const [k, v] of Object.entries(DESIRED)) {
    console.log(`  ${k}: ${String(before[k])} (desired: ${String(v)})`)
  }

  const drift = Object.entries(DESIRED).filter(([k, v]) => before[k] !== v)
  if (drift.length === 0) {
    console.log('No drift — settings already match desired state.')
    return
  }

  const patchRes = await fetch(ENDPOINT, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(DESIRED),
  })
  if (!patchRes.ok) {
    console.error(`PATCH ${ENDPOINT} failed: ${patchRes.status} ${await patchRes.text()}`)
    process.exit(1)
  }
  const after = (await patchRes.json()) as Record<string, unknown>
  console.log('Reset organization_settings:')
  for (const [k, v] of Object.entries(DESIRED)) {
    console.log(`  ${k}: ${String(after[k])} (desired: ${String(v)})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
