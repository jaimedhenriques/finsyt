import AppShell from "@/components/AppShell"
import { LocaleProvider } from "@/lib/i18n/LocaleContext"
import { WorkspaceProvider } from "@/lib/workspace"
import { MagicChatBubble } from "@/components/MagicChatBubble"
import { AuthProvider } from "@/lib/supabase/hooks"
import "@21st-sdk/react/styles.css"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LocaleProvider>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
          <MagicChatBubble />
        </WorkspaceProvider>
      </LocaleProvider>
    </AuthProvider>
  )
}
