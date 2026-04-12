'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

// ── Dot grid background ───────────────────────────────────────────────────────
function DotGrid() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
      backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
      backgroundSize: '28px 28px',
      opacity: 0.55,
    }} />
  )
}

// ── Sticky Nav ────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: scrolled ? 'rgba(255,255,255,0.95)' : 'transparent',
      backdropFilter: scrolled ? 'blur(12px)' : 'none',
      borderBottom: scrolled ? '1px solid #e5e7eb' : '1px solid transparent',
      transition: 'all 0.25s ease',
    }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, background: '#1A56FF', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.02em' }}>Finsyt</span>
        </div>
        {/* Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Product','Data','Pricing','Company'].map(l => (
            <a key={l} href="#" style={{ fontSize: 14, fontWeight: 500, color: '#374151', textDecoration: 'none', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#1A56FF')}
              onMouseLeave={e => (e.currentTarget.style.color = '#374151')}>{l}</a>
          ))}
        </div>
        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/app/research" style={{ fontSize: 14, fontWeight: 500, color: '#374151', textDecoration: 'none' }}>Sign in</Link>
          <Link href="/app/research" style={{ fontSize: 14, fontWeight: 600, background: '#1A56FF', color: '#fff', padding: '8px 20px', borderRadius: 8, textDecoration: 'none', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#1040e0')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1A56FF')}>Request access</Link>
        </div>
      </div>
    </nav>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ position: 'relative', zIndex: 1, paddingTop: 160, paddingBottom: 100, textAlign: 'center', maxWidth: 800, margin: '0 auto', padding: '160px 32px 100px' }}>
      {/* Announcement banner */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 99, padding: '5px 14px', marginBottom: 36, fontSize: 13, color: '#1d4ed8', fontWeight: 500 }}>
        <span style={{ width: 6, height: 6, background: '#1A56FF', borderRadius: '50%', display: 'inline-block' }} />
        Introducing Finsyt Intelligence — AI-native financial research
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(40px,6vw,68px)', fontWeight: 700, color: '#0a0a0a', lineHeight: 1.1, letterSpacing: '-0.035em', marginBottom: 24 }}>
        The intelligence layer<br />for modern finance
      </h1>
      <p style={{ fontSize: 18, color: '#6b7280', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 44px', fontWeight: 400 }}>
        Finsyt combines institutional-grade data with AI reasoning to deliver research, screening, and analysis in seconds — not hours.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/app/research" style={{ fontSize: 15, fontWeight: 600, background: '#1A56FF', color: '#fff', padding: '13px 28px', borderRadius: 9, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(26,86,255,0.25)' }}>
          Start for free
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </Link>
        <Link href="/app/research" style={{ fontSize: 15, fontWeight: 500, background: '#fff', color: '#374151', padding: '13px 28px', borderRadius: 9, textDecoration: 'none', border: '1.5px solid #e5e7eb', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          See demo
        </Link>
      </div>
    </section>
  )
}

// ── Trust strip ───────────────────────────────────────────────────────────────
function TrustStrip() {
  const providers = ['EODHD', 'SEC EDGAR', 'FRED', 'Finnhub', 'FMP', 'CoreSignal', 'Perplexity']
  return (
    <section style={{ position: 'relative', zIndex: 1, borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', padding: '24px 32px', textAlign: 'center' }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20 }}>Powered by institutional-grade data</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 32px', justifyContent: 'center' }}>
        {providers.map(p => (
          <span key={p} style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{p}</span>
        ))}
      </div>
    </section>
  )
}

// ── Features (numbered scroll) ────────────────────────────────────────────────
const FEATURES = [
  {
    num: '01',
    title: 'AI-native research',
    desc: 'Ask any financial question in plain language. Finsyt Intelligence sources, synthesises and cites data from SEC filings, earnings transcripts, macro series, and real-time quotes — all in one answer.',
    tags: ['Deep research', 'Inline citations', 'Streaming'],
  },
  {
    num: '02',
    title: 'Company intelligence',
    desc: '10-tab company pages with price charts, segment analysis, financial models, insider activity, ESG data, SEC filings, analyst consensus, and earnings transcripts — all in one place.',
    tags: ['10 data layers', 'Live prices', 'SEC EDGAR'],
  },
  {
    num: '03',
    title: 'Quantitative screener',
    desc: 'Screen across 50,000+ global equities using FQL — our proprietary formula language. Build, save, and export screens with P/E, revenue growth, margins, and custom multi-factor logic.',
    tags: ['Formula engine', '50k+ equities', 'Export'],
  },
  {
    num: '04',
    title: 'Private market radar',
    desc: 'Track private companies via CoreSignal headcount signals, funding rounds, and web presence. Surface pre-IPO candidates before they go public.',
    tags: ['CoreSignal', 'Headcount signals', 'Pre-IPO'],
  },
]

function Features() {
  return (
    <section style={{ position: 'relative', zIndex: 1, maxWidth: 1000, margin: '0 auto', padding: '100px 32px' }}>
      <div style={{ display: 'grid', gap: 0 }}>
        {FEATURES.map((f, i) => (
          <div key={f.num} style={{
            display: 'grid', gridTemplateColumns: '120px 1fr', gap: 48,
            padding: '48px 0', borderBottom: i < FEATURES.length - 1 ? '1px solid #f3f4f6' : 'none',
            alignItems: 'start',
          }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 700, color: '#f3f4f6', lineHeight: 1 }}>{f.num}</div>
            <div>
              <h3 style={{ fontSize: 22, fontWeight: 700, color: '#0a0a0a', marginBottom: 12, letterSpacing: '-0.02em' }}>{f.title}</h3>
              <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.7, marginBottom: 20 }}>{f.desc}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {f.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 12, fontWeight: 600, color: '#1A56FF', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '3px 10px' }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Social proof ──────────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { quote: "Replaced three tools with Finsyt. The depth of research is institutional-grade at a fraction of the cost.", name: "Head of Research, Hedge Fund", initials: "HR" },
  { quote: "The screener with Formula Engine is a game-changer. We run our entire quant process through it.", name: "Portfolio Manager, Family Office", initials: "PM" },
  { quote: "SEC EDGAR integration alone saves my team 4+ hours per deal. The AI summaries are accurate.", name: "Associate, Growth Equity", initials: "AE" },
]

function Testimonials() {
  return (
    <section style={{ position: 'relative', zIndex: 1, background: '#fafafa', borderTop: '1px solid #f3f4f6', borderBottom: '1px solid #f3f4f6', padding: '80px 32px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 48, textAlign: 'center' }}>What practitioners say</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {TESTIMONIALS.map((t, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '28px 28px 24px' }}>
              <p style={{ fontSize: 15, color: '#111827', lineHeight: 1.65, marginBottom: 20, fontStyle: 'italic' }}>"{t.quote}"</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#1A56FF' }}>{t.initials}</div>
                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{t.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA Banner ────────────────────────────────────────────────────────────────
function CTABanner() {
  return (
    <section style={{ position: 'relative', zIndex: 1, padding: '100px 32px', textAlign: 'center' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(28px,4vw,46px)', fontWeight: 700, color: '#0a0a0a', letterSpacing: '-0.03em', marginBottom: 16, lineHeight: 1.2 }}>Start your research.<br />Free today.</h2>
        <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 36, lineHeight: 1.6 }}>No credit card required. Full access to Finsyt Intelligence, company pages, and the screener.</p>
        <Link href="/app/research" style={{ fontSize: 15, fontWeight: 600, background: '#1A56FF', color: '#fff', padding: '14px 32px', borderRadius: 9, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 24px rgba(26,86,255,0.28)' }}>
          Get started — it's free
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </Link>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ position: 'relative', zIndex: 1, borderTop: '1px solid #f3f4f6', padding: '40px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1160, margin: '0 auto', flexWrap: 'wrap', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 22, height: 22, background: '#1A56FF', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </div>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: 15, fontWeight: 700, color: '#0a0a0a' }}>Finsyt</span>
        <span style={{ fontSize: 13, color: '#9ca3af', marginLeft: 8 }}>© 2026 Finsyt Ltd. All rights reserved.</span>
      </div>
      <div style={{ display: 'flex', gap: 24 }}>
        {['Privacy','Terms','Status'].map(l => (
          <a key={l} href="#" style={{ fontSize: 13, color: '#9ca3af', textDecoration: 'none' }}>{l}</a>
        ))}
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', position: 'relative' }}>
      <DotGrid />
      <Nav />
      <Hero />
      <TrustStrip />
      <Features />
      <Testimonials />
      <CTABanner />
      <Footer />
    </div>
  )
}
