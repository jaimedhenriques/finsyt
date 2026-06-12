'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const KEY = 'finsyt:firstrun:done'

const STEPS = [
  {
    eyebrow: 'Welcome to Finsyt',
    title: 'Fundamentals + the agent that reads them.',
    body: 'Live company financials, transcripts, filings, and a research agent that grounds every answer in source quotes.',
    cta: 'Show me around',
  },
  {
    eyebrow: 'Your workspace',
    title: 'Three ways to move fast.',
    body: 'Type a ticker in the universal search · ⌘K to jump anywhere · Ask AI for a sourced research run on any topic in your coverage.',
    cta: 'Got it',
  },
  {
    eyebrow: 'Pick a starting point',
    title: 'What would you like to do first?',
    body: '',
    cta: 'Done',
    choices: [
      { label: 'Open a company workspace', href: '/app/c/AAPL' },
      { label: 'Run an AI research query',  href: '/app/research' },
      { label: 'Browse the screener',       href: '/app/screener' },
      { label: 'See live market signals',   href: '/app/markets' },
    ],
  },
] as const

export default function FirstRunWelcome() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const done = localStorage.getItem(KEY)
      if (!done) setOpen(true)
    } catch { /* noop */ }
  }, [])

  function dismiss() {
    try { localStorage.setItem(KEY, String(Date.now())) } catch {}
    setOpen(false)
  }
  function pickAndGo(href: string) {
    try { localStorage.setItem(KEY, String(Date.now())) } catch {}
    setOpen(false)
    router.push(href)
  }

  if (!open) return null
  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="firstrun-title"
      style={{
        position:'fixed', inset:0, zIndex:1200,
        background:'rgba(8,14,26,0.55)', backdropFilter:'blur(6px)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:24,
      }}>
      <div style={{
        width:'min(520px, 100%)', background:'var(--bg-card)',
        border:'1px solid var(--border)', borderRadius:16,
        boxShadow:'0 24px 64px rgba(0,0,0,0.35)', overflow:'hidden',
        animation:'firstrunPop 0.22s ease',
      }}>
        <style>{`
          @keyframes firstrunPop {
            from { opacity:0; transform:translateY(8px) scale(0.98); }
            to   { opacity:1; transform:none; }
          }
        `}</style>
        <div style={{ padding:'28px 28px 8px' }}>
          <div style={{
            display:'inline-flex', alignItems:'center', gap:8,
            fontSize:11, fontWeight:700, letterSpacing:'0.08em',
            color:'var(--accent-text)', textTransform:'uppercase',
          }}>
            <span style={{
              width:18, height:18, borderRadius:5,
              background:'var(--gradient-brand)',
              display:'inline-flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontSize:11, fontWeight:900,
            }}>F</span>
            {s.eyebrow}
          </div>
          <h2 id="firstrun-title" style={{
            fontFamily:"'Inter Tight', 'Inter', sans-serif",
            fontSize:24, fontWeight:700, letterSpacing:'-0.02em',
            lineHeight:1.2, margin:'14px 0 10px', color:'var(--text-primary)',
          }}>{s.title}</h2>
          {s.body && (
            <p style={{ margin:0, color:'var(--text-secondary)', fontSize:14, lineHeight:1.6 }}>
              {s.body}
            </p>
          )}
          {'choices' in s && s.choices && (
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:18 }}>
              {s.choices.map(c => (
                <button key={c.href} onClick={() => pickAndGo(c.href)} style={{
                  textAlign:'left', padding:'12px 14px', borderRadius:10,
                  border:'1px solid var(--border)', background:'var(--bg-elevated)',
                  color:'var(--text-primary)', fontSize:13.5, fontWeight:600,
                  cursor:'pointer', fontFamily:'inherit',
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                }}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--accent)'; (e.currentTarget as HTMLElement).style.background='var(--hover)'}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border)'; (e.currentTarget as HTMLElement).style.background='var(--bg-elevated)'}}
                >
                  <span>{c.label}</span>
                  <span style={{ color:'var(--accent-text)' }}>→</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* footer / progress */}
        <div style={{
          padding:'18px 24px', borderTop:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'var(--bg-elevated)',
        }}>
          <div style={{ display:'flex', gap:6 }}>
            {STEPS.map((_, i) => (
              <span key={i} style={{
                width: i === step ? 22 : 6, height:6, borderRadius:3,
                background: i === step ? 'var(--accent)' : 'var(--border)',
                transition:'width 0.18s',
              }}/>
            ))}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={dismiss} style={{
              padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)',
              background:'transparent', color:'var(--text-secondary)',
              fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
            }}>Skip</button>
            {!isLast && (
              <button onClick={() => setStep(s2 => Math.min(STEPS.length - 1, s2 + 1))} style={{
                padding:'8px 16px', borderRadius:999, border:'none',
                background:'var(--gradient-brand)', color:'#fff',
                fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
              }}>{s.cta} →</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
