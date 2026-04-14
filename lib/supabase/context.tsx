"use client"

import { createContext, useContext } from "react"
import type { Session, User } from "@supabase/supabase-js"

export interface AuthContextValue {
  user: User | null
  session: Session | null
}

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
})

export function AuthProvider({
  value,
  children,
}: {
  value: AuthContextValue
  children: React.ReactNode
}) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  return useContext(AuthContext)
}

