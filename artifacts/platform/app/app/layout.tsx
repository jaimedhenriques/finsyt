import AppShell from '@/components/AppShell'
import DemoModeBanner from '@/components/DemoModeBanner'
import FirstRunWelcome from '@/components/FirstRunWelcome'
import { MiniAudioPlayerProvider } from '@/components/MiniAudioPlayer'
import { PrincipalProvider, DEV_PRINCIPAL } from '@/lib/auth'
import { WorkspaceProvider } from '@/lib/workspace'
import { AgentsProvider } from '@/lib/agents'
import { AgentJobsProvider } from '@/lib/agent-jobs'
import { OPEN_MODE } from '@/lib/open-mode'
import { ensureDemoData } from '@/lib/demo-bootstrap'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // PLATFORM_OPEN_MODE — make sure the demo org/user/membership and seed
  // content actually exist before rendering, so server components and the
  // very first API requests don't 500 on missing rows.
  // OPEN_MODE itself encodes the safety check: it is only true in production
  // when PLATFORM_PRODUCTION_DEMO=1 is explicitly set (see lib/open-mode.ts).
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
          <AgentJobsProvider>
            <MiniAudioPlayerProvider>
              <DemoModeBanner enabled={OPEN_MODE} />
              <AppShell>{children}</AppShell>
              <FirstRunWelcome />
            </MiniAudioPlayerProvider>
          </AgentJobsProvider>
        </AgentsProvider>
      </WorkspaceProvider>
    </PrincipalProvider>
  )
}
