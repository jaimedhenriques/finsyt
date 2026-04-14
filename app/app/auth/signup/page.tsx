import AuthForm from "@/components/auth/AuthForm"
import { getSafeNextPath } from "@/lib/supabase/redirect"

type SignupPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {}
  const next = Array.isArray(resolvedSearchParams.next)
    ? resolvedSearchParams.next[0]
    : resolvedSearchParams.next

  return <AuthForm mode="signup" nextPath={getSafeNextPath(next)} />
}
