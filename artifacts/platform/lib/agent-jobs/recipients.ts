import { clerkClient } from '@clerk/nextjs/server'

// Resolve the delegating user's primary email for the completion/failure
// notification. Best-effort: a Clerk lookup failure returns [] so the job
// still runs and the bell still fires — only the email is skipped.
export async function resolveUserEmails(userId: string): Promise<string[]> {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    const primaryId = user.primaryEmailAddressId
    const emails = user.emailAddresses ?? []
    const primary = emails.find((e) => e.id === primaryId) ?? emails[0]
    return primary?.emailAddress ? [primary.emailAddress] : []
  } catch {
    return []
  }
}
