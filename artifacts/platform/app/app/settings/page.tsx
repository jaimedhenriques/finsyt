'use client'
import { useCallback, useEffect, useState } from 'react'
import { RoleGate, usePrincipal } from '@/lib/auth'
import { ConnectSourcesPanel } from '@/components/research-pack'
import { UserProfile, useUser } from '@clerk/nextjs'
import { useWorkspace, THEME_OPTIONS } from '@/lib/workspace'

// Browser hits the api-server artifact directly when fetching '/api/*'
// (it owns that path prefix), so we explicitly target the platform's
// basePath to land on our authenticated Next.js route handlers.
const ACCOUNT_API = '/platform/api/account'

function DangerZone() {
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null)
  const [msg, setMsg]   = useState<string | null>(null)

  async function exportData() {
    setBusy('export'); setMsg(null)
    try {
      const r = await fetch(`${ACCOUNT_API}/export`, { method: 'POST' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const blob = await r.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = (r.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'finsyt-data-export.json'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setMsg('Export downloaded')
    } catch (e: any) {
      setMsg(e?.message || 'Export failed')
    } finally {
      setBusy(null)
      setTimeout(() => setMsg(null), 4000)
    }
  }

  async function deleteAccount() {
    const reason = window.prompt(
      'Delete your account?\n\nThis schedules a hard-deletion of all data Finsyt holds for you within 30 days. ' +
      'You can cancel up until that point.\n\n(Optional) tell us why:',
    )
    if (reason === null) return
    setBusy('delete'); setMsg(null)
    try {
      const r = await fetch(`${ACCOUNT_API}/delete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      const when = d.scheduledFor ? new Date(d.scheduledFor).toLocaleDateString() : 'shortly'
      setMsg(d.alreadyScheduled
        ? `Already scheduled — completes by ${when}`
        : `Deletion scheduled — completes by ${when}`)
    } catch (e: any) {
      setMsg(e?.message || 'Deletion request failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ borderTop:'1px solid #F0F4FA', paddingTop:20 }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#DC2626', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>Danger Zone</div>
      <div style={{ fontSize:12, color:'#7D8FA9', marginBottom:12, lineHeight:1.5 }}>
        Export downloads every personal record we hold for you (GDPR Art. 15 / 20).
        Delete schedules a hard-deletion within a documented 30-day SLA.
      </div>
      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        <button onClick={exportData} disabled={busy !== null}
          style={{ padding:'7px 14px', borderRadius:8, border:'1px solid rgba(220,38,38,0.3)', background:'rgba(220,38,38,0.04)', color:'#DC2626', fontSize:12, fontWeight:600, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy === 'export' ? 'Exporting…' : 'Export Data'}
        </button>
        <button onClick={deleteAccount} disabled={busy !== null}
          style={{ padding:'7px 14px', borderRadius:8, border:'1px solid rgba(220,38,38,0.3)', background:'rgba(220,38,38,0.04)', color:'#DC2626', fontSize:12, fontWeight:600, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy === 'delete' ? 'Submitting…' : 'Delete Account'}
        </button>
        {msg && <span style={{ fontSize:12, color:'#0A1628' }}>{msg}</span>}
      </div>
    </div>
  )
}

interface SecurityEvent {
  id: string
  kind: 'new_device' | 'new_country' | 'ip_lockout' | 'failed_attempt_burst'
  message: string
  ip: string
  userAgent: string
  createdAt: string
}

const EVENT_LABEL: Record<SecurityEvent['kind'], { label: string; tone: string }> = {
  new_device:           { label: 'New device',      tone: '#1B4FFF' },
  new_country:          { label: 'New location',    tone: '#D97706' },
  ip_lockout:           { label: 'IP locked out',   tone: '#DC2626' },
  failed_attempt_burst: { label: 'Failed attempts', tone: '#DC2626' },
}

function RecentSignInActivity() {
  const [events, setEvents] = useState<SecurityEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/me/security-events', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => { if (!cancelled) setEvents(data.events ?? []) })
      .catch(err => { if (!cancelled) setError(String(err.message ?? err)) })
    return () => { cancelled = true }
  }, [])
  return (
    <div style={{ marginTop:20, paddingTop:20, borderTop:'1px solid #F0F4FA' }}>
      <div style={{ fontSize:12, fontWeight:700, color:'#4A5568', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:10 }}>
        Recent sign-in activity
      </div>
      <p style={{ fontSize:12, color:'#7D8FA9', marginBottom:12 }}>
        New devices, new locations, and temporary lockouts triggered by failed sign-in attempts. If anything here looks unfamiliar, change your password and revoke the session under <em>Active devices</em> above.
      </p>
      {error && (
        <div style={{ fontSize:12, color:'#DC2626' }}>Could not load activity: {error}</div>
      )}
      {!error && events === null && (
        <div style={{ fontSize:12, color:'#7D8FA9' }}>Loading…</div>
      )}
      {!error && events && events.length === 0 && (
        <div style={{ fontSize:12, color:'#7D8FA9', padding:'10px 0' }}>No unusual activity recorded.</div>
      )}
      {!error && events && events.length > 0 && (
        <div style={{ border:'1px solid #E2E8F2', borderRadius:10, overflow:'hidden' }}>
          {events.map((e, i) => {
            const meta = EVENT_LABEL[e.kind] ?? { label: e.kind, tone: '#4A5568' }
            return (
              <div key={e.id}
                style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 14px',
                  borderBottom: i < events.length - 1 ? '1px solid #F0F4FA' : 'none', background:'#fff' }}>
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                  background: `${meta.tone}14`, color: meta.tone, whiteSpace:'nowrap' }}>
                  {meta.label}
                </span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:'#0A1628' }}>{e.message}</div>
                  <div style={{ fontSize:11, color:'#7D8FA9', marginTop:2, fontFamily:'monospace' }}>
                    {e.ip} · {e.userAgent.slice(0, 60)}{e.userAgent.length > 60 ? '…' : ''}
                  </div>
                </div>
                <div style={{ fontSize:11, color:'#B0BCD0', whiteSpace:'nowrap' }}>
                  {new Date(e.createdAt).toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

type Section = 'account' | 'team' | 'data' | 'notifications' | 'appearance' | 'api'

const NAV: { id: Section; label: string; icon: string }[] = [
  { id:'account',       label:'Account',          icon:'◎' },
  { id:'team',          label:'Team',             icon:'◐' },
  { id:'data',          label:'Data & Sources',   icon:'◈' },
  { id:'notifications', label:'Notifications',    icon:'◉' },
  { id:'appearance',    label:'Appearance',       icon:'◫' },
  { id:'api',           label:'Developer API',    icon:'◧' },
]

type InviteRole = 'admin' | 'member' | 'viewer'
type MemberRole = InviteRole | 'owner'

interface TeamMember {
  /** Stable id used for React keys + admin actions. */
  id: string
  /** Clerk user id (for active members) or null for pending invites. */
  userId: string | null
  /** Clerk invitation id (for pending invites) or null for active members. */
  invitationId: string | null
  name: string
  email: string
  role: MemberRole
  status: 'active' | 'invited'
  invitedAt?: string
}

interface TeamSnapshot {
  organization: { id: string; name: string; slug: string | null; membersCount: number; role: MemberRole | null } | null
  members: TeamMember[]
}

function formatRelative(ts: number | string | undefined): string {
  if (!ts) return ''
  const t = typeof ts === 'string' ? new Date(ts).getTime() : ts
  const diff = Date.now() - t
  if (diff < 60_000) return 'just now'
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

interface Toggle { label: string; desc: string; key: string; value: boolean }

export default function SettingsPage() {
  const { user } = useUser()
  const [section, setSection] = useState<Section>('account')
  // Deep-link support: ?section=data lands the user directly on a section.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const s = sp.get('section')
    const allowed: readonly Section[] = ['account','team','data','notifications','appearance','api']
    if (s && (allowed as readonly string[]).includes(s)) setSection(s as Section)
  }, [])
  const [saved, setSaved]     = useState(false)
  const [saving, setSaving]   = useState(false)

  // Org/role are app-level metadata, kept locally; identity & security
  // (email, password, 2FA, sessions) is owned by Clerk's UserProfile below.
  const [role, setRole]   = useState('CEO')
  const [org, setOrg]     = useState('Helix Holdings')

  // Team / organization — backed by /api/team (Clerk Organizations).
  // While the workspace owner has not yet enabled Organizations in the
  // Auth pane, GET /api/team returns `organization: null` and the UI
  // falls back to a "Create your team workspace" prompt.
  const [team, setTeam]               = useState<TeamSnapshot>({ organization:null, members:[] })
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamError, setTeamError]     = useState<string | null>(null)
  const [busy, setBusy]               = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoleSel, setInviteRoleSel] = useState<InviteRole>('member')
  const [inviteMsg, setInviteMsg]     = useState<{ kind:'ok'|'err'; text:string } | null>(null)
  const [newOrgName, setNewOrgName]   = useState('')

  type ServerMember = {
    membershipId: string; userId: string; name: string; email: string;
    role: MemberRole; status: 'active'; joinedAt: number | string;
  }
  type ServerInvitation = {
    invitationId: string; email: string; role: MemberRole;
    status: 'invited'; invitedAt: number | string;
  }

  const loadTeam = useCallback(async () => {
    setTeamLoading(true)
    setTeamError(null)
    try {
      const res = await fetch('/api/team', { credentials:'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load team')
      const members: TeamMember[] = [
        ...(data.members as ServerMember[] || []).map((m) => ({
          id: m.membershipId,
          userId: m.userId,
          invitationId: null,
          name: m.name,
          email: m.email,
          role: m.role,
          status: 'active' as const,
          invitedAt: undefined,
        })),
        ...(data.invitations as ServerInvitation[] || []).map((i) => ({
          id: i.invitationId,
          userId: null,
          invitationId: i.invitationId,
          name: i.email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          email: i.email,
          role: i.role,
          status: 'invited' as const,
          invitedAt: formatRelative(i.invitedAt),
        })),
      ]
      setTeam({ organization: data.organization ?? null, members })
    } catch (e: unknown) {
      setTeamError(e instanceof Error ? e.message : 'Failed to load team')
    } finally {
      setTeamLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section === 'team') loadTeam()
  }, [section, loadTeam])

  // Notifications
  const [notifs, setNotifs] = useState<Toggle[]>([
    { label:'Alert triggers',        desc:'Get notified when a price/volume alert fires',          key:'alerts',    value:true  },
    { label:'Earnings calendar',     desc:'Reminders before companies you follow report earnings', key:'earnings',  value:true  },
    { label:'News digest',           desc:'Daily morning summary of market-moving news',           key:'news',      value:false },
    { label:'Platform updates',      desc:'Feature announcements and changelogs',                  key:'platform',  value:true  },
    { label:'AutoPMF feedback loop', desc:'Notify when AutoPMF completes a cycle',                key:'autopmf',   value:true  },
  ])

  // Appearance — theme is wired through the workspace context so the choice
  // applies app-wide via a `data-theme` attribute on <html> and persists to
  // localStorage. Density/currency/dateFormat are still local state for now.
  const { theme, setTheme } = useWorkspace()
  const [density, setDensity]   = useState<'compact'|'normal'|'spacious'>('normal')
  const [currency, setCurrency] = useState('USD')
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY')

  // Data sources (display only — actual keys are env vars)
  const DATA_SOURCES = [
    { name:'Financial Modeling Prep', key:'FMP_API_KEY',     status:'connected', tier:'Primary — equities, financials, estimates' },
    { name:'EODHD',                   key:'EODHD_API_KEY',   status:'connected', tier:'Secondary — fundamentals, international' },
    { name:'Finnhub',                 key:'FINNHUB_API_KEY', status:'connected', tier:'Real-time quotes, news, sentiment' },
    { name:'FRED (St. Louis Fed)',    key:'FRED_API_KEY',    status:'connected', tier:'Macro indicators, economic data' },
    { name:'Polygon / Massive',       key:'MASSIVE_API_KEY', status:'connected', tier:'Aggregates, technicals, options' },
    { name:'Alpha Vantage',           key:'ALPHAV_API_KEY',  status:'partial',   tier:'Forex, technical indicators' },
    { name:'CoreSignal',              key:'CORESIGNAL_API_KEY', status:'connected', tier:'Private company data' },
    { name:'Perplexity',              key:'PERPLEXITY_API_KEY', status:'connected', tier:'AI Research — web grounding' },
    { name:'Groq',                    key:'GROQ_API_KEY',    status:'connected', tier:'AI Research — fast inference' },
  ]

  function toggleNotif(key: string) {
    setNotifs(prev => prev.map(n => n.key === key ? { ...n, value: !n.value } : n))
  }

  async function createOrg() {
    const name = newOrgName.trim()
    if (name.length < 1) {
      setInviteMsg({ kind:'err', text:'Workspace name is required' })
      return
    }
    setBusy('create-org')
    try {
      const res = await fetch('/api/team', {
        method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create workspace')
      setInviteMsg({ kind:'ok', text:`Workspace "${data.organization?.name ?? name}" created. Switch to it from the workspace menu to start inviting.` })
      setNewOrgName('')
      await loadTeam()
    } catch (e: unknown) {
      setInviteMsg({ kind:'err', text: e instanceof Error ? e.message : 'Failed to create workspace' })
    } finally {
      setBusy(null)
    }
  }

  async function sendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteMsg({ kind:'err', text:'Enter a valid email address' })
      return
    }
    if (team.members.some(m => m.email?.toLowerCase() === email)) {
      setInviteMsg({ kind:'err', text:'That email is already on the team or invited' })
      return
    }
    setBusy('invite')
    try {
      const res = await fetch('/api/team/invitations', {
        method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ email, role: inviteRoleSel }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invitation')
      setInviteEmail('')
      setInviteMsg({ kind:'ok', text:`Invite sent to ${email}` })
      await loadTeam()
    } catch (e: unknown) {
      setInviteMsg({ kind:'err', text: e instanceof Error ? e.message : 'Failed to send invitation' })
    } finally {
      setBusy(null)
      setTimeout(() => setInviteMsg(null), 4000)
    }
  }

  async function changeMemberRole(member: TeamMember, next: InviteRole) {
    if (!member.userId || member.role === 'owner') return
    setBusy(`role-${member.id}`)
    try {
      const res = await fetch(`/api/team/members/${member.userId}`, {
        method:'PATCH', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ role: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to change role')
      }
      await loadTeam()
    } catch (e: unknown) {
      setInviteMsg({ kind:'err', text: e instanceof Error ? e.message : 'Failed to change role' })
      setTimeout(() => setInviteMsg(null), 3500)
    } finally {
      setBusy(null)
    }
  }

  async function removeMember(member: TeamMember) {
    if (member.role === 'owner') return
    const confirmText = member.status === 'invited' ? 'Revoke this invitation?' : `Remove ${member.name} from the workspace?`
    if (typeof window !== 'undefined' && !window.confirm(confirmText)) return
    setBusy(`remove-${member.id}`)
    try {
      const url = member.status === 'invited' && member.invitationId
        ? `/api/team/invitations/${member.invitationId}`
        : member.userId
          ? `/api/team/members/${member.userId}`
          : null
      if (!url) throw new Error('Cannot determine target')
      const res = await fetch(url, { method:'DELETE', credentials:'same-origin' })
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove')
      }
      await loadTeam()
    } catch (e: unknown) {
      setInviteMsg({ kind:'err', text: e instanceof Error ? e.message : 'Failed to remove' })
      setTimeout(() => setInviteMsg(null), 3500)
    } finally {
      setBusy(null)
    }
  }

  async function resendInvite(member: TeamMember) {
    if (!member.invitationId) return
    setBusy(`resend-${member.id}`)
    try {
      // Revoke + recreate is the supported "resend" path with Clerk Organizations.
      await fetch(`/api/team/invitations/${member.invitationId}`, { method:'DELETE', credentials:'same-origin' })
      const res = await fetch('/api/team/invitations', {
        method:'POST', credentials:'same-origin',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ email: member.email, role: member.role === 'owner' ? 'admin' : member.role }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to resend invite')
      }
      setInviteMsg({ kind:'ok', text:`Invite re-sent to ${member.email}` })
      await loadTeam()
    } catch (e: unknown) {
      setInviteMsg({ kind:'err', text: e instanceof Error ? e.message : 'Failed to resend invite' })
    } finally {
      setBusy(null)
      setTimeout(() => setInviteMsg(null), 3000)
    }
  }

  async function save() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="page-content" style={{ maxWidth: 900 }}>
      <div style={{ marginBottom:24 }}>
        <h1 className="page-title">Settings</h1>
        <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Manage your account, preferences, and data sources</p>
      </div>

      <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
        {/* Sidebar nav */}
        <div style={{ width:180, flexShrink:0 }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setSection(n.id)}
              style={{ width:'100%', textAlign:'left', padding:'9px 12px', borderRadius:8, border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:8, marginBottom:2, transition:'all 0.1s', fontFamily:'inherit',
                background: section===n.id ? 'rgba(27,79,255,0.08)' : 'transparent',
                color:      section===n.id ? 'var(--accent)' : '#4A5568',
                fontWeight: section===n.id ? 700 : 500, fontSize:13,
              }}>
              <span style={{ fontSize:14 }}>{n.icon}</span> {n.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1 }}>

          {/* ── ACCOUNT ──────────────────────────────────────────────────── */}
          {section === 'account' && (
            <div className="card" style={{ padding:24 }}>
              <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:6 }}>Account & Security</h2>
              <p style={{ fontSize:12, color:'#7D8FA9', marginBottom:18 }}>
                Manage your email, password, two-factor authentication, and active sessions. To revoke a sign-in, expand <em>Active devices</em> below and choose <em>Sign out</em>.
              </p>

              <div style={{ marginBottom:24 }}>
                <UserProfile
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: 'w-full',
                      cardBox: 'w-full !shadow-none !border-0 !bg-transparent',
                      card: '!shadow-none !border-0 !bg-transparent !rounded-none',
                      navbar: 'hidden',
                      navbarMobileMenuButton: 'hidden',
                      pageScrollBox: '!p-0',
                      scrollBox: '!shadow-none !border-0',
                    },
                  }}
                />
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20, borderTop:'1px solid #F0F4FA', paddingTop:20 }}>
                <div style={{ gridColumn:'1 / -1', fontSize:12, fontWeight:700, color:'#4A5568', textTransform:'uppercase', letterSpacing:'0.04em' }}>Workspace details</div>
                {[
                  { label:'Full Name',        val:user?.fullName ?? '',                                  readOnly:true,  set:(_:string) => {} },
                  { label:'Email Address',    val:user?.primaryEmailAddress?.emailAddress ?? '',         readOnly:true,  set:(_:string) => {} },
                  { label:'Role / Title',     val:role,                                                  readOnly:false, set:setRole },
                  { label:'Organisation',     val:org,                                                   readOnly:false, set:setOrg  },
                ].map(field => (
                  <div key={field.label}>
                    <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>{field.label}</label>
                    <input value={field.val} readOnly={field.readOnly} onChange={e => field.set(e.target.value)}
                      style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box', background: field.readOnly ? '#F7F9FC' : '#fff', color: field.readOnly ? '#7D8FA9' : '#0A1628' }} />
                  </div>
                ))}
              </div>

              {/* Plan */}
              <div style={{ padding:'16px 20px', borderRadius:12, background:'linear-gradient(135deg,rgba(27,79,255,0.05),rgba(13,159,232,0.05))', border:'1.5px solid rgba(27,79,255,0.15)', marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:14, color:'#0A1628' }}>Pro Plan</div>
                    <div style={{ fontSize:12, color:'#7D8FA9', marginTop:2 }}>$29/month · renews May 14, 2026</div>
                  </div>
                  <button style={{ padding:'6px 14px', borderRadius:8, border:'1.5px solid var(--accent)', background:'transparent', color:'var(--accent)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    Manage Plan
                  </button>
                </div>
              </div>

              {/* Org context badge */}
              <OrgBadge />

              {/* Recent suspicious sign-in activity from the API server */}
              <RecentSignInActivity />

              {/* Danger zone — only owners/admins can perform destructive actions
                  (mirrors the assertRole('admin') check on the server).
                  DangerZone is the wired component (real export/delete API calls). */}
              <RoleGate
                required="admin"
                fallback={
                  <div style={{ borderTop:'1px solid rgba(255,255,255,0.04)', paddingTop:20, fontSize:12, color:'var(--text-secondary)' }}>
                    Destructive actions (export, delete) are restricted to organisation owners and admins.
                  </div>
                }
              >
                <DangerZone />
              </RoleGate>
            </div>
          )}

          {/* ── TEAM ─────────────────────────────────────────────────────── */}
          {section === 'team' && (
            <TeamSection
              team={team}
              loading={teamLoading}
              error={teamError}
              busy={busy}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              inviteRoleSel={inviteRoleSel}
              setInviteRoleSel={setInviteRoleSel}
              inviteMsg={inviteMsg}
              newOrgName={newOrgName}
              setNewOrgName={setNewOrgName}
              createOrg={createOrg}
              sendInvite={sendInvite}
              changeMemberRole={changeMemberRole}
              removeMember={removeMember}
              resendInvite={resendInvite}
              fallbackOrgName={org}
            />
          )}

          {/* ── DATA SOURCES ─────────────────────────────────────────────── */}
          {section === 'data' && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            <div className="card" style={{ overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #E2E8F2' }}>
                <div style={{ fontWeight:800, fontSize:16, color:'#0A1628' }}>Data Sources</div>
                <div style={{ fontSize:12, color:'#7D8FA9', marginTop:4 }}>Live waterfall: FMP → EODHD → Finnhub → FRED → Polygon. API keys are server-side environment variables.</div>
              </div>
              <div>
                {DATA_SOURCES.map((src, i) => (
                  <div key={src.name} style={{ padding:'14px 20px', borderBottom: i < DATA_SOURCES.length - 1 ? '1px solid var(--border)' : 'none', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: src.status === 'connected' ? 'var(--pos)' : src.status === 'partial' ? 'var(--amber)' : 'var(--neg)', boxShadow: src.status === 'connected' ? '0 0 5px var(--pos)' : '' }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>{src.name}</div>
                      <div style={{ fontSize:11, color:'#7D8FA9', marginTop:1 }}>{src.tier}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, fontFamily:'monospace', color:'#B0BCD0' }}>{src.key}</div>
                    <span style={{ fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:20,
                      background: src.status === 'connected' ? 'rgba(5,150,105,0.08)' : 'rgba(217,119,6,0.08)',
                      color:      src.status === 'connected' ? 'var(--pos)' : 'var(--amber)' }}>
                      {src.status}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ padding:'12px 20px', background:'#F8FAFD', borderTop:'1px solid #F0F4FA' }}>
                <div style={{ fontSize:12, color:'#7D8FA9' }}>
                  API keys are configured as Vercel environment variables and never exposed client-side.
                  To update, go to your <strong>Vercel dashboard → Project → Settings → Environment Variables</strong>.
                </div>
              </div>
            </div>
            <ConnectSourcesPanel />
            </div>
          )}

          {/* ── NOTIFICATIONS ────────────────────────────────────────────── */}
          {section === 'notifications' && (
            <div className="card" style={{ padding:24 }}>
              <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:20 }}>Notifications</h2>
              <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                {notifs.map((n, i) => (
                  <div key={n.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom: i < notifs.length - 1 ? '1px solid #F0F4FA' : 'none' }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13, color:'#0A1628' }}>{n.label}</div>
                      <div style={{ fontSize:12, color:'#7D8FA9', marginTop:2 }}>{n.desc}</div>
                    </div>
                    <button onClick={() => toggleNotif(n.key)}
                      style={{ width:44, height:24, borderRadius:12, border:'none', cursor:'pointer', transition:'all 0.2s', position:'relative', flexShrink:0,
                        background: n.value ? 'var(--accent)' : 'var(--border)' }}>
                      <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, transition:'left 0.2s', left: n.value ? 23 : 3, boxShadow:'0 1px 4px rgba(0,0,0,0.15)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── APPEARANCE ───────────────────────────────────────────────── */}
          {section === 'appearance' && (
            <div className="card" style={{ padding:24 }}>
              <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:20 }}>Appearance</h2>

              <div style={{ marginBottom:24 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'var(--text-secondary)', display:'block', marginBottom:10 }}>Background theme</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
                  {THEME_OPTIONS.map(opt => {
                    const active = theme === opt.id
                    return (
                      <button key={opt.id} onClick={() => setTheme(opt.id)} aria-pressed={active}
                        style={{
                          padding:'12px 10px', borderRadius:12, cursor:'pointer', fontFamily:'inherit',
                          textAlign:'left', transition:'all 0.12s',
                          border:'1.5px solid', borderColor: active ? 'var(--accent)' : 'var(--border)',
                          background: active ? 'var(--accent-dim)' : 'var(--bg-card)',
                          boxShadow: active ? '0 0 0 3px var(--accent-dim)' : 'none',
                        }}>
                        <div style={{
                          width:'100%', height:38, borderRadius:8, marginBottom:8,
                          background: opt.swatch,
                          border:'1px solid var(--border)',
                        }} />
                        <div style={{ fontSize:13, fontWeight:700, color: active ? 'var(--accent-text)' : 'var(--text-primary)' }}>{opt.label}</div>
                        <div style={{ fontSize:11, color:'var(--text-secondary)', marginTop:2, lineHeight:1.35 }}>{opt.description}</div>
                      </button>
                    )
                  })}
                </div>
                <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:8 }}>
                  Saved to this browser. Applies instantly across the platform.
                </div>
              </div>

              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:10 }}>Table Density</label>
                <div style={{ display:'flex', gap:8 }}>
                  {(['compact','normal','spacious'] as const).map(d => (
                    <button key={d} onClick={() => setDensity(d)}
                      style={{ flex:1, padding:'10px', borderRadius:10, border:'1.5px solid', cursor:'pointer', textTransform:'capitalize', fontFamily:'inherit', fontSize:13, fontWeight:600, transition:'all 0.1s',
                        borderColor: density===d ? 'var(--accent)' : 'var(--border)',
                        background:  density===d ? 'rgba(27,79,255,0.06)' : '#fff',
                        color:       density===d ? 'var(--accent)' : '#4A5568',
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Currency</label>
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', color:'var(--text-primary)', background:'#fff', cursor:'pointer' }}>
                    {['USD','GBP','EUR','JPY','CHF','CAD'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Date Format</label>
                  <select value={dateFormat} onChange={e => setDateFormat(e.target.value)}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', color:'var(--text-primary)', background:'#fff', cursor:'pointer' }}>
                    {['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD'].map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── DEVELOPER API ────────────────────────────────────────────── */}
          {section === 'api' && (
            <div>
              <div className="card" style={{ padding:24, marginBottom:16 }}>
                <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:8 }}>Developer API</h2>
                <p style={{ fontSize:13, color:'#7D8FA9', lineHeight:1.6, marginBottom:20 }}>
                  Access Finsyt's financial data programmatically. Your API key authenticates all requests.
                </p>
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:12, fontWeight:700, color:'#4A5568', display:'block', marginBottom:6 }}>Your API Key</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input type="password" value="fsy_live_•••••••••••••••••••••••••••••••"
                      readOnly style={{ flex:1, padding:'9px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'monospace', outline:'none', background:'var(--bg-input)', color:'var(--text-secondary)' }} />
                    <button style={{ padding:'9px 14px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', color:'var(--text-primary)', fontSize:12, fontWeight:600, cursor:'pointer' }}>Copy</button>
                    <button style={{ padding:'9px 14px', borderRadius:8, border:'none', background:'var(--accent)', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Regenerate</button>
                  </div>
                </div>
                <div style={{ padding:14, borderRadius:10, background:'#F8FAFD', border:'1px solid #E2E8F2', fontFamily:'monospace', fontSize:12, color:'#4A5568', lineHeight:1.8 }}>
                  <div style={{ marginBottom:4, color:'#B0BCD0' }}># Example request</div>
                  <div>curl -H "Authorization: Bearer YOUR_API_KEY" \</div>
                  <div>&nbsp;&nbsp;&nbsp;&nbsp;https://finsyt.com/api/quote?symbol=AAPL</div>
                </div>
              </div>
              <div className="card" style={{ padding:'14px 20px' }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#0A1628', marginBottom:4 }}>Usage this month</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginTop:12 }}>
                  {[{ label:'API Calls', value:'2,847', limit:'10,000' },{ label:'Data Points', value:'84.2K', limit:'500K' },{ label:'AI Queries', value:'143', limit:'500' }].map(s => (
                    <div key={s.label} style={{ textAlign:'center', padding:'12px', borderRadius:10, background:'#F8FAFD', border:'1px solid #E2E8F2' }}>
                      <div style={{ fontWeight:900, fontSize:'1.25rem', color:'#0A1628', letterSpacing:'-0.02em' }}>{s.value}</div>
                      <div style={{ fontSize:11, color:'#B0BCD0', marginTop:2 }}>of {s.limit}</div>
                      <div style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', marginTop:1 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Save button (show for relevant sections) */}
          {(section === 'account' || section === 'notifications' || section === 'appearance') && (
            <div style={{ marginTop:16, display:'flex', justifyContent:'flex-end', alignItems:'center', gap:10 }}>
              {saved && <span style={{ fontSize:13, color:'var(--pos)', fontWeight:600 }}>✓ Saved</span>}
              <button onClick={save} disabled={saving}
                style={{ padding:'10px 24px', borderRadius:10, border:'none', background:'var(--gradient-brand)', color: '#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

interface TeamSectionProps {
  team: TeamSnapshot
  loading: boolean
  error: string | null
  busy: string | null
  inviteEmail: string
  setInviteEmail: (v: string) => void
  inviteRoleSel: InviteRole
  setInviteRoleSel: (v: InviteRole) => void
  inviteMsg: { kind:'ok'|'err'; text:string } | null
  newOrgName: string
  setNewOrgName: (v: string) => void
  createOrg: () => void | Promise<void>
  sendInvite: () => void | Promise<void>
  changeMemberRole: (m: TeamMember, next: InviteRole) => void | Promise<void>
  removeMember: (m: TeamMember) => void | Promise<void>
  resendInvite: (m: TeamMember) => void | Promise<void>
  fallbackOrgName: string
}

function TeamSection(p: TeamSectionProps) {
  const { team, loading, error, busy } = p
  const orgName = team.organization?.name ?? p.fallbackOrgName
  const activeCount = team.members.filter(m => m.status === 'active').length
  const invitedCount = team.members.filter(m => m.status === 'invited').length

  // No org yet → prompt to create one. Any signed-in user can do this; the
  // POST hits Clerk Organizations and they become the first owner.
  if (!loading && !team.organization) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <div className="card" style={{ padding:24 }}>
          <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:6 }}>Create a team workspace</h2>
          <p style={{ fontSize:12, color:'#7D8FA9', marginBottom:16 }}>
            You&rsquo;re currently signed into a personal account. Create a workspace to invite colleagues, share coverage and watchlists, and centrally manage who has access.
          </p>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <input
              type="text"
              placeholder="e.g. Helix Capital"
              value={p.newOrgName}
              onChange={e => p.setNewOrgName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') p.createOrg() }}
              style={{ flex:'1 1 240px', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:'#0A1628' }}
            />
            <button
              onClick={() => p.createOrg()}
              disabled={busy === 'create-org'}
              style={{ padding:'9px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', opacity: busy === 'create-org' ? 0.7 : 1 }}
            >
              {busy === 'create-org' ? 'Creating…' : 'Create workspace'}
            </button>
          </div>
          {p.inviteMsg && (
            <div style={{ marginTop:10, fontSize:12, fontWeight:600, color: p.inviteMsg.kind === 'ok' ? '#059669' : '#DC2626' }}>
              {p.inviteMsg.kind === 'ok' ? '✓ ' : '⚠ '}{p.inviteMsg.text}
            </div>
          )}
          {error && (
            <div style={{ marginTop:10, fontSize:12, color:'#DC2626' }}>⚠ {error}</div>
          )}
        </div>
        <div className="card" style={{ padding:'12px 18px', background:'#F8FAFD', fontSize:12, color:'#4A5568', lineHeight:1.6 }}>
          Workspaces require Clerk Organizations to be enabled in the workspace Auth pane. Once enabled, every member of your workspace shares saved research, watchlists and coverage.
        </div>
      </div>
    )
  }

  const orgRole: MemberRole | null = team.organization?.role ?? null
  const callerIsAdmin = orgRole === 'admin' || orgRole === 'owner'

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div className="card" style={{ padding:24 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, marginBottom:6 }}>
          <div>
            <h2 style={{ fontWeight:800, fontSize:16, color:'#0A1628', marginBottom:6 }}>Team & Workspace</h2>
            <p style={{ fontSize:12, color:'#7D8FA9' }}>
              Invite colleagues, assign roles, and centrally manage who has access to <strong style={{ color:'#0A1628' }}>{orgName}</strong>.
              Coverage, watchlists and saved research are scoped to the workspace.
            </p>
          </div>
          <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, background:'rgba(27,79,255,0.08)', color:'#1B4FFF', whiteSpace:'nowrap' }}>
            {activeCount} active · {invitedCount} invited
          </span>
        </div>
        {loading && <div style={{ fontSize:12, color:'#7D8FA9', marginTop:8 }}>Loading…</div>}
        {error && <div style={{ fontSize:12, color:'#DC2626', marginTop:8 }}>⚠ {error}</div>}
      </div>

      {callerIsAdmin ? (
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0A1628', marginBottom:12 }}>Invite teammates</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            <input
              type="email"
              placeholder="colleague@yourfund.com"
              value={p.inviteEmail}
              onChange={e => p.setInviteEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') p.sendInvite() }}
              style={{ flex:'1 1 240px', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none', background:'#fff', color:'#0A1628' }}
            />
            <select
              value={p.inviteRoleSel}
              onChange={e => p.setInviteRoleSel(e.target.value as InviteRole)}
              style={{ padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', background:'#fff', color:'#0A1628', cursor:'pointer' }}
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={() => p.sendInvite()}
              disabled={busy === 'invite'}
              style={{ padding:'9px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap', opacity: busy === 'invite' ? 0.7 : 1 }}
            >
              {busy === 'invite' ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {p.inviteMsg && (
            <div style={{ marginTop:10, fontSize:12, fontWeight:600, color: p.inviteMsg.kind === 'ok' ? '#059669' : '#DC2626' }}>
              {p.inviteMsg.kind === 'ok' ? '✓ ' : '⚠ '}{p.inviteMsg.text}
            </div>
          )}
          <div style={{ marginTop:12, fontSize:11, color:'#7D8FA9', lineHeight:1.6 }}>
            Invitees receive a branded email link and join <strong style={{ color:'#4A5568' }}>{orgName}</strong> on first sign-in.
            Roles gate sensitive actions: only <em>admins</em> and <em>owners</em> can manage billing or revoke other users&rsquo; sessions.
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding:'14px 20px', fontSize:12, color:'#7D8FA9' }}>
          Only organisation owners and admins can invite teammates or change roles.
        </div>
      )}

      {/* Members + invitations */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #F0F4FA', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:800, fontSize:13, color:'#0A1628' }}>Members & invitations</div>
          <div style={{ fontSize:11, color:'#7D8FA9' }}>{team.members.length} total</div>
        </div>
        {team.members.length === 0 && !loading && (
          <div style={{ padding:'18px 20px', fontSize:12, color:'#7D8FA9' }}>No members yet. Invite your first teammate above.</div>
        )}
        <div>
          {team.members.map((m, i) => (
            <div key={m.id} style={{ padding:'12px 20px', borderBottom: i < team.members.length - 1 ? '1px solid #F0F4FA' : 'none', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)', color:'#fff', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {m.name.split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#0A1628', display:'flex', alignItems:'center', gap:8 }}>
                  {m.name}
                  {m.status === 'invited' && (
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'rgba(217,119,6,0.10)', color:'#D97706' }}>
                      Pending{m.invitedAt ? ` · ${m.invitedAt}` : ''}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:11, color:'#7D8FA9', marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.email}</div>
              </div>
              {callerIsAdmin && m.role !== 'owner' && m.userId ? (
                <select
                  value={m.role}
                  onChange={e => p.changeMemberRole(m, e.target.value as InviteRole)}
                  disabled={busy === `role-${m.id}`}
                  style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #E2E8F2', fontSize:11, fontFamily:'inherit', background:'#fff', color:'#0A1628', cursor:'pointer', textTransform:'capitalize' }}
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: m.role === 'owner' ? 'rgba(5,150,105,0.10)' : 'rgba(27,79,255,0.06)', color: m.role === 'owner' ? '#059669' : '#1B4FFF', textTransform:'capitalize' }}>
                  {m.role}
                </span>
              )}
              {callerIsAdmin && m.role !== 'owner' && (
                <div style={{ display:'flex', gap:6 }}>
                  {m.status === 'invited' && (
                    <button onClick={() => p.resendInvite(m)} disabled={busy === `resend-${m.id}`} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #E2E8F2', background:'#fff', color:'#4A5568', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                      {busy === `resend-${m.id}` ? '…' : 'Resend'}
                    </button>
                  )}
                  <button onClick={() => p.removeMember(m)} disabled={busy === `remove-${m.id}`} style={{ padding:'5px 10px', borderRadius:6, border:'1px solid rgba(220,38,38,0.25)', background:'rgba(220,38,38,0.04)', color:'#DC2626', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                    {busy === `remove-${m.id}` ? '…' : (m.status === 'invited' ? 'Revoke' : 'Remove')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding:'12px 18px', background:'#F8FAFD', fontSize:12, color:'#4A5568', lineHeight:1.6 }}>
        <strong style={{ color:'#0A1628' }}>How roles work.</strong>{' '}
        <em>Owner</em> &mdash; full control, including billing and deleting the workspace. {' '}
        <em>Admin</em> &mdash; invite/remove members, change roles, revoke sessions. {' '}
        <em>Member</em> &mdash; create research, watchlists, alerts. {' '}
        <em>Viewer</em> &mdash; read-only access to coverage and saved research.
      </div>
    </div>
  )
}

function OrgBadge() {
  const p = usePrincipal()
  if (!p) return null
  return (
    <div style={{ marginTop:20, marginBottom:8, padding:'10px 14px', borderRadius:10, background:'var(--bg-page)', border:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ fontSize:12, color:'#4A5568' }}>
        Signed into <strong style={{ color:'var(--bg-elevated)' }}>{p.orgName}</strong> as <strong style={{ color:'var(--bg-elevated)' }}>{p.role}</strong>
      </div>
      <span style={{ fontSize:11, fontFamily:'monospace', color:'var(--text-muted)' }}>org {p.orgId.slice(0,8)}…</span>
    </div>
  )
}
