"use client"

import { useState, useEffect, useCallback, useRef } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────
interface CIQItem {
  mne: string
  name: string
  ds: string
  sg: string
  gdsp: string
  ff: string
  def?: string
}

interface FormulaItem {
  finsyt_key: string
  display: string
  category: string
  ciq_mnemonic: string
  ciq_excel: string
  eodhd_key: string
  unit: string
  format: string
  description?: string
}

// ── GDSP parameter descriptions ───────────────────────────────────────────────
const GDSP_PARAMS: Record<string, string> = {
  PERIODTYPE: "FY = Annual, Q1/Q2/Q3/Q4 = Quarterly, NTM = Next Twelve Months, LTM = Last Twelve Months",
  ASOFDATE: "Date in MM/DD/YYYY format or 0 for most recent",
  CURRENCYID: "USD, EUR, GBP, JPY, etc.",
  RESTATEMENTTYPEID: "0 = As Reported, 1 = Restated",
  FILINGMODE: "0 = Filed, 1 = Estimated",
  CONSOLIDATEDFLAG: "0 = Consolidated (default), 1 = Unconsolidated",
  CURRENCYCONVERSIONMODEID: "0 = Historical Rate, 1 = End of Period",
  STARTDATE: "Start date MM/DD/YYYY",
  FREQUENCY: "A = Annual, Q = Quarterly, M = Monthly",
}

const PERIOD_TYPES = [
  { label: "Annual (FY)", value: "A", desc: "Full fiscal year" },
  { label: "Quarterly (Q1)", value: "Q1", desc: "First fiscal quarter" },
  { label: "Quarterly (Q2)", value: "Q2", desc: "Second fiscal quarter" },
  { label: "Last Twelve Months", value: "LTM", desc: "Rolling LTM period" },
  { label: "Next Twelve Months", value: "NTM", desc: "Forward NTM estimate" },
]

// ── CIQ Formula Builder ───────────────────────────────────────────────────────
function FormulaBuilder({ item, onClose }: { item: CIQItem; onClose: () => void }) {
  const [ticker, setTicker] = useState("AAPL")
  const [period, setPeriod] = useState("A")
  const [offset, setOffset] = useState("0")
  const [currency, setCurrency] = useState("USD")
  const [copied, setCopied] = useState(false)

  const gdspParams = (item.gdsp || "").split(",").map(p => p.trim()).filter(Boolean)
  const needsPeriod = gdspParams.includes("PERIODTYPE")
  const needsCurrency = gdspParams.includes("CURRENCYID")
  const needsDate = gdspParams.includes("ASOFDATE")
  const noParams = item.gdsp === "NO PROPERTIES REQUIRED"

  // Build the actual Excel formula
  const buildFormula = () => {
    const tickerRef = ticker || "B1"  // Cell reference or hardcoded
    if (noParams) {
      return `=CIQ("${item.mne}", "${tickerRef}")`
    }
    const params: string[] = []
    if (needsPeriod) params.push(`"${period}"`)
    if (needsDate) params.push(offset === "0" ? "0" : `"${offset}"`)
    if (needsCurrency) params.push(`"${currency}"`)
    return `=CIQ("${item.mne}", "${tickerRef}", ${params.join(", ")})`
  }

  // Build Finsyt API equivalent
  const buildFinsytCall = () => {
    const periodMap: Record<string, string> = { A: "annual", Q1: "quarterly", Q2: "quarterly", LTM: "ltm", NTM: "ntm" }
    return `GET /api/financials?symbol=${ticker}&period=${periodMap[period] || "annual"}&metric=${item.mne.toLowerCase()}`
  }

  const formula = buildFormula()

  const copyFormula = () => {
    navigator.clipboard.writeText(formula)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#0d1526] border border-blue-500/20 rounded-2xl w-full max-w-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-blue-500/10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-blue-500/15 rounded text-blue-300 text-xs font-mono">{item.mne}</span>
              <span className="px-2 py-0.5 bg-[#0f1629] rounded text-white/40 text-xs">{item.ds}</span>
            </div>
            <h2 className="text-white font-semibold text-lg">{item.name}</h2>
            {item.def && <p className="text-white/40 text-sm mt-0.5">{item.def}</p>}
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Parameters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/50 text-xs mb-1.5 block">Ticker / Cell Ref</label>
              <input value={ticker} onChange={e => setTicker(e.target.value)}
                placeholder="AAPL or B1"
                className="w-full bg-[#0a0f1e] border border-blue-500/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50" />
            </div>
            {needsPeriod && (
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Period Type</label>
                <select value={period} onChange={e => setPeriod(e.target.value)}
                  className="w-full bg-[#0a0f1e] border border-blue-500/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50">
                  {PERIOD_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            )}
            {needsDate && (
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Offset (0 = most recent)</label>
                <input value={offset} onChange={e => setOffset(e.target.value)}
                  placeholder="0, -1, -2..."
                  className="w-full bg-[#0a0f1e] border border-blue-500/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50" />
              </div>
            )}
            {needsCurrency && (
              <div>
                <label className="text-white/50 text-xs mb-1.5 block">Currency</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-[#0a0f1e] border border-blue-500/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50">
                  {["USD","EUR","GBP","JPY","CAD","AUD","CHF","HKD","SGD","BRL"].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Generated Formula */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/50 text-xs">Capital IQ Excel Formula</span>
              <button onClick={copyFormula} className={`text-xs px-3 py-1 rounded-lg transition-all ${copied ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/15 text-blue-300 hover:bg-blue-500/25"}`}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <div className="bg-[#0a0f1e] border border-blue-500/15 rounded-xl px-4 py-3">
              <code className="text-blue-300 text-sm font-mono break-all">{formula}</code>
            </div>
          </div>

          {/* Finsyt API equivalent */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white/50 text-xs">Finsyt API Equivalent</span>
              <span className="text-xs px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400">Proprietary</span>
            </div>
            <div className="bg-[#0a0f1e] border border-emerald-500/15 rounded-xl px-4 py-3">
              <code className="text-emerald-300 text-sm font-mono break-all">{buildFinsytCall()}</code>
            </div>
          </div>

          {/* Parameters reference */}
          {gdspParams.length > 0 && !noParams && (
            <div>
              <p className="text-white/50 text-xs mb-2">GDSP Parameters</p>
              <div className="space-y-1.5">
                {gdspParams.map(param => GDSP_PARAMS[param] && (
                  <div key={param} className="flex gap-3 text-xs">
                    <span className="text-blue-300/70 font-mono w-36 flex-shrink-0">{param}</span>
                    <span className="text-white/40">{GDSP_PARAMS[param]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Identifiers */}
          <div className="flex items-start gap-2 p-3 bg-[#0a0f1e] rounded-xl border border-white/5">
            <span className="text-white/30 text-xs">Supported IDs:</span>
            <span className="text-white/50 text-xs">{item.ff}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const DATASETS = ["All", "CIQ Financials", "CIQ Estimates", "Credit Analytics", "Market, Commodity & Macro Data", "Premium Company Data", "Pricing", "Compustat Financial Statements"]
const BUCKETS: Record<string, string> = {
  "All": "",
  "CIQ Financials": "financials",
  "Compustat Financial Statements": "financials",
  "CIQ Estimates": "estimates",
  "Credit Analytics": "credit",
  "Market, Commodity & Macro Data": "market_macro",
  "Pricing": "market_macro",
  "Premium Company Data": "other",
}

export default function FormulasPage() {
  const [items, setItems] = useState<CIQItem[]>([])
  const [filtered, setFiltered] = useState<CIQItem[]>([])
  const [search, setSearch] = useState("")
  const [selectedDS, setSelectedDS] = useState("All")
  const [selected, setSelected] = useState<CIQItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadedBuckets, setLoadedBuckets] = useState<Set<string>>(new Set())
  const [formulaLib, setFormulaLib] = useState<Record<string, FormulaItem>>({})
  const [activeTab, setActiveTab] = useState<"dictionary" | "library">("dictionary")
  const [buildTicker, setBuildTicker] = useState("AAPL")
  const [buildMetrics, setBuildMetrics] = useState<string[]>(["revenue", "ebitda", "net_income", "free_cash_flow"])

  const searchRef = useRef<HTMLInputElement>(null)

  // Load formula library
  useEffect(() => {
    fetch("/data/formula_library.json").then(r => r.json()).then(setFormulaLib).catch(() => {})
  }, [])

  // Load initial data (top 500)
  useEffect(() => {
    setLoading(true)
    fetch("/data/ciq_top500.json")
      .then(r => r.json())
      .then((data: CIQItem[]) => { setItems(data); setFiltered(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  // Load full bucket when needed
  const loadBucket = useCallback(async (ds: string) => {
    const bucket = BUCKETS[ds]
    if (!bucket || loadedBuckets.has(bucket)) return
    setLoadedBuckets(prev => new Set([...prev, bucket]))
    try {
      const res = await fetch(`/data/ciq_${bucket}.json`)
      const data: CIQItem[] = await res.json()
      setItems(prev => {
        const existing = new Set(prev.map(i => i.mne))
        const newItems = data.filter(i => !existing.has(i.mne))
        return [...prev, ...newItems]
      })
    } catch {}
  }, [loadedBuckets])

  // Filter logic
  useEffect(() => {
    let src = items
    if (selectedDS !== "All") src = src.filter(i => i.ds === selectedDS || i.sg.includes(selectedDS))
    if (search.length > 1) {
      const q = search.toLowerCase()
      src = src.filter(i =>
        i.mne.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.def || "").toLowerCase().includes(q) ||
        i.sg.toLowerCase().includes(q)
      )
    }
    setFiltered(src.slice(0, 200))
  }, [items, search, selectedDS])

  const handleDSChange = (ds: string) => {
    setSelectedDS(ds)
    loadBucket(ds)
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    if (val.length > 1 && selectedDS === "All") {
      // Load all buckets for full search
      Object.values(BUCKETS).filter(Boolean).forEach(b => {
        if (!loadedBuckets.has(b)) loadBucket(Object.keys(BUCKETS).find(k => BUCKETS[k] === b)!)
      })
    }
  }

  // Build Excel model from selected metrics
  const buildExcelModel = () => {
    const header = `Capital IQ Formula Model — Generated by Finsyt\n` +
      `Ticker in cell B1\n\n` +
      `Metric\tFormula (FY0)\tFormula (FY-1)\tFormula (FY-2)\n`
    const rows = buildMetrics.map(key => {
      const m = formulaLib[key]
      if (!m) return ""
      const base = `=CIQ("${m.ciq_mnemonic}", $B$1`
      return `${m.display}\t${base}, "A", 0, "USD")\t${base}, "A", -1, "USD")\t${base}, "A", -2, "USD")`
    }).filter(Boolean).join("\n")
    return header + rows
  }

  const downloadModel = () => {
    const content = buildExcelModel()
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `finsyt_ciq_model_${buildTicker}.txt`
    a.click()
  }

  const CATEGORY_METRICS = Object.entries(formulaLib).reduce((acc, [key, val]) => {
    if (!acc[val.category]) acc[val.category] = []
    acc[val.category].push({ key, ...val })
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="flex flex-col h-screen bg-[#080d1a] text-white overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-blue-500/10 flex items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-white font-semibold text-base">Formula Engine</h1>
          <p className="text-white/30 text-xs">16,537 Capital IQ mnemonics · Finsyt proprietary API · Excel formula builder</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setActiveTab("dictionary")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === "dictionary" ? "bg-blue-500/20 text-blue-300" : "text-white/30 hover:text-white/60"}`}>
            📖 Dictionary
          </button>
          <button onClick={() => setActiveTab("library")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === "library" ? "bg-blue-500/20 text-blue-300" : "text-white/30 hover:text-white/60"}`}>
            🔧 Formula Builder
          </button>
        </div>
      </div>

      {activeTab === "dictionary" ? (
        <div className="flex flex-1 min-h-0">
          {/* Left: filters */}
          <div className="w-48 flex-shrink-0 border-r border-blue-500/10 overflow-y-auto py-3 px-2">
            <p className="text-white/30 text-xs px-2 mb-2 uppercase tracking-wider">Data Set</p>
            {DATASETS.map(ds => (
              <button key={ds} onClick={() => handleDSChange(ds)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all mb-0.5 ${selectedDS === ds ? "bg-blue-500/20 text-blue-300" : "text-white/40 hover:text-white/70 hover:bg-blue-500/5"}`}>
                {ds}
              </button>
            ))}
          </div>

          {/* Main: search + results */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search bar */}
            <div className="px-4 py-3 border-b border-blue-500/10">
              <div className="relative">
                <input
                  ref={searchRef}
                  value={search}
                  onChange={e => handleSearch(e.target.value)}
                  placeholder="Search mnemonics, names, definitions... (e.g. IQ_EBITDA, revenue, EPS)"
                  className="w-full bg-[#0f1629] border border-blue-500/15 hover:border-blue-500/30 focus:border-blue-500/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors"
                />
                <svg className="absolute left-3 top-3 w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {search && <button onClick={() => setSearch("")} className="absolute right-3 top-3 text-white/20 hover:text-white/50 text-sm">✕</button>}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-white/25 text-xs">{filtered.length.toLocaleString()} results</span>
                {search.length > 1 && filtered.length === 200 && <span className="text-white/20 text-xs">(showing first 200)</span>}
                <span className="text-white/20 text-xs ml-auto">Click any row to build the Excel formula →</span>
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="text-white/30 text-sm animate-pulse">Loading dictionary...</div>
                </div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[#080d1a] border-b border-blue-500/10">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-white/30 font-medium w-48">Mnemonic</th>
                      <th className="text-left px-4 py-2.5 text-white/30 font-medium">Name</th>
                      <th className="text-left px-4 py-2.5 text-white/30 font-medium w-48">Data Set</th>
                      <th className="text-left px-4 py-2.5 text-white/30 font-medium w-24">Params</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item, i) => (
                      <tr key={item.mne + i}
                        className="border-b border-blue-500/5 hover:bg-blue-500/5 cursor-pointer transition-colors group"
                        onClick={() => setSelected(item)}>
                        <td className="px-4 py-2.5">
                          <code className="text-blue-300/80 group-hover:text-blue-300 font-mono text-xs">{item.mne}</code>
                        </td>
                        <td className="px-4 py-2.5 text-white/70 group-hover:text-white/90">{item.name}</td>
                        <td className="px-4 py-2.5 text-white/30">{item.ds}</td>
                        <td className="px-4 py-2.5">
                          {item.gdsp && item.gdsp !== "NO PROPERTIES REQUIRED"
                            ? <span className="text-yellow-400/50 text-xs">GDSP</span>
                            : <span className="text-emerald-400/40 text-xs">simple</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Formula Builder tab ── */
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Ticker input */}
            <div className="bg-[#0f1629] border border-blue-500/10 rounded-2xl p-5">
              <h3 className="text-white/80 font-medium mb-3">Build Excel Model</h3>
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-white/40 text-xs block mb-1.5">Ticker</label>
                  <input value={buildTicker} onChange={e => setBuildTicker(e.target.value.toUpperCase())}
                    className="bg-[#0a0f1e] border border-blue-500/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500/50 w-32" />
                </div>
                <div className="flex-1">
                  <label className="text-white/40 text-xs block mb-1.5">Selected Metrics ({buildMetrics.length})</label>
                  <div className="flex flex-wrap gap-1.5">
                    {buildMetrics.map(key => (
                      <span key={key} className="flex items-center gap-1 px-2.5 py-1 bg-blue-500/15 border border-blue-500/20 rounded-lg text-blue-300 text-xs">
                        {formulaLib[key]?.display || key}
                        <button onClick={() => setBuildMetrics(p => p.filter(k => k !== key))} className="text-blue-300/50 hover:text-red-400">✕</button>
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={downloadModel} className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/25 rounded-xl text-emerald-300 text-sm font-medium transition-all flex-shrink-0">
                  ↓ Download Model
                </button>
              </div>
            </div>

            {/* Metric picker by category */}
            {Object.entries(CATEGORY_METRICS).map(([cat, metrics]) => (
              <div key={cat} className="bg-[#0f1629] border border-blue-500/10 rounded-2xl p-5">
                <h3 className="text-white/60 font-medium text-xs uppercase tracking-widest mb-3 capitalize">{cat.replace(/_/g, " ")}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {metrics.map((m: any) => {
                    const selected = buildMetrics.includes(m.key)
                    return (
                      <button key={m.key}
                        onClick={() => setBuildMetrics(p => selected ? p.filter(k => k !== m.key) : [...p, m.key])}
                        className={`text-left px-3 py-2.5 rounded-xl border transition-all text-xs ${selected ? "bg-blue-500/20 border-blue-500/40 text-blue-200" : "bg-[#0a0f1e] border-blue-500/10 text-white/50 hover:border-blue-500/30 hover:text-white/70"}`}>
                        <div className="font-medium mb-0.5">{m.display}</div>
                        <div className="font-mono text-white/30 text-xs">{m.ciq_mnemonic}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Live preview */}
            {buildMetrics.length > 0 && (
              <div className="bg-[#0f1629] border border-blue-500/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white/80 font-medium">Excel Formula Preview</h3>
                  <button onClick={() => navigator.clipboard.writeText(buildExcelModel())} className="text-xs text-blue-400/60 hover:text-blue-400">Copy all</button>
                </div>
                <div className="bg-[#0a0f1e] rounded-xl p-4 overflow-x-auto">
                  <table className="text-xs font-mono w-full">
                    <thead>
                      <tr className="text-white/30 border-b border-white/5">
                        <th className="text-left py-1.5 pr-6">Metric</th>
                        <th className="text-left py-1.5 pr-6">FY0 (Current)</th>
                        <th className="text-left py-1.5 pr-6">FY-1</th>
                        <th className="text-left py-1.5">FY-2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildMetrics.map(key => {
                        const m = formulaLib[key]
                        if (!m) return null
                        const base = `=CIQ("${m.ciq_mnemonic}", "${buildTicker || "$B$1"}"`
                        return (
                          <tr key={key} className="border-b border-white/5">
                            <td className="py-1.5 pr-6 text-white/60">{m.display}</td>
                            <td className="py-1.5 pr-6 text-blue-300/80">{base}, "A", 0, "USD")</td>
                            <td className="py-1.5 pr-6 text-blue-300/60">{base}, "A", -1, "USD")</td>
                            <td className="py-1.5 text-blue-300/40">{base}, "A", -2, "USD")</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formula Builder Modal */}
      {selected && <FormulaBuilder item={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
