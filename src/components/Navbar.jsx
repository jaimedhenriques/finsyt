import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-navy-950/90 backdrop-blur-xl border-b border-border' : 'bg-transparent'}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center font-black text-white text-base shadow-lg shadow-blue-600/20 group-hover:shadow-blue-600/40 transition-shadow">F</div>
          <span className="font-bold text-lg tracking-tight text-white">Finsyt</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {[['Features', '#features'], ['How it works', '#how-it-works'], ['Pricing', '/pricing']].map(([label, href]) => (
            href.startsWith('/') ? (
              <Link key={label} to={href} className="px-4 py-2 text-sm font-medium text-muted hover:text-white rounded-lg hover:bg-navy-800 transition-all">{label}</Link>
            ) : (
              <a key={label} href={href} className="px-4 py-2 text-sm font-medium text-muted hover:text-white rounded-lg hover:bg-navy-800 transition-all">{label}</a>
            )
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link to="/auth" className="btn-ghost text-sm py-2">Sign in</Link>
          <Link to="/auth" className="btn-primary text-sm py-2.5 px-5">Get started free</Link>
        </div>

        {/* Mobile menu btn */}
        <button className="md:hidden p-2 rounded-lg hover:bg-navy-800 transition-colors" onClick={() => setMobileOpen(!mobileOpen)}>
          <div className="w-5 h-0.5 bg-gray-300 mb-1.5 transition-all"></div>
          <div className="w-5 h-0.5 bg-gray-300 mb-1.5"></div>
          <div className="w-5 h-0.5 bg-gray-300"></div>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-navy-900 border-b border-border px-6 py-4 flex flex-col gap-2">
          <a href="#features" className="py-2.5 text-sm text-muted hover:text-white" onClick={() => setMobileOpen(false)}>Features</a>
          <a href="#how-it-works" className="py-2.5 text-sm text-muted hover:text-white" onClick={() => setMobileOpen(false)}>How it works</a>
          <Link to="/pricing" className="py-2.5 text-sm text-muted hover:text-white" onClick={() => setMobileOpen(false)}>Pricing</Link>
          <div className="border-t border-border pt-3 mt-1 flex flex-col gap-2">
            <Link to="/auth" className="btn-outline text-sm text-center" onClick={() => setMobileOpen(false)}>Sign in</Link>
            <Link to="/auth" className="btn-primary text-sm text-center" onClick={() => setMobileOpen(false)}>Get started free</Link>
          </div>
        </div>
      )}
    </nav>
  )
}
