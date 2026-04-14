'use client'

import { Suspense } from "react"
import AuthPage from "@/app/app/auth/_AuthPage"

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthPage mode="login" />
    </Suspense>
  )
}
