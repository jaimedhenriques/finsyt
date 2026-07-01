'use client'
/**
 * /app/research-library — QuantMind-style Quant Research Library
 *
 * Three panels:
 *  1. Ingest panel — add papers by arXiv ID / search / URL
 *  2. Library tab  — filterable list of ingested items
 *  3. Graph tab    — interactive topic knowledge-graph (SVG force layout)
 *  4. DeepResearch — multi-hop synthesis over the library (SSE streaming)
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const C = {
  bg:     'var(--bg-page)',
  card:   'var(--bg-card)',
  cardA:  'var(--bg-elevated)',
  border: 'var(--border)',
  borderS:'var(--border-strong)',
  p:      'var(--text-primary)',
  s:      'var(--text-secondary)',
  m:      'var(--text-muted)',
  acc:    'var(--accent)',
  accT:   'var(--accent-text)',
  accD:   'var(--accent-dim)',
  pos:    'var(--pos)',
  neg:    'var(--neg)',
  amb:    'var(--amber)',
}

const TOPIC_COLORS: Record<string, string> = {
  'Factor Investing':          '#6366f1',
  'Risk Management':           '#f43f5e',
  'Portfolio Optimization':    '#8b5cf6',
  'Market Microstructure':     '#0ea5e9',
  'Machine Learning in Finance':'#10b981',
  'Derivatives & Options':     '#f59e0b',
  'Alternative Data':          '#ec4899',
  'Fixed Income & Credit':     '#14b8a6',
  'Macro & Rates':             '#3b82f6',
  'High-Frequency Trading':    '#ef4444',
  'ESG & Sustainable Finance': '#22c55e',
  'Asset Allocation':          '#a855f7',
  'Behavioral Finance':        '#fb923c',
  'Volatility':                '#e879f9',
  'Crypto & DeFi':             '#f97316',
  'Earnings & Fundamentals':   '#06b6d4',
  'Sentiment Analysis':        '#84cc16',
  'Backtesting & Simulation':  '#64748b',
}
function topicColor(topic: string): string {
  return TOPIC_COLORS[topic] || '#6366f1'
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LibraryItem {
  id: string
  title: string
  authors: string[]
  abstract: string
  topics: string[]
  sourceType: 'arxiv' | 'url'
  arxivId?: string
  url?: string
  attribution: string
  ingestedAt: string
  chunkCount: number
  year?: number
}

interface GraphNode {
  id: string
  kind: 'topic' | 'paper'
  label: string
  weight: number
  arxivId?: string
  url?: string
  authors?: string[]
  // computed
  x?: number
  y?: number
  vx?: number
  vy?: number
}
interface GraphEdge { source: string; target: string }

interface Citation {
  index: number
  sourceName: string
  snippet: string
  attribution: string
  arxivId?: string
  url?: string
}

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Force-directed layout ─────────────────────────────────────────────────────

function forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
): GraphNode[] {
  const ITER = 80
  const REPULSION = 3_000
  const SPRING_K = 0.04
  const SPRING_LEN = 120
  const DAMPING = 0.85
  const cx = width / 2
  const cy = height / 2

  const ns: GraphNode[] = nodes.map((n, i) => ({
    ...n,
    x: n.x ?? cx + Math.cos((i / nodes.length) * Math.PI * 2) * 160 + (Math.random() - 0.5) * 30,
    y: n.y ?? cy + Math.sin((i / nodes.length) * Math.PI * 2) * 160 + (Math.random() - 0.5) * 30,
    vx: 0,
    vy: 0,
  }))

  const idx = new Map(ns.map((n, i) => [n.id, i]))

  for (let it = 0; it < ITER; it++) {
    const cooling = 1 - it / ITER
    // Repulsion
    for (let a = 0; a < ns.length; a++) {
      for (let b = a + 1; b < ns.length; b++) {
        const dx = (ns[b].x! - ns[a].x!) || 0.01
        const dy = (ns[b].y! - ns[a].y!) || 0.01
        const dist2 = dx * dx + dy * dy + 1
        const force = REPULSION / dist2
        const fx = (dx / Math.sqrt(dist2)) * force
        const fy = (dy / Math.sqrt(dist2)) * force
        ns[a].vx! -= fx; ns[a].vy! -= fy
        ns[b].vx! += fx; ns[b].vy! += fy
      }
    }
    // Spring forces
    for (const e of edges) {
      const a = idx.get(e.source)
      const b = idx.get(e.target)
      if (a == null || b == null) continue
      const dx = ns[b].x! - ns[a].x!
      const dy = ns[b].y! - ns[a].y!
      const dist = Math.sqrt(dx * dx + dy * dy) || 1
      const stretch = dist - SPRING_LEN
      const force = SPRING_K * stretch
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      ns[a].vx! += fx; ns[a].vy! += fy
      ns[b].vx! -= fx; ns[b].vy! -= fy
    }
    // Centre gravity
    for (const n of ns) {
      n.vx! += (cx - n.x!) * 0.015
      n.vy! += (cy - n.y!) * 0.015
    }
    // Integrate
    for (const n of ns) {
      n.vx! *= DAMPING * cooling
      n.vy! *= DAMPING * cooling
      n.x! = Math.max(40, Math.min(width - 40, n.x! + n.vx!))
      n.y! = Math.max(40, Math.min(height - 40, n.y! + n.vy!))
    }
  }
  return ns
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TopicPill({ topic, small }: { topic: string; small?: boolean }) {
  const col = topicColor(topic)
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding: small ? '1px 6px' : '2px 8px',
      borderRadius:20,
      fontSize: small ? 10 : 11,
      fontWeight:700,
      background:`${col}22`,
      color:col,
      border:`1px solid ${col}44`,
      whiteSpace:'nowrap',
    }}>{topic}</span>
  )
}

function PaperCard({ item, onDelete }: { item: LibraryItem; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div style={{
      background:C.card,
      border:`1px solid ${C.border}`,
      borderRadius:10,
      padding:'12px 14px',
      transition:'border-color 0.15s',
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.borderS }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border }}
    >
      <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:3}}>
            <span style={{
              fontSize:10,fontWeight:800,letterSpacing:'0.05em',textTransform:'uppercase',
              color:item.sourceType==='arxiv'?C.acc:C.s,
              background:item.sourceType==='arxiv'?C.accD:'transparent',
              padding:item.sourceType==='arxiv'?'1px 6px':'0',
              borderRadius:4,
            }}>{item.attribution}</span>
            {item.year && <span style={{fontSize:10,color:C.m}}>{item.year}</span>}
            <span style={{fontSize:10,color:C.m,marginLeft:'auto'}}>
              {item.chunkCount} chunks · {new Date(item.ingestedAt).toLocaleDateString()}
            </span>
          </div>
          <div style={{fontSize:13.5,fontWeight:700,color:C.p,lineHeight:1.35,marginBottom:4}}>
            {item.arxivId
              ? <a href={`https://arxiv.org/abs/${item.arxivId}`} target="_blank" rel="noreferrer"
                  style={{color:C.p,textDecoration:'none'}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color=C.acc}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color=C.p}}
                >{item.title}</a>
              : item.url
                ? <a href={item.url} target="_blank" rel="noreferrer"
                    style={{color:C.p,textDecoration:'none'}}
                    onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color=C.acc}}
                    onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color=C.p}}
                  >{item.title}</a>
                : item.title
            }
          </div>
          {item.authors.length > 0 && (
            <div style={{fontSize:11.5,color:C.s,marginBottom:5}}>
              {item.authors.slice(0,4).join(', ')}{item.authors.length>4?` +${item.authors.length-4} more`:''}
            </div>
          )}
          <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:6}}>
            {item.topics.map(t => <TopicPill key={t} topic={t} small />)}
          </div>
          {item.abstract && (
            <>
              <div style={{
                fontSize:12,color:C.s,lineHeight:1.55,
                overflow:'hidden',
                maxHeight:expanded?'none':'56px',
              }}>
                {item.abstract}
              </div>
              {item.abstract.length > 200 && (
                <button onClick={() => setExpanded(e=>!e)} style={{
                  background:'none',border:'none',padding:0,cursor:'pointer',
                  fontSize:11,color:C.acc,fontWeight:700,marginTop:2,fontFamily:'inherit',
                }}>{expanded?'Show less':'Show abstract'}</button>
              )}
            </>
          )}
        </div>
        <button onClick={() => onDelete(item.id)} title="Remove from library" style={{
          flexShrink:0,
          background:'none',border:'none',cursor:'pointer',
          color:C.m,fontSize:16,padding:'2px 4px',fontFamily:'inherit',
          lineHeight:1,borderRadius:4,
        }}
        onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color=C.neg}}
        onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color=C.m}}
        >×</button>
      </div>
    </div>
  )
}

// ── Knowledge Graph View ──────────────────────────────────────────────────────

function GraphView({ orgItems }: { orgItems: LibraryItem[] }) {
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [hovered, setHovered] = useState<string|null>(null)
  const [selected, setSelected] = useState<GraphNode|null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 500 })

  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect
      if (r) setDims({ w: r.width, h: Math.max(400, r.height) })
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const fetcher = async () => {
      const res = await fetch(`${BASE}/api/research-library/graph`)
      if (!res.ok) return
      const data = await res.json() as { nodes: GraphNode[]; edges: GraphEdge[] }
      if (!data.nodes?.length) return
      const laid = forceLayout(data.nodes, data.edges, dims.w, dims.h)
      setNodes(laid)
      setEdges(data.edges)
    }
    fetcher()
  }, [orgItems.length, dims.w, dims.h])

  if (nodes.length === 0) {
    return (
      <div style={{
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        height:300,color:C.m,fontSize:13,gap:8,
      }}>
        <span style={{fontSize:32}}>🔬</span>
        <span>Ingest papers to see the knowledge graph</span>
      </div>
    )
  }

  const nodeMap = new Map(nodes.map(n=>[n.id,n]))

  return (
    <div ref={containerRef} style={{width:'100%',position:'relative',minHeight:420}}>
      <svg width={dims.w} height={dims.h} style={{display:'block'}}>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill={C.border} />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((e, i) => {
          const s = nodeMap.get(e.source)
          const t = nodeMap.get(e.target)
          if (!s || !t) return null
          const isHot = hovered === s.id || hovered === t.id
          return (
            <line key={i}
              x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke={isHot ? C.acc : C.border}
              strokeWidth={isHot ? 1.5 : 1}
              strokeOpacity={isHot ? 0.7 : 0.3}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const isTopic = n.kind === 'topic'
          const isHov = hovered === n.id
          const isSel = selected?.id === n.id
          const r = isTopic ? Math.max(16, Math.min(36, 16 + n.weight * 5)) : 8
          const col = isTopic ? topicColor(n.label) : C.s
          return (
            <g key={n.id} style={{cursor:'pointer'}}
              onMouseEnter={() => setHovered(n.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(isSel ? null : n)}
            >
              <circle
                cx={n.x} cy={n.y} r={r + (isHov ? 3 : 0)}
                fill={`${col}${isTopic ? '33' : '22'}`}
                stroke={isSel ? col : isHov ? col : `${col}88`}
                strokeWidth={isSel ? 2.5 : isHov ? 2 : 1.5}
              />
              {isTopic && (
                <text x={n.x} y={(n.y ?? 0) + r + 14}
                  textAnchor="middle"
                  fontSize={10} fontWeight={700}
                  fill={col}
                  style={{pointerEvents:'none',userSelect:'none'}}
                >
                  {n.label.length > 20 ? n.label.slice(0, 18) + '…' : n.label}
                </text>
              )}
              {!isTopic && isHov && (
                <text x={(n.x ?? 0) + 12} y={(n.y ?? 0) - 4}
                  fontSize={10} fill={C.p}
                  style={{pointerEvents:'none',userSelect:'none'}}
                >
                  {n.label.slice(0, 40)}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {/* Selected node info panel */}
      {selected && (
        <div style={{
          position:'absolute',bottom:16,left:16,right:16,maxWidth:360,
          background:C.card,border:`1px solid ${C.borderS}`,
          borderRadius:10,padding:'12px 14px',boxShadow:'0 4px 16px rgba(0,0,0,0.25)',
        }}>
          <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
            <div style={{flex:1}}>
              {selected.kind === 'topic' ? (
                <>
                  <div style={{fontSize:11,fontWeight:800,color:topicColor(selected.label),textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Research Topic</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.p}}>{selected.label}</div>
                  <div style={{fontSize:12,color:C.m,marginTop:3}}>{selected.weight} paper{selected.weight!==1?'s':''}</div>
                </>
              ) : (
                <>
                  <div style={{fontSize:11,fontWeight:800,color:C.m,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Paper</div>
                  <div style={{fontSize:13,fontWeight:700,color:C.p,lineHeight:1.3}}>{selected.label}</div>
                  {selected.authors && selected.authors.length > 0 && (
                    <div style={{fontSize:11,color:C.s,marginTop:3}}>{selected.authors.join(', ')}</div>
                  )}
                  {(selected.arxivId || selected.url) && (
                    <a href={selected.arxivId ? `https://arxiv.org/abs/${selected.arxivId}` : selected.url}
                      target="_blank" rel="noreferrer"
                      style={{fontSize:11,color:C.acc,display:'block',marginTop:4,fontWeight:700}}
                    >Open paper →</a>
                  )}
                </>
              )}
            </div>
            <button onClick={() => setSelected(null)} style={{
              background:'none',border:'none',cursor:'pointer',color:C.m,fontSize:16,padding:'2px 4px',fontFamily:'inherit',
            }}>×</button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{
        position:'absolute',top:8,right:8,
        display:'flex',flexDirection:'column',gap:4,
        background:`${C.card}cc`,backdropFilter:'blur(4px)',
        border:`1px solid ${C.border}`,borderRadius:8,padding:'8px 10px',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10,color:C.m}}>
          <svg width={12} height={12}><circle cx={6} cy={6} r={6} fill={`${C.acc}33`} stroke={`${C.acc}88`} strokeWidth={1.5}/></svg>
          Topic node (size = # papers)
        </div>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:10,color:C.m}}>
          <svg width={10} height={10}><circle cx={5} cy={5} r={4} fill={`${C.s}22`} stroke={`${C.s}88`} strokeWidth={1.5}/></svg>
          Paper
        </div>
      </div>
    </div>
  )
}

// ── DeepResearch Panel ────────────────────────────────────────────────────────

function DeepResearchPanel({ itemCount }: { itemCount: number }) {
  const [question, setQuestion] = useState('')
  const [running, setRunning] = useState(false)
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<Citation[]>([])
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string|null>(null)
  const abortRef = useRef<AbortController|null>(null)
  const answerRef = useRef<HTMLDivElement>(null)

  async function runDeepResearch() {
    if (!question.trim() || running || itemCount === 0) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setRunning(true)
    setAnswer('')
    setCitations([])
    setError(null)
    setStatus('Starting…')

    try {
      const res = await fetch(`${BASE}/api/research-library/deep-research`, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({ question }),
        signal:ctrl.signal,
      })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let ans = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream:true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const ev = JSON.parse(line.slice(6))
            if (ev.event === 'step') setStatus(ev.label || '')
            if (ev.event === 'citation') setCitations(ev.citations || [])
            if (ev.event === 'answer_chunk') {
              ans += ev.text
              setAnswer(ans)
              answerRef.current?.scrollTo(0, answerRef.current.scrollHeight)
            }
            if (ev.event === 'error') setError(ev.message)
            if (ev.event === 'done') setStatus('Complete')
          } catch { /* ignore */ }
        }
      }
    } catch(e: unknown) {
      if ((e as Error)?.name !== 'AbortError') setError(String((e as Error).message || e))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{
      border:`1px solid ${C.border}`,borderRadius:12,
      overflow:'hidden',background:C.card,
    }}>
      <div style={{
        padding:'12px 16px',
        borderBottom:`1px solid ${C.border}`,
        display:'flex',alignItems:'center',gap:10,
      }}>
        <div style={{
          width:28,height:28,borderRadius:8,
          background:'linear-gradient(135deg,#6366f1,#8b5cf6)',
          display:'flex',alignItems:'center',justifyContent:'center',
          flexShrink:0,fontSize:14,
        }}>⚡</div>
        <div>
          <div style={{fontSize:13,fontWeight:800,color:C.p}}>DeepResearch</div>
          <div style={{fontSize:11,color:C.m}}>Multi-hop synthesis across your Research Library</div>
        </div>
      </div>

      <div style={{padding:'14px 16px'}}>
        {itemCount === 0 ? (
          <div style={{fontSize:13,color:C.m,textAlign:'center',padding:'8px 0'}}>
            Ingest papers first to enable DeepResearch
          </div>
        ) : (
          <>
            <div style={{display:'flex',gap:8,marginBottom:10}}>
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); runDeepResearch() }}}
                placeholder={`Ask a question across your ${itemCount} paper${itemCount!==1?'s':''}…`}
                disabled={running}
                style={{
                  flex:1,padding:'8px 12px',
                  background:C.cardA,border:`1px solid ${C.border}`,
                  borderRadius:8,fontSize:13,color:C.p,fontFamily:'inherit',
                  outline:'none',
                }}
              />
              <button
                onClick={running ? () => abortRef.current?.abort() : runDeepResearch}
                disabled={!question.trim() && !running}
                style={{
                  padding:'8px 16px',borderRadius:8,border:'none',cursor:'pointer',
                  background:running?C.neg:C.acc,color:'#fff',
                  fontSize:12,fontWeight:800,fontFamily:'inherit',
                  opacity:(!question.trim() && !running)?0.5:1,
                  whiteSpace:'nowrap',
                }}
              >{running ? 'Stop' : 'Synthesise'}</button>
            </div>

            {/* Suggested questions */}
            {!answer && !running && (
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                {[
                  'What are the main factor premia identified in recent research?',
                  'How does machine learning improve portfolio optimization?',
                  'What do papers say about volatility forecasting methods?',
                  'Summarise the evidence on momentum and mean-reversion',
                ].map(q => (
                  <button key={q} onClick={() => setQuestion(q)} style={{
                    padding:'4px 10px',borderRadius:20,
                    background:C.cardA,border:`1px solid ${C.border}`,
                    color:C.s,fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit',
                  }}>{q}</button>
                ))}
              </div>
            )}

            {status && running && (
              <div style={{
                fontSize:11.5,color:C.m,marginBottom:8,
                display:'flex',alignItems:'center',gap:6,
              }}>
                <span style={{
                  display:'inline-block',width:10,height:10,borderRadius:'50%',
                  border:`2px solid ${C.acc}`,borderTopColor:'transparent',
                  animation:'spin 0.8s linear infinite',flexShrink:0,
                }}/>
                {status}
              </div>
            )}

            {error && (
              <div style={{
                fontSize:12,color:C.neg,padding:'8px 12px',
                background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',
                borderRadius:8,marginBottom:8,
              }}>{error}</div>
            )}

            {citations.length > 0 && (
              <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:8}}>
                {citations.map(c => (
                  <span key={c.index} title={c.snippet} style={{
                    padding:'2px 8px',borderRadius:20,
                    background:C.accD,color:C.accT,
                    fontSize:11,fontWeight:700,cursor:'default',
                  }}>[{c.index}] {c.sourceName.slice(0,30)}{c.sourceName.length>30?'…':''}</span>
                ))}
              </div>
            )}

            {answer && (
              <div ref={answerRef} style={{
                maxHeight:420,overflowY:'auto',
                padding:'12px 14px',
                background:C.cardA,
                border:`1px solid ${C.border}`,
                borderRadius:8,
                fontSize:13,lineHeight:1.7,color:C.p,
                fontFamily:'inherit',whiteSpace:'pre-wrap',wordBreak:'break-word',
              }}>
                {answer}
                {running && <span style={{
                  display:'inline-block',width:2,height:14,
                  background:C.acc,marginLeft:2,
                  animation:'blink 0.9s step-end infinite',verticalAlign:'middle',
                }}/>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ResearchLibraryPage() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'library'|'graph'>('library')

  // Ingest form
  const [mode, setMode] = useState<'arxiv_id'|'arxiv_search'|'url'>('arxiv_id')
  const [input, setInput] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [ingestError, setIngestError] = useState<string|null>(null)
  const [ingestSuccess, setIngestSuccess] = useState<string|null>(null)

  // Filters
  const [filterTopic, setFilterTopic] = useState('')
  const [filterQ, setFilterQ] = useState('')

  // Topic list from current items
  const allTopics = Array.from(new Set(items.flatMap(i => i.topics))).sort()

  const loadItems = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterTopic) params.set('topic', filterTopic)
      if (filterQ) params.set('q', filterQ)
      const res = await fetch(`${BASE}/api/research-library?${params}`)
      if (res.ok) {
        const data = await res.json() as { items: LibraryItem[]; total: number }
        setItems(data.items || [])
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [filterTopic, filterQ])

  useEffect(() => { loadItems() }, [loadItems])

  async function handleIngest() {
    if (!input.trim() || ingesting) return
    setIngesting(true)
    setIngestError(null)
    setIngestSuccess(null)
    try {
      const res = await fetch(`${BASE}/api/research-library/ingest`, {
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({ mode, input: input.trim() }),
      })
      const data = await res.json() as { ok?: boolean; item?: LibraryItem; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setInput('')
      setIngestSuccess(`Ingested: "${data.item?.title?.slice(0,80) ?? 'paper'}"`)
      setTimeout(() => setIngestSuccess(null), 4000)
      await loadItems()
    } catch(e: unknown) {
      setIngestError(String((e as Error).message || e))
    } finally {
      setIngesting(false)
    }
  }

  async function handleDelete(itemId: string) {
    setItems(prev => prev.filter(i => i.id !== itemId))
    await fetch(`${BASE}/api/research-library`, {
      method:'DELETE',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({ itemId }),
    })
    await loadItems()
  }

  const filteredItems = items

  const totalPapers = items.length
  const totalTopics = allTopics.length

  return (
    <div style={{
      minHeight:'100vh',background:C.bg,padding:'24px 28px 40px',
      fontFamily:'var(--font-sans, system-ui, sans-serif)',
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 50% { opacity:0; } }
      `}</style>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
          <div style={{
            width:36,height:36,borderRadius:10,
            background:'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
            display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:18,flexShrink:0,
          }}>📚</div>
          <div>
            <h1 style={{margin:0,fontSize:20,fontWeight:800,color:C.p,letterSpacing:'-0.02em'}}>
              Research Library
            </h1>
            <p style={{margin:0,fontSize:12,color:C.m}}>
              Quant-research knowledge base · arXiv papers, finance research, reports
            </p>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{display:'flex',gap:16,marginTop:12,flexWrap:'wrap'}}>
          {[
            { label:'Papers', value: totalPapers },
            { label:'Topics', value: totalTopics },
          ].map(s => (
            <div key={s.label} style={{
              display:'flex',alignItems:'center',gap:6,
              padding:'4px 12px',
              background:C.card,border:`1px solid ${C.border}`,borderRadius:20,
              fontSize:12,
            }}>
              <span style={{fontWeight:800,color:C.p}}>{s.value}</span>
              <span style={{color:C.m}}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'320px 1fr',gap:20,alignItems:'start'}}>

        {/* Left panel — Ingest + Topic filters */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Ingest card */}
          <div style={{
            background:C.card,border:`1px solid ${C.border}`,
            borderRadius:12,padding:'16px',
          }}>
            <div style={{fontSize:12,fontWeight:800,color:C.p,marginBottom:12,letterSpacing:'0.01em'}}>
              Add Research
            </div>

            {/* Mode selector */}
            <div style={{display:'flex',gap:4,marginBottom:12,background:C.cardA,borderRadius:8,padding:3}}>
              {([
                { value:'arxiv_id',     label:'arXiv ID' },
                { value:'arxiv_search', label:'arXiv Search' },
                { value:'url',          label:'URL' },
              ] as const).map(m => (
                <button key={m.value} onClick={() => { setMode(m.value); setInput(''); setIngestError(null) }} style={{
                  flex:1,padding:'5px 4px',borderRadius:6,border:'none',cursor:'pointer',
                  background:mode===m.value?C.card:'transparent',
                  color:mode===m.value?C.p:C.m,
                  fontSize:11,fontWeight:700,fontFamily:'inherit',
                  boxShadow:mode===m.value?'0 1px 3px rgba(0,0,0,0.15)':'none',
                  transition:'all 0.1s',
                }}>{m.label}</button>
              ))}
            </div>

            <div style={{fontSize:11,color:C.m,marginBottom:6}}>
              {mode==='arxiv_id' && 'Enter an arXiv ID, e.g. 2501.12345 or 2403.09893v2'}
              {mode==='arxiv_search' && 'Search arXiv by keywords, e.g. "momentum factor machine learning"'}
              {mode==='url' && 'Paste a URL to a finance paper, blog, or report'}
            </div>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter') handleIngest() }}
              placeholder={
                mode==='arxiv_id' ? '2501.12345' :
                mode==='arxiv_search' ? 'momentum factor machine learning…' :
                'https://…'
              }
              disabled={ingesting}
              style={{
                width:'100%',padding:'8px 10px',boxSizing:'border-box',
                background:C.cardA,border:`1px solid ${C.border}`,
                borderRadius:8,fontSize:13,color:C.p,fontFamily:'inherit',
                outline:'none',marginBottom:8,
              }}
            />

            <button
              onClick={handleIngest}
              disabled={ingesting || !input.trim()}
              style={{
                width:'100%',padding:'8px',borderRadius:8,border:'none',cursor:'pointer',
                background:C.acc,color:'#fff',
                fontSize:12,fontWeight:800,fontFamily:'inherit',
                opacity:(ingesting||!input.trim())?0.5:1,
                display:'flex',alignItems:'center',justifyContent:'center',gap:6,
              }}
            >
              {ingesting && <span style={{
                display:'inline-block',width:10,height:10,borderRadius:'50%',
                border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',
                animation:'spin 0.8s linear infinite',
              }}/>}
              {ingesting ? 'Ingesting…' : 'Ingest'}
            </button>

            {ingestError && (
              <div style={{
                marginTop:8,padding:'6px 10px',borderRadius:6,
                background:'rgba(248,113,113,0.08)',border:'1px solid rgba(248,113,113,0.2)',
                fontSize:11.5,color:C.neg,
              }}>{ingestError}</div>
            )}
            {ingestSuccess && (
              <div style={{
                marginTop:8,padding:'6px 10px',borderRadius:6,
                background:'rgba(52,211,153,0.08)',border:'1px solid rgba(52,211,153,0.2)',
                fontSize:11.5,color:C.pos,
              }}>{ingestSuccess}</div>
            )}
          </div>

          {/* Topic filter */}
          {allTopics.length > 0 && (
            <div style={{
              background:C.card,border:`1px solid ${C.border}`,
              borderRadius:12,padding:'12px 14px',
            }}>
              <div style={{fontSize:11,fontWeight:800,color:C.m,marginBottom:10,letterSpacing:'0.05em',textTransform:'uppercase'}}>
                Filter by Topic
              </div>
              <button
                onClick={() => setFilterTopic('')}
                style={{
                  width:'100%',textAlign:'left',padding:'5px 8px',marginBottom:4,
                  borderRadius:6,border:'none',cursor:'pointer',fontFamily:'inherit',
                  background:!filterTopic?C.accD:'transparent',
                  color:!filterTopic?C.accT:C.m,
                  fontSize:11,fontWeight:700,
                }}
              >All topics ({totalPapers})</button>
              {allTopics.map(t => {
                const count = items.filter(i => i.topics.includes(t)).length
                return (
                  <button key={t} onClick={() => setFilterTopic(t === filterTopic ? '' : t)} style={{
                    width:'100%',textAlign:'left',padding:'4px 8px',
                    borderRadius:6,border:'none',cursor:'pointer',fontFamily:'inherit',
                    background:filterTopic===t?`${topicColor(t)}22`:'transparent',
                    display:'flex',alignItems:'center',justifyContent:'space-between',
                  }}>
                    <span style={{fontSize:11,fontWeight:600,color:filterTopic===t?topicColor(t):C.s}}>{t}</span>
                    <span style={{fontSize:10,color:C.m,background:C.cardA,padding:'1px 6px',borderRadius:10}}>{count}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div style={{display:'flex',flexDirection:'column',gap:16}}>

          {/* Tab bar */}
          <div style={{display:'flex',gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:0}}>
            {([
              { id:'library', label:`Library (${totalPapers})` },
              { id:'graph',   label:'Knowledge Graph' },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding:'8px 18px',border:'none',cursor:'pointer',fontFamily:'inherit',
                background:'transparent',
                borderBottom:`2px solid ${tab===t.id?C.acc:'transparent'}`,
                color:tab===t.id?C.acc:C.m,
                fontSize:12,fontWeight:700,
                transition:'all 0.15s',
              }}>{t.label}</button>
            ))}
          </div>

          {tab === 'library' && (
            <>
              {/* Search within library */}
              {items.length > 0 && (
                <input
                  value={filterQ}
                  onChange={e => setFilterQ(e.target.value)}
                  placeholder="Search titles, abstracts, authors…"
                  style={{
                    width:'100%',padding:'8px 12px',boxSizing:'border-box',
                    background:C.card,border:`1px solid ${C.border}`,
                    borderRadius:8,fontSize:12.5,color:C.p,fontFamily:'inherit',
                    outline:'none',
                  }}
                />
              )}

              {loading ? (
                <div style={{display:'flex',justifyContent:'center',padding:'40px',color:C.m,fontSize:13}}>
                  Loading library…
                </div>
              ) : filteredItems.length === 0 ? (
                <div style={{
                  display:'flex',flexDirection:'column',alignItems:'center',
                  justifyContent:'center',padding:'48px 24px',
                  background:C.card,border:`1px solid ${C.border}`,borderRadius:12,
                  color:C.m,gap:10,
                }}>
                  <span style={{fontSize:36}}>📄</span>
                  <div style={{fontSize:14,fontWeight:700,color:C.s,textAlign:'center'}}>
                    {filterTopic || filterQ ? 'No papers match your filters' : 'Your library is empty'}
                  </div>
                  <div style={{fontSize:12,color:C.m,textAlign:'center',maxWidth:300}}>
                    {filterTopic || filterQ
                      ? 'Try a different topic filter or search term'
                      : 'Add arXiv papers or research URLs using the panel on the left'}
                  </div>
                </div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {filteredItems.map(item => (
                    <PaperCard key={item.id} item={item} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'graph' && (
            <div style={{
              background:C.card,border:`1px solid ${C.border}`,
              borderRadius:12,overflow:'hidden',
              minHeight:460,
            }}>
              <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
                <span style={{fontSize:13,fontWeight:700,color:C.p}}>Research Topic Graph</span>
                <span style={{fontSize:11,color:C.m,marginLeft:8}}>
                  Topics as nodes · papers connected to their tags
                </span>
              </div>
              <GraphView orgItems={items} />
            </div>
          )}

          {/* DeepResearch panel — always visible below */}
          <DeepResearchPanel itemCount={totalPapers} />
        </div>
      </div>
    </div>
  )
}
