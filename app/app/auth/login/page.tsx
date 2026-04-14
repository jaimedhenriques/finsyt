import { Suspense } from "react"
import { redirect } from "next/navigation"

import AuthForm from "@/app/app/auth/AuthForm"
import { createSupabaseServerClient, hasSupabaseServerEnv } from "@/lib/supabase/server"

export default async function LoginPage() {
  if (hasSupabaseServerEnv()) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session) {
      redirect("/app")
    }
  }

  return (
    <Suspense fallback={null}>
      <AuthForm mode="login" />
    </Suspense>
  )
}
