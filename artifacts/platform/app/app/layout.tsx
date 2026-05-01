import AppShell from '@/components/AppShell'
import DemoModeBanner from '@/components/DemoModeBanner'
import FirstRunWelcome from '@/components/FirstRunWelcome'
import { MiniAudioPlayerProvider } from '@/components/MiniAudioPlayer'
import { PrincipalProvider, DEV_PRINCIPAL } from '@/lib/auth'
import { WorkspaceProvider } from '@/lib/workspace'
import { AgentsProvider } from '@/lib/agents'
import { OPEN_MODE } from '@/lib/open-mode'
import { ensureDemoData } from '@/lib/demo-bootstrap'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // PLATFORM_OPEN_MODE — make sure the demo org/user/membership and seed
  // content actually exist before rendering, so server components and the
  // very first API requests don't 500 on missing rows.
  if (OPEN_MODE) {
    try {
      await ensureDemoData()
    } catch (err) {
      console.error('[open-mode] demo bootstrap failed:', err)
    }
  }

  return (
    <PrincipalProvider value={DEV_PRINCIPAL}>
      <WorkspaceProvider>
        <AgentsProvider>
          <MiniAudioPlayerProvider>
            <DemoModeBanner enabled={OPEN_MODE} />
            <AppShell>{children}</AppShell>
            <FirstRunWelcome />
          </MiniAudioPlayerProvider>
        </AgentsProvider>
      </WorkspaceProvider>
    </PrincipalProvider>
  )
}
