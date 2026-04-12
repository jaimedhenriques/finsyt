"use client"

import dynamic from "next/dynamic"

// Dynamic import with ssr:false prevents the prerender crash on DefaultChatTransport / useChat
const WorkspacesInner = dynamic(() => import("./_WorkspacesInner"), { ssr: false })

export default function WorkspacesPage() {
  return <WorkspacesInner />
}
