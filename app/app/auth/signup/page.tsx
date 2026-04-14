"use client"

import { Suspense } from "react"
import AuthPage from "@/app/app/auth/_AuthPage"

export default function SignupPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading...</div>}>
      <AuthPage mode="signup" />
    </Suspense>
  )
}
