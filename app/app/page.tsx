"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AppRoot() {
  const router = useRouter()
  useEffect(() => { router.replace("/app/research") }, [])
  return null
}
