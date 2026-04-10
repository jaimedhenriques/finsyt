import AppShell from '@/components/AppShell'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'
import { WorkspaceProvider } from '@/lib/workspace'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <WorkspaceProvider>
        <AppShell>{children}</AppShell>
      </WorkspaceProvider>
    </LocaleProvider>
  )
}
