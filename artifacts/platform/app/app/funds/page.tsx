'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Card, PageHero, ContextualAskBar } from '@/components/ui'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

const POPULAR = [
  { sym: 'SPY',  name: 'SPDR S&P 500 ETF Trust' },
  { sym: 'QQQ',  name: 'Invesco QQQ Trust' },
  { sym: 'VTI',  name: 'Vanguard Total Stock Market ETF' },
  { sym: 'VOO',  name: 'Vanguard S&P 500 ETF' },
  { sym: 'IWM',  name: 'iShares Russell 2000 ETF' },
  { sym: 'ARKK', name: 'ARK Innovation ETF' },
  { sym: 'VEA',  name: 'Vanguard FTSE Developed Markets ETF' },
  { sym: 'AGG',  name: 'iShares Core U.S. Aggregate Bond ETF' },
]

export default function FundsLandingPage() {
  const [input, setInput] = useState('')
  const [results, setResults] = useState<Array<{ symbol: string; name?: string }>>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const q = input.trim()
    if (!q) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      fetch(`${BASE}/api/search?q=${encodeURIComponent(q)}&limit=8`)
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (cancelled) return
          const arr: any[] = j?.results || j?.items || j || []
          setResults(arr
            .map(x => ({ symbol: (x.symbol || x.ticker || '').toUpperCase(), name: x.name || x.companyName }))
            .filter(x => x.symbol)
            .slice(0, 8))
        })
        .catch(() => { if (!cancelled) setResults([]) })
        .finally(() => { if (!cancelled) setSearching(false) })
    }, 180)
    return () => { cancelled = true; window.clearTimeout(t) }
  }, [input])

  const directHref = useMemo(() => {
    const s = input.trim().toUpperCase()
    return s ? `/app/funds/${encodeURIComponent(s)}` : null
  }, [input])

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Funds"
        title="Fund & ETF Explorer"
        accentWord="ETF"
        subtitle="Inspect any ETF or mutual fund — top holdings, sector and asset weightings, expense ratios and bond credit quality. Supplementary data sourced from Yahoo Finance."
      />

      <div style={{ padding: '0 1.75rem 2.5rem', display: 'grid', gap: 18, maxWidth: 980 }}>
        <ContextualAskBar
          context="Funds"
          contextData={{ page: 'funds' }}
          chips={[
            { label: 'Compare SPY & QQQ',  prompt: 'Compare the top holdings and sector weightings of SPY and QQQ.' },
            { label: 'Explain ETF expense ratios', prompt: 'Explain how ETF expense ratios work and what counts as cheap vs. expensive.' },
          ]}
          placeholder="Ask Finsyt about a fund or ETF…"
          style={{ margin: '0 0 8px' }}
        />

        <Card padding="22px 24px">
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Pick a fund or ETF</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              onKeyDown={e => { if (e.key === 'Enter' && directHref) { window.location.href = `${BASE}${directHref}` } }}
              placeholder="Search symbol (e.g. SPY)"
              autoFocus
              aria-label="Fund search"
              style={{
                flex: 1, minWidth: 240,
                padding: '11px 14px', borderRadius: 10,
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-primary)', fontSize: 14,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            {directHref && (
              <Link
                href={directHref}
                style={{
                  padding: '10px 16px', borderRadius: 10,
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                Open {input.trim().toUpperCase()} →
              </Link>
            )}
          </div>

          {results.length > 0 && (
            <div style={{ marginTop: 14, display: 'grid', gap: 4 }}>
              {results.map(r => (
                <Link
                  key={r.symbol}
                  href={`/app/funds/${encodeURIComponent(r.symbol)}`}
                  style={{
                    padding: '10px 12px', borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    textDecoration: 'none', color: 'var(--text-primary)',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{r.symbol}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.name || ''}</span>
                </Link>
              ))}
            </div>
          )}

          {!searching && input.trim() && results.length === 0 && (
            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              No suggestions matched. Press enter to open the profile for {input.trim().toUpperCase()}.
            </div>
          )}
        </Card>

        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, padding: '0 4px' }}>Popular ETFs</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {POPULAR.map(p => (
              <Link
                key={p.sym}
                href={`/app/funds/${p.sym}`}
                className="card"
                style={{
                  padding: '14px 16px', textDecoration: 'none', color: 'var(--text-primary)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 800 }}>{p.sym}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.name}</span>
                <span style={{ fontSize: 11, color: 'var(--accent-text)', fontWeight: 700, marginTop: 4 }}>Open profile →</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
