'use client'

import { usePathname } from "next/navigation"

import AppShell from "@/components/AppShell"

export default function AppLayoutFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname.startsWith("/app/auth")) {
    return <>{children}</>
  }

  return <AppShell>{children}</AppShell>
}
