import { Link, useLocation } from 'react-router-dom'

const NAV = [
  { icon: '▣', label: 'Overview', to: '/dashboard' },
  { icon: '◎', label: 'Watchlist', to: '/dashboard?tab=watchlist' },
  { icon: '◈', label: 'Insights', to: '/dashboard?tab=insights' },
  { icon: '◉', label: 'Alerts', to: '/dashboard?tab=alerts' },
  { icon: '◫', label: 'Data Explorer', to: '/explorer' },
  { icon: '⊞', label: 'Integrations', to: '/integrations' },
]

export default function Sidebar() {
  const location = useLocation()

  return (
    <aside className="w-60 bg-navy-900 border-r border-border flex flex-col min-h-screen shrink-0">
      {/* Logo */}
      <div className="p-5 pb-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center font-black text-white text-base">F</div>
          <span className="font-bold text-lg tracking-tight">Finsyt</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 flex flex-col gap-1">
        {NAV.map(item => {
          const isActive = location.pathname === item.to || location.pathname + location.search === item.to
          return (
            <Link key={item.to} to={item.to} className={`sidebar-link ${isActive ? 'active' : ''}`}>
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-border flex flex-col gap-1">
        <Link to="/settings" className={`sidebar-link ${location.pathname === '/settings' ? 'active' : ''}`}>
          <span className="text-base">⚙</span> Settings
        </Link>
        <div className="mt-2 p-3 bg-navy-800 rounded-xl border border-border">
          <div className="text-xs text-muted mb-1">Pro Plan</div>
          <div className="text-sm font-semibold">Jaime H.</div>
          <div className="text-xs text-blue-400 mt-0.5 truncate">jaimedhenriques@gmail.com</div>
        </div>
      </div>
    </aside>
  )
}
