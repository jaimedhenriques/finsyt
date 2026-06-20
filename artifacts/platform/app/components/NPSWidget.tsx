'use client'
import { useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'

const SESSION_KEY = 'finsyt_nps_last_shown'
const COOLDOWN_DAYS = 14

interface NPSWidgetProps {
  minSessionSeconds?: number   // how long user must be active before showing (default: 120s)
  forceShow?: boolean          // dev override
}

export default function NPSWidget({ minSessionSeconds = 120, forceShow = false }: NPSWidgetProps) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState<'score' | 'comment' | 'done'>('score')
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sessionStart] = useState(() => Date.now())

  // Check if we should show the widget
  const shouldShow = useCallback(() => {
    if (forceShow) return true
    const last = localStorage.getItem(SESSION_KEY)
    if (last) {
      const daysSince = (Date.now() - parseInt(last)) / (1000 * 60 * 60 * 24)
      if (daysSince < COOLDOWN_DAYS) return false
    }
    return true
  }, [forceShow])

  useEffect(() => {
    if (!shouldShow()) return
    const timer = setTimeout(() => {
      setVisible(true)
    }, minSessionSeconds * 1000)
    return () => clearTimeout(timer)
  }, [shouldShow, minSessionSeconds])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem(SESSION_KEY, Date.now().toString())
  }

  const handleScore = (s: number) => {
    setScore(s)
    setStep('comment')
  }

  const submit = async () => {
    if (score == null) return
    setSubmitting(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score,
          comment,
          suggestion,
          page: pathname,
          sessionDuration: Math.round((Date.now() - sessionStart) / 1000),
        }),
      })
    } catch {}
    setStep('done')
    setSubmitting(false)
    localStorage.setItem(SESSION_KEY, Date.now().toString())
    setTimeout(() => setVisible(false), 3000)
  }

  if (!visible) return null

  const scoreColor = score == null ? 'var(--accent)' : score >= 9 ? 'var(--pos)' : score >= 7 ? 'var(--amber)' : 'var(--neg)'
  const scoreLabel = score == null ? '' : score >= 9 ? 'Promoter 🚀' : score >= 7 ? 'Passive 😐' : 'Detractor 😞'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed', inset: 0, zIndex: 1200,
          background: 'rgba(8,14,26,0.5)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Widget card (intentionally white-themed regardless of app theme) */}
      <div data-theme="white" style={{
        position: 'fixed', bottom: 32, right: 32, zIndex: 1201,
        width: 400, maxWidth: 'calc(100vw - 48px)',
        background: '#fff', borderRadius: 20,
        boxShadow: '0 16px 64px rgba(0,0,0,0.2)',
        border: '1px solid #E2E8F2',
        overflow: 'hidden',
        animation: 'slideUp 0.3s ease',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px',
          background: 'linear-gradient(135deg,#080E1A,#0A1220)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--gradient-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, color: '#fff', fontSize: 13,
            }}>F</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>How is Finsyt working for you?</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>Takes 30 seconds · shapes the product</div>
            </div>
          </div>
          <button onClick={dismiss} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', fontSize: 18, lineHeight: 1,
            padding: '4px 6px', borderRadius: 6,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px 24px' }}>

          {/* ── STEP: SCORE ─────────────────────────────────────────────── */}
          {step === 'score' && (
            <div>
              <p style={{ fontSize: 14, color: '#2D3748', marginBottom: 16, lineHeight: 1.5 }}>
                How likely are you to recommend Finsyt to a colleague?
              </p>
              {/* Score buttons */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button key={n} onClick={() => handleScore(n)}
                    style={{
                      flex: 1, aspectRatio: '1', borderRadius: 8,
                      border: '1.5px solid',
                      borderColor: score === n ? scoreColor : '#E2E8F2',
                      background: score === n ? scoreColor : 'var(--bg-page)',
                      color: score === n ? '#fff' : '#4A5568',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      transition: 'all 0.1s',
                    }}>
                    {n}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Not at all</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Extremely likely</span>
              </div>
            </div>
          )}

          {/* ── STEP: COMMENT ───────────────────────────────────────────── */}
          {step === 'comment' && (
            <div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 16, padding: '10px 14px',
                borderRadius: 10, background: 'var(--bg-page)', border: '1px solid #E2E8F2',
              }}>
                <span style={{ fontSize: 24 }}>
                  {score! >= 9 ? '🚀' : score! >= 7 ? '😐' : '😞'}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{scoreLabel}</div>
                  <div style={{ fontSize: 12, color: '#7D8FA9' }}>Score: {score}/10</div>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', display: 'block', marginBottom: 6 }}>
                  What worked well? What felt off?
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Share your honest experience…"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1.5px solid #E2E8F2', fontSize: 13,
                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                    color: '#1C2B4A', lineHeight: 1.5, boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5568', display: 'block', marginBottom: 6 }}>
                  One thing that would make Finsyt a 10/10?
                </label>
                <textarea
                  value={suggestion}
                  onChange={e => setSuggestion(e.target.value)}
                  placeholder="e.g. Faster data, better search, more global coverage…"
                  rows={2}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1.5px solid #E2E8F2', fontSize: 13,
                    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
                    color: '#1C2B4A', lineHeight: 1.5, boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={dismiss}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1.5px solid var(--border)', background: '#fff',
                    color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}>
                  Skip
                </button>
                <button onClick={submit} disabled={submitting}
                  style={{
                    flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                    background: 'var(--gradient-brand)',
                    color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}>
                  {submitting ? 'Sending…' : 'Send Feedback →'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: DONE ──────────────────────────────────────────────── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🙏</div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#0A1628', marginBottom: 6 }}>
                Thank you, Jaime
              </div>
              <div style={{ fontSize: 13, color: '#7D8FA9', lineHeight: 1.6 }}>
                Your feedback goes directly into the product loop. We'll ship improvements based on what you told us.
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
