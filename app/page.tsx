'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

// ── Aurora / animated gradient background ────────────────────────────────────
function AuroraBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col min-h-screen bg-[#030712] text-white overflow-hidden">
      {/* Aurora blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full bg-blue-600/20 blur-[120px] animate-[drift1_18s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-cyan-500/15 blur-[100px] animate-[drift2_22s_ease-in-out_infinite]" />
        <div className="absolute bottom-0 left-1/3 w-[600px] h-[400px] rounded-full bg-indigo-600/15 blur-[130px] animate-[drift3_26s_ease-in-out_infinite]" />
      </div>
      {/* Subtle grid */}
      <div className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: 'linear-gradient(rgba(27,79,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(27,79,255,0.04) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      {children}
      <style>{`
        @keyframes drift1 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(60px,-40px) scale(1.1)} 66%{transform:translate(-30px,60px) scale(0.95)} }
        @keyframes drift2 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-50px,40px) scale(1.05)} 66%{transform:translate(30px,-50px) scale(1.1)} }
        @keyframes drift3 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(40px,-30px) scale(1.08)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(1.6);opacity:0} }
        @keyframes border-spin { from{--angle:0deg} to{--angle:360deg} }
        @keyframes scan-line { 0%{transform:translateY(-100%)} 100%{transform:translateY(200%)} }
        .animate-fade-up { animation: fadeUp 0.7s ease forwards; }
        .animate-float { animation: float 4s ease-in-out infinite; }
        .shimmer-text { background: linear-gradient(90deg, #fff 0%, #93c5fd 30%, #67e8f9 50%, #93c5fd 70%, #fff 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; animation: shimmer 4s linear infinite; }
        .gradient-border { position:relative; } .gradient-border::before { content:''; position:absolute; inset:-1px; border-radius:inherit; padding:1px; background:linear-gradient(135deg,rgba(27,79,255,0.6),rgba(6,182,212,0.4),rgba(27,79,255,0.1)); -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0); -webkit-mask-composite:xor; mask-composite:exclude; }
      `}</style>
    </div>
  )
}

// ── Animated badge / pill ─────────────────────────────────────────────────────
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-semibold mb-6">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400" />
      </span>
      {children}
    </div>
  )
}

// ── Typewriter ────────────────────────────────────────────────────────────────
const WORDS = ['Bloomberg', 'FactSet', 'AlphaSense', 'Rogo', 'PitchBook']
function TypeWriter() {
  const [idx, setIdx] = useState(0)
  const [displayed, setDisplayed] = useState('')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    const word = WORDS[idx]
    const timeout = setTimeout(() => {
      if (!deleting && displayed.length < word.length) {
        setDisplayed(word.slice(0, displayed.length + 1))
      } else if (!deleting && displayed.length === word.length) {
        setTimeout(() => setDeleting(true), 1800)
      } else if (deleting && displayed.length > 0) {
        setDisplayed(word.slice(0, displayed.length - 1))
      } else if (deleting && displayed.length === 0) {
        setDeleting(false)
        setIdx((idx + 1) % WORDS.length)
      }
    }, deleting ? 50 : 90)
    return () => clearTimeout(timeout)
  }, [displayed, deleting, idx])
  return (
    <span className="text-blue-400">{displayed}<span className="animate-pulse">|</span></span>
  )
}

// ── Stats counter ─────────────────────────────────────────────────────────────
function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const [count, setCount] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0
        const step = to / 60
        const timer = setInterval(() => {
          start += step
          if (start >= to) { setCount(to); clearInterval(timer) }
          else setCount(Math.floor(start))
        }, 16)
        observer.disconnect()
      }
    })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [to])
  return <span ref={ref}>{count}{suffix}</span>
}

// ── Bento card ────────────────────────────────────────────────────────────────
function BentoCard({ children, className = '', glow = false }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const handleMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }
  return (
    <div
      ref={cardRef}
      onMouseMove={handleMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden transition-all duration-300 ${hovered ? 'border-blue-500/25 shadow-lg shadow-blue-500/5' : ''} ${className}`}
    >
      {/* Spotlight effect */}
      {hovered && (
        <div className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{ background: `radial-gradient(300px circle at ${pos.x}px ${pos.y}px, rgba(27,79,255,0.08), transparent 60%)` }} />
      )}
      {glow && <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ boxShadow: 'inset 0 0 40px rgba(27,79,255,0.1)' }} />}
      {children}
    </div>
  )
}

// ── Terminal demo ─────────────────────────────────────────────────────────────
const TERMINAL_LINES = [
  { delay: 0,    type: 'prompt', text: '> Analyze NVDA Q4 earnings vs consensus' },
  { delay: 600,  type: 'agent',  text: '⟳ Fetching Q4 filing from SEC EDGAR...' },
  { delay: 1200, type: 'agent',  text: '⟳ Cross-referencing analyst estimates...' },
  { delay: 1900, type: 'result', text: 'Revenue: $39.3B (+73% YoY) ✓ Beat by $1.2B' },
  { delay: 2100, type: 'result', text: 'EPS: $0.89 vs $0.84 est. ✓ Beat by 6%' },
  { delay: 2300, type: 'result', text: 'Data Center: $35.8B (+94% YoY) ¹' },
  { delay: 2600, type: 'cite',   text: '[1] Source: NVDA 10-K, filed Jan 2026' },
  { delay: 2900, type: 'signal', text: '📈 Signal: Strong Beat — Bullish' },
]

function TerminalDemo() {
  const [visible, setVisible] = useState(0)
  useEffect(() => {
    const timers = TERMINAL_LINES.map((line, i) =>
      setTimeout(() => setVisible(i + 1), line.delay + 300)
    )
    const reset = setTimeout(() => setVisible(0), 6000)
    return () => { timers.forEach(clearTimeout); clearTimeout(reset) }
  }, [visible])

  const typeColor: Record<string, string> = {
    prompt: 'text-white',
    agent:  'text-white/40',
    result: 'text-emerald-400',
    cite:   'text-blue-400/70',
    signal: 'text-amber-400 font-bold',
  }
  return (
    <div className="font-mono text-[11px] leading-relaxed p-4 space-y-1">
      {TERMINAL_LINES.slice(0, visible).map((line, i) => (
        <div key={i} className={`${typeColor[line.type]} animate-fade-up`}>{line.text}</div>
      ))}
      {visible > 0 && visible < TERMINAL_LINES.length && (
        <div className="text-white/20 animate-pulse">▋</div>
      )}
    </div>
  )
}

// ── Ticker strip ──────────────────────────────────────────────────────────────
const TICKERS = [
  { sym: 'NVDA', px: '924.80', chg: '+2.60%', up: true },
  { sym: 'AAPL', px: '192.35', chg: '-0.62%', up: false },
  { sym: 'MSFT', px: '418.20', chg: '+1.15%', up: true },
  { sym: 'GOOGL', px: '172.80', chg: '+0.83%', up: true },
  { sym: 'AMZN', px: '195.40', chg: '-0.44%', up: false },
  { sym: 'META', px: '598.60', chg: '+3.21%', up: true },
  { sym: 'TSLA', px: '248.50', chg: '-1.87%', up: false },
  { sym: 'BTC',  px: '83,240', chg: '+4.12%', up: true },
]

function TickerStrip() {
  const doubled = [...TICKERS, ...TICKERS]
  return (
    <div className="w-full overflow-hidden border-y border-white/[0.05] bg-black/20">
      <div className="flex gap-8 py-2.5 px-4 whitespace-nowrap"
        style={{ animation: 'scroll-left 25s linear infinite' }}>
        {doubled.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-xs flex-shrink-0">
            <span className="text-white/60 font-semibold">{t.sym}</span>
            <span className="text-white/90">{t.px}</span>
            <span className={t.up ? 'text-emerald-400' : 'text-red-400'}>{t.chg}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes scroll-left { from{transform:translateX(0)} to{transform:translateX(-50%)} }`}</style>
    </div>
  )
}

// ── Pricing card ─────────────────────────────────────────────────────────────
function PricingCard({ plan, price, period, features, highlight, cta }: any) {
  return (
    <div className={`relative rounded-2xl p-6 flex flex-col h-full transition-all duration-300 hover:-translate-y-1 ${highlight ? 'bg-gradient-to-b from-blue-600/20 to-blue-900/10 border border-blue-500/40 shadow-xl shadow-blue-500/10' : 'bg-white/[0.03] border border-white/[0.07]'}`}>
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-bold rounded-full">Most Popular</div>
      )}
      <div className="text-white/60 text-sm font-medium mb-3">{plan}</div>
      <div className="flex items-end gap-1 mb-5">
        <span className="text-white text-4xl font-bold">{price}</span>
        {period && <span className="text-white/40 text-sm mb-1">/{period}</span>}
      </div>
      <ul className="flex flex-col gap-2.5 mb-8 flex-1">
        {features.map((f: string) => (
          <li key={f} className="flex items-start gap-2 text-white/70 text-sm">
            <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
            {f}
          </li>
        ))}
      </ul>
      <Link href="/app"
        className={`w-full py-2.5 rounded-xl text-sm font-semibold text-center transition-all ${highlight ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/25' : 'bg-white/[0.06] hover:bg-white/[0.12] text-white/80'}`}>
        {cta}
      </Link>
    </div>
  )
}

// ── Logo cloud ────────────────────────────────────────────────────────────────
const LOGOS = ['CoreSignal', 'SEC EDGAR', 'EODHD', 'FMP', 'Finnhub', 'FRED', 'OpenAI', 'Anthropic']

// ── Feature bento grid ────────────────────────────────────────────────────────
const BENTO_FEATURES = [
  {
    icon: '🤖',
    title: 'AI Research Engine',
    desc: 'Source-cited answers from SEC filings, earnings calls, and 10+ live data providers. Every claim is verifiable.',
    size: 'col-span-2 row-span-2',
    accent: 'blue',
    demo: true,
  },
  {
    icon: '🏢',
    title: 'Private Company Intel',
    desc: '75M+ private companies. Headcount trends, funding rounds, hiring signals.',
    size: 'col-span-1 row-span-1',
    accent: 'cyan',
  },
  {
    icon: '🔍',
    title: 'Company Discovery',
    desc: 'Plain-English search: "Series B AI fintechs in London with 50-200 employees"',
    size: 'col-span-1 row-span-1',
    accent: 'purple',
  },
  {
    icon: '📊',
    title: 'Formula Engine',
    desc: 'Capital IQ-style mnemonics. =FINSYT(NVDA, EV_EBITDA) in Excel.',
    size: 'col-span-1 row-span-1',
    accent: 'emerald',
  },
  {
    icon: '📡',
    title: 'Live Market Data',
    desc: 'Real-time quotes, macro indicators, news sentiment across global markets.',
    size: 'col-span-1 row-span-1',
    accent: 'amber',
  },
  {
    icon: '⚡',
    title: 'MCP Server',
    desc: 'Connect any LLM (Claude, GPT-4) directly to Finsyt\'s financial APIs.',
    size: 'col-span-2 row-span-1',
    accent: 'pink',
  },
]

const ACCENT_MAP: Record<string, string> = {
  blue:    'from-blue-500/20 to-blue-900/5 border-blue-500/20',
  cyan:    'from-cyan-500/15 to-cyan-900/5 border-cyan-500/15',
  purple:  'from-purple-500/15 to-purple-900/5 border-purple-500/15',
  emerald: 'from-emerald-500/15 to-emerald-900/5 border-emerald-500/15',
  amber:   'from-amber-500/15 to-amber-900/5 border-amber-500/15',
  pink:    'from-pink-500/15 to-pink-900/5 border-pink-500/15',
}

const ICON_BG: Record<string, string> = {
  blue: 'bg-blue-500/20', cyan: 'bg-cyan-500/20', purple: 'bg-purple-500/20',
  emerald: 'bg-emerald-500/20', amber: 'bg-amber-500/20', pink: 'bg-pink-500/20',
}

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { name: 'Alex Chen', role: 'VP Research, Apex Capital', avatar: 'AC', text: 'Finsyt replaced three separate tools for us. The AI research with source citations is exactly what institutional analysts need.' },
  { name: 'Sarah Blake', role: 'Founder, Meridian Ventures', avatar: 'SB', text: 'The private company intelligence is incredible. Headcount trends and funding data in one place — this is what I needed for deal sourcing.' },
  { name: 'Marcus Webb', role: 'Quant Analyst, Titan Fund', avatar: 'MW', text: 'The Formula Engine is a game changer. We plugged it into our Excel models on day one and the MCP server means Claude can now query our data.' },
  { name: 'Priya Sharma', role: 'CFO, Scale Technologies', avatar: 'PS', text: 'Finally a platform that doesn\'t feel like it was built in 2010. The UX is clean, fast, and everything actually works.' },
]

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])
  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-black/60 backdrop-blur-xl border-b border-white/[0.06]' : ''}`}>
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-black text-sm">F</div>
          <span className="text-white font-bold text-lg tracking-tight">Finsyt</span>
          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-md">BETA</span>
        </div>
        <div className="hidden md:flex items-center gap-7 text-sm text-white/50">
          {[['Platform', '#platform'], ['Data', '#data'], ['Pricing', '#pricing']].map(([l, h]) => (
            <a key={l} href={h} className="hover:text-white transition-colors">{l}</a>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app" className="hidden sm:block text-white/60 hover:text-white text-sm transition-colors">Sign in</Link>
          <Link href="/app"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/20">
            Get started free
          </Link>
        </div>
      </div>
    </nav>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <AuroraBackground>
      <Nav />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col items-center justify-center min-h-screen px-6 pt-16 text-center">
        <div className="max-w-5xl mx-auto">
          <Badge>Now with CoreSignal · 75M+ private companies</Badge>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6">
            <span className="shimmer-text">Financial Intelligence</span>
            <br />
            <span className="text-white">Beyond </span>
            <TypeWriter />
          </h1>

          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            The AI-powered workspace for founders, operators, and analysts.
            Source-cited research, private company data, and live market intelligence — in one platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-16">
            <Link href="/app"
              className="group flex items-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-2xl shadow-blue-500/30 transition-all hover:scale-105 hover:shadow-blue-500/50 text-sm">
              Start for free
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            </Link>
            <a href="#platform"
              className="flex items-center gap-2 px-7 py-3.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/80 font-semibold rounded-2xl transition-all text-sm">
              See the platform
            </a>
          </div>

          {/* Hero terminal card */}
          <div className="relative max-w-2xl mx-auto animate-float">
            <div className="absolute inset-0 bg-blue-500/10 blur-2xl rounded-3xl" />
            <div className="relative gradient-border rounded-2xl bg-[#060e1e]/90 backdrop-blur overflow-hidden shadow-2xl">
              {/* Window chrome */}
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/[0.06]">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                <span className="ml-3 text-white/25 text-xs">Finsyt AI Research</span>
              </div>
              <TerminalDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ── TICKER STRIP ─────────────────────────────────────────────────── */}
      <TickerStrip />

      {/* ── STATS ────────────────────────────────────────────────────────── */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { n: 75, suf: 'M+', label: 'Private companies', icon: '🏢' },
            { n: 500, suf: 'M+', label: 'Employee profiles', icon: '👥' },
            { n: 22, suf: '', label: 'API endpoints', icon: '⚡' },
            { n: 10, suf: '+', label: 'Data providers', icon: '📡' },
          ].map(s => (
            <div key={s.label} className="text-center p-6 rounded-2xl bg-white/[0.03] border border-white/[0.05] hover:border-blue-500/20 transition-all">
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-3xl font-black text-white mb-1">
                <CountUp to={s.n} suffix={s.suf} />
              </div>
              <div className="text-white/40 text-xs">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LOGO CLOUD ───────────────────────────────────────────────────── */}
      <section className="py-8 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-white/25 text-xs font-medium mb-6 uppercase tracking-widest">Powered by</p>
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
            {LOGOS.map(l => (
              <span key={l} className="text-white/20 hover:text-white/50 text-sm font-semibold transition-colors cursor-default">{l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENTO FEATURES ───────────────────────────────────────────────── */}
      <section id="platform" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge>Platform</Badge>
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
              Every tool analysts actually need
            </h2>
            <p className="text-white/40 text-lg max-w-xl mx-auto">
              Built for the way modern finance teams work — fast, AI-first, and source-verified.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[180px]">
            {/* Large AI Research card */}
            <BentoCard className="md:col-span-2 md:row-span-2 p-6 flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl mb-4">🤖</div>
                <h3 className="text-white font-bold text-xl mb-2">AI Research Engine</h3>
                <p className="text-white/50 text-sm leading-relaxed">
                  Source-cited answers from SEC filings, earnings calls, and 10+ live data providers. Ask in plain English, get institutional-grade analysis.
                </p>
              </div>
              <div className="mt-4 bg-black/30 rounded-xl overflow-hidden border border-white/[0.05]">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/[0.05]">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500/60"/><div className="w-1.5 h-1.5 rounded-full bg-yellow-500/60"/><div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60"/>
                </div>
                <div className="p-3 font-mono text-[10px] space-y-1">
                  <div className="text-white/70">&gt; Compare MSFT vs GOOGL cloud margins</div>
                  <div className="text-white/30">⟳ Analyzing Q4 2025 filings...</div>
                  <div className="text-emerald-400">MSFT Azure: 44.2% op margin ¹</div>
                  <div className="text-emerald-400">GOOGL Cloud: 17.1% op margin ²</div>
                  <div className="text-blue-400/70 text-[9px]">[1] MSFT 10-Q Dec 2025  [2] GOOGL 10-K 2025</div>
                </div>
              </div>
            </BentoCard>

            {/* Private Companies */}
            <BentoCard className="p-5 flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 flex items-center justify-center text-lg mb-3">🏢</div>
                <h3 className="text-white font-semibold text-base mb-1.5">Private Company Intel</h3>
                <p className="text-white/45 text-xs leading-relaxed">75M+ private companies. Headcount trends, funding rounds, hiring signals.</p>
              </div>
              <div className="flex items-end gap-1 mt-2">
                <div className="flex gap-0.5 items-end">
                  {[20,35,28,45,38,55,48,65,58,72].map((h,i) => (
                    <div key={i} className="w-1.5 rounded-t bg-cyan-500/60" style={{height: `${h * 0.6}px`}} />
                  ))}
                </div>
                <span className="text-cyan-400 text-xs font-bold ml-2">+34%</span>
              </div>
            </BentoCard>

            {/* Company Discovery */}
            <BentoCard className="p-5 flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 flex items-center justify-center text-lg mb-3">🔍</div>
                <h3 className="text-white font-semibold text-base mb-1.5">Company Discovery</h3>
                <p className="text-white/45 text-xs leading-relaxed">"Series B AI fintechs in London, 50-200 employees" → instant structured list.</p>
              </div>
              <div className="mt-2 px-2.5 py-1.5 bg-purple-500/10 rounded-lg text-purple-300 text-[10px] font-mono truncate">
                AI → ES-DSL → CoreSignal 75M+
              </div>
            </BentoCard>

            {/* Formula Engine */}
            <BentoCard className="p-5 flex flex-col justify-between">
              <div>
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center text-lg mb-3">📊</div>
                <h3 className="text-white font-semibold text-base mb-1.5">Formula Engine</h3>
                <p className="text-white/45 text-xs leading-relaxed">Capital IQ-style mnemonics, native Excel integration.</p>
              </div>
              <div className="font-mono text-[10px] text-emerald-400 mt-2">=FINSYT("NVDA", "EV_EBITDA")</div>
            </BentoCard>

            {/* MCP Server */}
            <BentoCard className="md:col-span-2 p-5 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <div className="w-9 h-9 rounded-xl bg-pink-500/20 flex items-center justify-center text-lg mb-3">⚡</div>
                  <h3 className="text-white font-semibold text-base mb-1.5">MCP Server — Connect any LLM</h3>
                  <p className="text-white/45 text-xs leading-relaxed max-w-sm">Plug Claude, GPT-4, or any AI agent directly into Finsyt's financial data APIs via Model Context Protocol.</p>
                </div>
                <div className="hidden md:flex flex-col gap-1.5 text-right">
                  {['Claude', 'GPT-4o', 'Gemini'].map(m => (
                    <div key={m} className="flex items-center gap-2 px-2.5 py-1 bg-pink-500/10 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-white/50 text-[10px] font-mono">{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            </BentoCard>
          </div>
        </div>
      </section>

      {/* ── DATA PROVIDERS ───────────────────────────────────────────────── */}
      <section id="data" className="py-20 px-6 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto text-center">
          <Badge>Data Coverage</Badge>
          <h2 className="text-4xl font-black text-white mb-4 tracking-tight">
            Institutional-grade data, <br />
            <span className="shimmer-text">self-serve pricing</span>
          </h2>
          <p className="text-white/40 mb-12 max-w-xl mx-auto">
            Multi-source waterfall architecture means you always get the best available data. No single point of failure.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { name: 'CoreSignal', tags: ['75M+ companies', 'Employee data', 'Job signals'], color: 'blue' },
              { name: 'FMP', tags: ['Financials', 'Estimates', 'DCF'], color: 'emerald' },
              { name: 'EODHD', tags: ['Live quotes', 'Macro', 'News'], color: 'amber' },
              { name: 'SEC EDGAR', tags: ['10-K/10-Q', 'XBRL', 'Filings'], color: 'purple' },
              { name: 'FRED', tags: ['Macro data', 'GDP', 'Inflation'], color: 'cyan' },
              { name: 'Finnhub', tags: ['Sentiment', 'Insiders', 'Alt data'], color: 'pink' },
              { name: 'OpenAI', tags: ['GPT-4o', 'Embeddings', 'Vision'], color: 'orange' },
              { name: 'Anthropic', tags: ['Claude 3.5', 'Long context', 'Tools'], color: 'red' },
            ].map(p => (
              <div key={p.name} className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-blue-500/20 text-left transition-all">
                <div className="text-white font-bold text-sm mb-2">{p.name}</div>
                <div className="flex flex-wrap gap-1">
                  {p.tags.map(t => <span key={t} className="text-white/35 text-[10px] bg-white/[0.04] px-1.5 py-0.5 rounded-md">{t}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <Badge>Testimonials</Badge>
            <h2 className="text-4xl font-black text-white tracking-tight">Trusted by investors & operators</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {TESTIMONIALS.map(t => (
              <BentoCard key={t.name} className="p-6">
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(i => <svg key={i} className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>)}
                </div>
                <p className="text-white/70 text-sm leading-relaxed mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white text-xs font-bold">{t.avatar}</div>
                  <div>
                    <div className="text-white text-xs font-semibold">{t.name}</div>
                    <div className="text-white/35 text-xs">{t.role}</div>
                  </div>
                </div>
              </BentoCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <Badge>Pricing</Badge>
            <h2 className="text-4xl font-black text-white tracking-tight mb-3">Start free. Scale when ready.</h2>
            <p className="text-white/40">No credit card required. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <PricingCard
              plan="Free"
              price="$0"
              features={['AI Research (10 queries/day)', 'Live market data', 'Basic company search', '5 watchlist items', 'Community support']}
              cta="Get started free"
            />
            <PricingCard
              plan="Pro"
              price="$49"
              period="mo"
              highlight
              features={['Unlimited AI research', 'Private company intel (CoreSignal)', 'Company Discovery', 'Formula Engine', 'MCP server access', 'Excel integration', 'Priority support']}
              cta="Start Pro trial"
            />
            <PricingCard
              plan="Team"
              price="$199"
              period="mo"
              features={['Everything in Pro', 'Up to 10 seats', 'Shared workspaces', 'Team watchlists', 'Custom data exports', 'SLA + dedicated support']}
              cta="Contact sales"
            />
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-600/10 blur-3xl rounded-full" />
            <div className="relative p-12 rounded-3xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-transparent">
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
                Ready to leave the old terminals behind?
              </h2>
              <p className="text-white/50 mb-8 text-lg">Join hundreds of analysts and investors using Finsyt.</p>
              <Link href="/app"
                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl shadow-2xl shadow-blue-500/30 transition-all hover:scale-105 text-base">
                Start for free
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] px-6 py-10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-black text-xs">F</div>
            <span className="text-white/60 text-sm font-semibold">Finsyt</span>
          </div>
          <div className="flex gap-6 text-white/25 text-xs">
            {['Platform', 'Pricing', 'Docs', 'Privacy', 'Terms'].map(l => (
              <a key={l} href="#" className="hover:text-white/60 transition-colors">{l}</a>
            ))}
          </div>
          <div className="text-white/20 text-xs">© 2026 Finsyt. All rights reserved.</div>
        </div>
      </footer>
    </AuroraBackground>
  )
}
