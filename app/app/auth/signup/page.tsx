import { Suspense } from "react"
import { redirect } from "next/navigation"

import AuthForm from "@/app/app/auth/AuthForm"
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server"

async function SignupPageInner() {
  if (hasSupabaseServerEnv()) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session) {
      redirect("/app")
    }
  }

  return <AuthForm mode="signup" />
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  )
}
