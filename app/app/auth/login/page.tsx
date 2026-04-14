import { redirect } from "next/navigation"

import AuthForm from "@/components/auth/AuthForm"
import { getSafeNextPath } from "@/lib/supabase/redirect"
import { createClient } from "@/lib/supabase/server"

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const rawNext = resolvedSearchParams?.next
  const nextPath = getSafeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext)
  const supabase = await createClient()

  if (supabase) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session) {
      redirect(nextPath)
    }
  }

  return <AuthForm mode="login" nextPath={nextPath} />
}
