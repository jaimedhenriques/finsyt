import AppShell from "@/components/AppShell"
import { LocaleProvider } from "@/lib/i18n/LocaleContext"
import { WorkspaceProvider } from "@/lib/workspace"
import { AuthProvider } from "@/lib/supabase/hooks"

// MagicChatBubble temporarily removed — @21st-sdk/react exports 'Chat' from
// @ai-sdk/react which was removed in ai@6. Base44 will restore once the SDK
// is patched or the import is fixed.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LocaleProvider>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </LocaleProvider>
    </AuthProvider>
  )
}
