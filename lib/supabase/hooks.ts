"use client"

import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react"
import type { Session, User } from "@supabase/supabase-js"
import { getSupabaseBrowserClient } from "./client"

type AuthSnapshot = {
  user: User | null
  session: Session | null
  loading: boolean
  error: string | null
}

let authSnapshot: AuthSnapshot = {
  user: null,
  session: null,
  loading: true,
  error: null,
}

const listeners = new Set<() => void>()
let initialized = false

function emit() {
  for (const listener of listeners) listener()
}

function setSnapshot(next: Partial<AuthSnapshot>) {
  authSnapshot = { ...authSnapshot, ...next }
  emit()
}

function initAuthStore() {
  if (initialized) return
  initialized = true

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    setSnapshot({
      user: null,
      session: null,
      loading: false,
      error: "Supabase browser auth client is not configured.",
    })
    return
  }

  supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) {
        setSnapshot({ loading: false, error: error.message, session: null, user: null })
        return
      }
      setSnapshot({
        loading: false,
        error: null,
        session: data.session,
        user: data.session?.user ?? null,
      })
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : "Failed to resolve auth session."
      setSnapshot({ loading: false, error: message, session: null, user: null })
    })

  supabase.auth.onAuthStateChange((_event, session) => {
    setSnapshot({
      loading: false,
      error: null,
      session,
      user: session?.user ?? null,
    })
  })
}

function subscribe(listener: () => void) {
  initAuthStore()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  initAuthStore()
  return authSnapshot
}

function getServerSnapshot() {
  return authSnapshot
}

export function useSupabaseAuth() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function useSupabaseClient() {
  return useMemo(() => getSupabaseBrowserClient(), [])
}

const SupabaseContext = createContext(getSupabaseBrowserClient())

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const client = useSupabaseClient()
  return createElement(SupabaseContext.Provider, { value: client }, children)
}

export function useSupabaseContextClient() {
  return useContext(SupabaseContext)
}
