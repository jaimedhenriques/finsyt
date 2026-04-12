'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'

// ── Utility ───────────────────────────────────────────────────────────────────
const cn = (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(' ')

// ── Typewriter hook ───────────────────────────────────────────────────────────
function useTypewriter(texts: string[], speed = 40, pause = 1800) {
  const [display, setDisplay] = useState('')
  const [idx, setIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const current = texts[idx]
    const timeout = setTimeout(() => {
      if (!deleting) {
        if (display.length < current.length) {
          setDisplay(current.slice(0, display.length + 1))
        } else {
          setTimeout(() => setDeleting(true), pause)
        }
      } else {
        if (display.length > 0) {
          setDisplay(display.slice(0, -1))
        } else {
          setDeleting(false)
          setIdx((i) => (i + 1) % texts.length)
        }
      }
    }, deleting ? speed / 2 : speed)
    return () => clearTimeout(timeout)
  }, [display, deleting, idx, texts, speed, pause])
  return display
}

// ── FadeIn wrapper ────────────────────────────────────────────────────────────
function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }} className={className}>
      {children}
    </motion.div>
  )
}

// ── Marquee (logo strip) ──────────────────────────────────────────────────────
function Marquee({ items }: { items: string[] }) {
  return (
    <div style={{ overflow: 'hidden', width: '100%', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(to right, #fff, transparent)', zIndex: 1 }} />
      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 80, background: 'linear-gradient(to left, #fff, transparent)', zIndex: 1 }} />
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
        style={{ display: 'flex', gap: 64, whiteSpace: 'nowrap', width: 'max-content' }}>
        {[...items, ...items].map((item, i) => (
          <span key={i} style={{ fontSize: 15, fontWeight: 700, color: '#9CA3AF', letterSpacing: '-0.01em', fontFamily: 'system-ui' }}>{item}</span>
        ))}
      </motion.div>
    </div>
  )
}

// ── Chat mockup component ─────────────────────────────────────────────────────
function ChatMockup({ query }: { query: string }) {
  const typed = useTypewriter([
    'Full deep dive on NVDA — revenue, margins, valuation vs peers',
    'Summarise Q4 earnings calls across semiconductor sector',
    'Which UK fintechs raised Series B in the last 6 months?',
    'Build a DCF model for Stripe at $70B valuation',
  ], 35, 2200)

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 20px 60px rgba(0,0,0,0.10)', padding: '20px 20px 16px', maxWidth: 480, width: '100%' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#1A56FF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>F</div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Finsyt Intelligence</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#10B981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />Live
        </span>
      </div>
      {/* Query bubble */}
      <div style={{ background: '#1A56FF', borderRadius: '12px 12px 4px 12px', padding: '12px 16px', marginBottom: 14, marginLeft: 'auto', maxWidth: '85%' }}>
        <p style={{ fontSize: 13, color: '#fff', lineHeight: 1.5, margin: 0 }}>{typed}<span style={{ borderRight: '2px solid rgba(255,255,255,0.7)', marginLeft: 2, animation: 'blink 1s step-end infinite' }}></span></p>
      </div>
      {/* Source pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {['SEC EDGAR', 'EODHD', 'FMP', 'FRED'].map(s => (
          <span key={s} style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: '#F0F4FF', color: '#1A56FF', border: '1px solid #DBEAFE' }}>{s}</span>
        ))}
      </div>
      {/* Response preview */}
      <div style={{ background: '#F9FAFB', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#1A56FF', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ height: 10, background: '#E5E7EB', borderRadius: 4, width: '75%', marginBottom: 6 }} />
            <div style={{ height: 10, background: '#E5E7EB', borderRadius: 4, width: '90%', marginBottom: 6 }} />
            <div style={{ height: 10, background: '#E5E7EB', borderRadius: 4, width: '60%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>10-K</span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#EDE9FE', color: '#5B21B6', fontWeight: 600 }}>Earnings</span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#DCFCE7', color: '#166534', fontWeight: 600 }}>Live data</span>
        </div>
      </div>
    </div>
  )
}

// ── Screener mockup ───────────────────────────────────────────────────────────
function ScreenerMockup() {
  const rows = [
    { ticker: 'NVDA', name: 'NVIDIA', pe: '34.2x', rev: '+122%', margin: '55.1%', score: 97 },
    { ticker: 'MSFT', name: 'Microsoft', pe: '32.1x', rev: '+17%', margin: '44.6%', score: 89 },
    { ticker: 'ASML', name: 'ASML', pe: '28.4x', rev: '+22%', margin: '31.2%', score: 82 },
    { ticker: 'META', name: 'Meta', pe: '24.8x', rev: '+19%', margin: '40.8%', score: 78 },
  ]
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 20px 60px rgba(0,0,0,0.10)', overflow: 'hidden', maxWidth: 480, width: '100%' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Quantitative Screen</span>
        <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 4, background: '#F0F4FF', color: '#1A56FF', fontWeight: 600, marginLeft: 'auto' }}>4 results</span>
      </div>
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 40px', gap: 0, padding: '4px 16px 8px', fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          <span>Ticker</span><span>P/E</span><span>Rev Gr.</span><span>Margin</span><span></span>
        </div>
        {rows.map((r, i) => (
          <motion.div key={r.ticker} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 + 0.3 }}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 40px', gap: 0, padding: '8px 16px', borderTop: '1px solid #F9FAFB', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{r.ticker}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>{r.name}</div>
            </div>
            <span style={{ fontSize: 12, color: '#374151' }}>{r.pe}</span>
            <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>{r.rev}</span>
            <span style={{ fontSize: 12, color: '#374151' }}>{r.margin}</span>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: `conic-gradient(#1A56FF ${r.score}%, #F3F4F6 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#1A56FF' }}>{r.score}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ── Market data mockup ────────────────────────────────────────────────────────
function MarketMockup() {
  const sectors = ['Technology', 'Healthcare', 'Financials', 'Energy', 'Industrials']
  const [active, setActive] = useState('Technology')
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E5E7EB', boxShadow: '0 20px 60px rgba(0,0,0,0.10)', overflow: 'hidden', maxWidth: 480, width: '100%' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #F3F4F6', fontSize: 12, fontWeight: 700, color: '#374151' }}>Markets — Live</div>
      <div style={{ display: 'flex', borderBottom: '1px solid #F3F4F6', overflowX: 'auto' }}>
        {sectors.map(s => (
          <button key={s} onClick={() => setActive(s)}
            style={{ padding: '10px 14px', fontSize: 11.5, fontWeight: 600, color: active === s ? '#1A56FF' : '#6B7280', background: 'none', border: 'none', cursor: 'pointer', borderBottom: active === s ? '2px solid #1A56FF' : '2px solid transparent', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {[['AAPL','Apple Inc.','$213.40','+1.4%',true],['GOOGL','Alphabet','$171.20','+0.8%',true],['META','Meta','$512.80','-0.3%',false]].map(([t,n,p,ch,up]) => (
          <div key={t as string} style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F9FAFB' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#1A56FF', marginRight: 10 }}>{(t as string).slice(0,2)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{t as string}</div>
              <div style={{ fontSize: 10, color: '#9CA3AF' }}>{n as string}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{p as string}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: up ? '#10B981' : '#EF4444' }}>{ch as string}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sticky scroll feature sections ───────────────────────────────────────────
const FEATURES = [
  {
    num: '01',
    headline: 'Institutional research,\ninstantly synthesised',
    sub: 'Ask complex questions across filings, earnings, fundamentals and macro data. Get cited, structured answers in seconds — not hours of manual digging.',
    mockup: <ChatMockup query="" />,
  },
  {
    num: '02',
    headline: 'Quantitative screening\nacross global equities',
    sub: 'Build multi-factor screens using FQL — our proprietary formula language. Filter across 50,000+ equities by P/E, revenue growth, margins, and any custom logic.',
    mockup: <ScreenerMockup />,
  },
  {
    num: '03',
    headline: 'Live market intelligence,\nunified in one workspace',
    sub: 'Real-time quotes, sector moves, macro indicators and news signals — all connected. No tab-switching, no aggregation lag.',
    mockup: <MarketMockup />,
  },
]

function StickyFeatureSection() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const i = refs.current.indexOf(e.target as HTMLDivElement)
            if (i >= 0) setActive(i)
          }
        })
      },
      { threshold: 0.6 }
    )
    refs.current.forEach(r => r && observer.observe(r))
    return () => observer.disconnect()
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
      {/* Left — sticky text */}
      <div style={{ position: 'sticky', top: 120, height: 'fit-content', paddingRight: 60, paddingTop: 40 }}>
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#1A56FF', marginBottom: 16 }}>
              FEATURE {FEATURES[active].num}
            </div>
            <h2 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.15, color: '#111827', marginBottom: 20, whiteSpace: 'pre-line', letterSpacing: '-0.03em', fontFamily: 'Georgia, serif' }}>
              {FEATURES[active].headline}
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: '#6B7280', maxWidth: 420 }}>
              {FEATURES[active].sub}
            </p>
            {/* Step indicators */}
            <div style={{ display: 'flex', gap: 10, marginTop: 36 }}>
              {FEATURES.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => refs.current[i]?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  <div style={{ width: i === active ? 24 : 6, height: 6, borderRadius: 3, background: i === active ? '#1A56FF' : '#E5E7EB', transition: 'all 0.3s' }} />
                </div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {/* Right — scrolling mockups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '40vh', paddingTop: '10vh', paddingBottom: '20vh' }}>
        {FEATURES.map((f, i) => (
          <div key={i} ref={el => { refs.current[i] = el }} style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <motion.div initial={{ opacity: 0.3, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }} viewport={{ once: false, margin: '-30%' }}>
              {f.mockup}
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Testimonials ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { quote: "The research depth is extraordinary. We now surface insights in minutes that used to take our team full days.", role: "Head of Research, Tier-1 Hedge Fund", initials: "HR" },
  { quote: "Finally a platform that connects private company intelligence with public market data in one coherent workflow.", role: "VP Strategy, Growth Equity Firm", initials: "VS" },
  { quote: "The screener's FQL language is genuinely powerful. We've replaced three separate tools with just Finsyt.", role: "Quantitative Analyst, Asset Manager", initials: "QA" },
]

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const logos = ['J.P. Morgan', 'Goldman Sachs', 'BlackRock', 'Andreessen Horowitz', 'Sequoia', 'KKR', 'Advent International', 'Permira', 'General Atlantic']

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: '#fff', color: '#111827', overflowX: 'hidden' }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        * { box-sizing: border-box; }
        ::selection { background: #DBEAFE; color: #1A56FF; }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #F3F4F6', height: 60, display: 'flex', alignItems: 'center', padding: '0 40px', gap: 40 }}>
        <Link href="/app/research" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#1A56FF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 13 }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#111827', letterSpacing: '-0.03em' }}>Finsyt</span>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#F0F4FF', color: '#1A56FF', fontWeight: 700 }}>Beta</span>
        </Link>
        <div style={{ flex: 1, display: 'flex', gap: 32, justifyContent: 'center' }}>
          {[{label:'Product',href:'#features'},{label:'Data',href:'#data'},{label:'Pricing',href:'#pricing'},{label:'Docs',href:'/app/developer'}].map(({label,href}) => (
            <a key={label} href={href} style={{ fontSize: 14, fontWeight: 500, color: '#374151', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color='#1A56FF')}
              onMouseLeave={e => (e.currentTarget.style.color='#374151')}>
              {label}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Link href="/app/research" style={{ fontSize: 14, fontWeight: 500, color: '#374151', textDecoration: 'none' }}>Sign in</Link>
          <Link href="/app/research" style={{ fontSize: 14, fontWeight: 600, background: '#1A56FF', color: '#fff', padding: '8px 18px', borderRadius: 8, textDecoration: 'none', transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity='0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity='1')}>
            Request access →
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section id="features" style={{ padding: '100px 40px 80px', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#F0F4FF', border: '1px solid #DBEAFE', borderRadius: 999, padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#1A56FF', marginBottom: 24 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1A56FF', display: 'inline-block' }} />
              Now in beta — limited access
            </div>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
            style={{ fontSize: 52, fontWeight: 900, lineHeight: 1.08, letterSpacing: '-0.04em', color: '#111827', marginBottom: 24, fontFamily: 'Georgia, serif' }}>
            Give every decision<br />an <span style={{ color: '#1A56FF' }}>AI-powered</span><br />intelligence edge
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.2 }}
            style={{ fontSize: 17, lineHeight: 1.7, color: '#6B7280', marginBottom: 36, maxWidth: 440 }}>
            One workspace for research, screening, filings analysis, and market data — powered by live institutional-grade data across 50,000+ global equities.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} style={{ display: 'flex', gap: 12 }}>
            <Link href="/app/research" style={{ fontSize: 15, fontWeight: 700, background: '#1A56FF', color: '#fff', padding: '13px 26px', borderRadius: 10, textDecoration: 'none', boxShadow: '0 4px 20px rgba(26,86,255,0.28)', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'transform 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform='translateY(-1px)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow='0 8px 32px rgba(26,86,255,0.36)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform=''; (e.currentTarget as HTMLAnchorElement).style.boxShadow='0 4px 20px rgba(26,86,255,0.28)' }}>
              Get started free →
            </Link>
            <Link href="/app/research" style={{ fontSize: 15, fontWeight: 600, background: '#fff', color: '#374151', padding: '13px 26px', borderRadius: 10, textDecoration: 'none', border: '1.5px solid #E5E7EB', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              View platform
            </Link>
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ duration: 0.7, delay: 0.2 }} style={{ display: 'flex', justifyContent: 'center' }}>
          <ChatMockup query="" />
        </motion.div>
      </section>

      {/* ── LOGO MARQUEE ── */}
      <section id="data" style={{ padding: '48px 0 56px', borderTop: '1px solid #F3F4F6', borderBottom: '1px solid #F3F4F6' }}>
        <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 28 }}>
          Trusted by teams at
        </p>
        <Marquee items={logos} />
      </section>

      {/* ── STICKY FEATURE SCROLL ── */}
      <section style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1A56FF', marginBottom: 12 }}>THE PLATFORM</p>
          <h2 style={{ fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1, color: '#111827', maxWidth: 560, marginBottom: 64, fontFamily: 'Georgia, serif' }}>
            From first signal to final decision — in one place
          </h2>
        </FadeIn>
        <StickyFeatureSection />
      </section>

      {/* ── DATA SOURCES STRIP ── */}
      <section style={{ background: '#F9FAFB', padding: '64px 40px', borderTop: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <FadeIn>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: 12 }}>POWERED BY</p>
            <h2 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', color: '#111827', marginBottom: 40, fontFamily: 'Georgia, serif' }}>
              Institutional-grade data, all in one pipe
            </h2>
          </FadeIn>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            {[
              { name: 'EODHD', desc: 'Global fundamentals' },
              { name: 'SEC EDGAR', desc: 'US regulatory filings' },
              { name: 'FRED', desc: 'Macro indicators' },
              { name: 'Finnhub', desc: 'Real-time quotes' },
              { name: 'FMP', desc: 'Financial statements' },
              { name: 'CoreSignal', desc: 'Private company data' },
            ].map(({ name, desc }) => (
              <FadeIn key={name}>
                <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#111827', marginBottom: 4 }}>{name}</div>
                  <div style={{ fontSize: 11.5, color: '#9CA3AF' }}>{desc}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="pricing" style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <h2 style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-0.03em', color: '#111827', marginBottom: 48, textAlign: 'center', fontFamily: 'Georgia, serif' }}>
            What our users say
          </h2>
        </FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
          {TESTIMONIALS.map((t, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div style={{ background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 16, padding: '28px 24px', height: '100%' }}>
                <p style={{ fontSize: 15, lineHeight: 1.65, color: '#374151', marginBottom: 20, fontStyle: 'italic' }}>"{t.quote}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#1A56FF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff' }}>{t.initials}</div>
                  <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{t.role}</span>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── CTA BANNER ── */}
      <section style={{ background: '#111827', padding: '80px 40px', textAlign: 'center' }}>
        <FadeIn>
          <h2 style={{ fontSize: 44, fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', marginBottom: 16, fontFamily: 'Georgia, serif' }}>
            Ready to work smarter?
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.6)', marginBottom: 36 }}>Join the professionals already using Finsyt to move faster and decide with confidence.</p>
          <Link href="/app/research" style={{ fontSize: 16, fontWeight: 700, background: '#1A56FF', color: '#fff', padding: '15px 36px', borderRadius: 12, textDecoration: 'none', boxShadow: '0 4px 24px rgba(26,86,255,0.4)', display: 'inline-block' }}>
            Get started free →
          </Link>
        </FadeIn>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: '1px solid #F3F4F6', padding: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg,#1A56FF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 11 }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 14, color: '#111827', letterSpacing: '-0.02em' }}>Finsyt</span>
        </div>
        <div style={{ display: 'flex', gap: 28 }}>
          {['Privacy','Terms','Security','Status'].map(l => (
            <a key={l} href="#" style={{ fontSize: 13, color: '#9CA3AF', textDecoration: 'none' }}>{l}</a>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#D1D5DB' }}>© 2026 Finsyt. All rights reserved.</span>
      </footer>
    </div>
  )
}
