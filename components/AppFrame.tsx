'use client'

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

import AppShell from "@/components/AppShell"

export default function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  if (pathname.startsWith("/app/auth")) {
    return <>{children}</>
  }

  return <AppShell>{children}</AppShell>
}
