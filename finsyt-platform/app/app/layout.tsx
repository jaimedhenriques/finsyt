import AppShell from '@/components/AppShell'
import { LocaleProvider } from '@/lib/i18n/LocaleContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <AppShell>{children}</AppShell>
    </LocaleProvider>
  )
}
