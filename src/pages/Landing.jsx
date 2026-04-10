import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'

const FEATURES = [
  { icon: '⚡', title: 'Real-time signal monitoring', desc: 'Track macro and company signals the moment they move. No more checking 5 dashboards.' },
  { icon: '🤖', title: 'AI that actually reads the data', desc: "Not summaries of summaries. Finsyt's AI goes source-deep and surfaces what matters to you." },
  { icon: '🌍', title: '190+ countries, 50+ sources', desc: 'World Bank Data360, IMF, BIS, and more — unified in one place, updated continuously.' },
  { icon: '📊', title: 'Data Explorer', desc: 'Slice any indicator by country, region, or time horizon. Interactive charts, instant export.' },
  { icon: '🔔', title: 'Smart alerts', desc: 'Set thresholds on any signal. Get notified via email, Slack, or mobile — your workflow, your rules.' },
  { icon: '⚙️', title: 'Built for operators, not analysts', desc: "AlphaSense is $20k/yr for Wall Street desks. Finsyt starts at $49/mo for people who run things." },
]

const TESTIMONIALS = [
  { name: 'Sarah K.', role: 'CFO, Series B SaaS', quote: 'Finsyt replaced three separate tools. Our weekly macro review went from 2 hours to 15 minutes.' },
  { name: 'Marcus T.', role: 'Investment Analyst, VC', quote: "The AI summaries are actually useful. It surfaces signals I care about — not noise from a hundred sources." },
  { name: 'Priya M.', role: 'Founder & CEO', quote: "I finally have the same information advantage as my investors. And I'm not paying $20k/yr for it." },
]

const STATS = [
  { value: '50+', label: 'Data sources' },
  { value: '190+', label: 'Countries covered' },
  { value: '2.4M+', label: 'Daily signals' },
  { value: '$49', label: 'Starting price/mo' },
]

const CHART_BARS = [38,42,39,51,48,62,58,70,65,78,74,88,84,92,89,96,91,100]

export default function Landing() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (email) setSubmitted(true)
  }

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100">
      <Navbar />

      {/* HERO */}
      <section className="relative pt-32 pb-20 px-6 overflow-hidden">
        {/* Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-radial from-blue-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-teal-600/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-navy-800 border border-border rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)]" />
            <span className="text-xs text-muted font-medium">Now in private beta — join the waitlist</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-[-0.03em] mb-6">
            The intelligence edge.<br />
            <span className="gradient-text">Without the Wall Street price tag.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted leading-relaxed mb-10 max-w-2xl mx-auto">
            Finsyt is the AI-powered financial intelligence workspace for founders, operators, and analysts. Real-time signals, AI insights, and workflow tools — from data to decision in minutes, not hours.
          </p>

          {/* CTA */}
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-4">
              <input
                type="email"
                placeholder="Enter your work email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input w-full sm:w-80"
                required
              />
              <button type="submit" className="btn-primary w-full sm:w-auto whitespace-nowrap">
                Join the waitlist →
              </button>
            </form>
          ) : (
            <div className="inline-flex items-center gap-3 bg-navy-800 border border-teal-600/40 rounded-xl px-6 py-3 mb-4">
              <span className="text-teal-400 font-semibold">✓ You're on the list! We'll be in touch soon.</span>
            </div>
          )}
          <p className="text-xs text-gray-600">No credit card required · Cancel anytime · 14-day free trial on Pro</p>
        </div>

        {/* Hero dashboard mockup */}
        <div className="max-w-5xl mx-auto mt-16 px-0 sm:px-4">
          <div className="bg-navy-900 border border-border rounded-2xl p-5 shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
            {/* Window chrome */}
            <div className="flex gap-1.5 mb-5">
              {['#ef4444','#f59e0b','#22c55e'].map((c,i) => <div key={i} className="w-3 h-3 rounded-full" style={{background:c}} />)}
            </div>
            {/* Metric row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                {label:'Portfolio Value',value:'$2.41M',change:'+3.2% today',up:true},
                {label:'Active Signals',value:'47',change:'+12 new',up:true},
                {label:'AI Insights',value:'18 new',change:'Updated 2m ago',up:null},
                {label:'Alerts',value:'3 active',change:'2 high priority',up:false},
              ].map((m,i) => (
                <div key={i} className="bg-navy-800 rounded-xl p-3 border border-border">
                  <div className="text-[10px] text-muted uppercase tracking-widest mb-2">{m.label}</div>
                  <div className="text-xl font-black tracking-tight mb-1">{m.value}</div>
                  <div className={`text-xs ${m.up===true?'text-green-400':m.up===false?'text-red-400':'text-muted'}`}>{m.change}</div>
                </div>
              ))}
            </div>
            {/* Chart */}
            <div className="bg-navy-800 rounded-xl border border-border p-4 flex items-end gap-1 h-28 overflow-hidden">
              {CHART_BARS.map((h,i) => (
                <div key={i} className="flex-1 rounded-t-sm" style={{height:`${h}%`, background:`linear-gradient(180deg,#3b82f6,#0d9488)`,opacity:0.85}} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="border-y border-border bg-navy-900/50">
        <div className="max-w-5xl mx-auto px-6 py-12 grid grid-cols-2 sm:grid-cols-4 gap-8">
          {STATS.map((s,i) => (
            <div key={i} className="text-center">
              <div className="text-3xl font-black gradient-text mb-1">{s.value}</div>
              <div className="text-sm text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* VS COMPETITION */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-4">Why Finsyt</div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">
              Enterprise intelligence.<br /><span className="gradient-text">Operator price.</span>
            </h2>
            <p className="text-muted text-lg max-w-xl mx-auto">AlphaSense and Rogo are powerful — and built for $20k/yr institutional desks. Finsyt gives founders and operators the same edge, starting at $49/mo.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { name: 'AlphaSense', price: '$20,000+/yr', cons: ['Enterprise-only pricing', 'Complex onboarding', 'Analyst-first UX', 'Not built for operators'], color: '#ef4444' },
              { name: 'Finsyt', price: 'From $49/mo', pros: ['Instant setup', 'Built for founders & operators', 'AI + workflow in one place', 'No sales call needed'], color: '#14b8a6', highlight: true },
              { name: 'Rogo', price: '$5,000+/yr', cons: ['Buyside focus only', 'Research-only (no workflow)', 'No macro data layer', 'Waiting list for access'], color: '#f59e0b' },
            ].map((col, i) => (
              <div key={i} className={`rounded-2xl p-6 border ${col.highlight ? 'bg-navy-900 border-teal-600/40 shadow-[0_0_40px_rgba(13,148,136,0.1)]' : 'bg-navy-800 border-border'}`}>
                {col.highlight && <div className="badge bg-teal-500/10 text-teal-400 border border-teal-500/20 mb-4">✓ Best choice</div>}
                <div className="font-bold text-lg mb-1">{col.name}</div>
                <div className={`text-sm font-bold mb-5`} style={{color: col.color}}>{col.price}</div>
                <div className="flex flex-col gap-2.5">
                  {(col.pros || col.cons || []).map((item, j) => (
                    <div key={j} className="flex items-start gap-2 text-sm">
                      <span className={col.pros ? 'text-teal-400' : 'text-red-400/70'}>{col.pros ? '✓' : '✕'}</span>
                      <span className={col.pros ? 'text-gray-200' : 'text-muted'}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6 bg-navy-900/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-4">Features</div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-4">Everything you need to move fast</h2>
            <p className="text-muted text-lg max-w-xl mx-auto">Real-time data, AI insights, and workflow tools — all in one workspace.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="card-hover group">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-base mb-2">{f.title}</h3>
                <p className="text-muted text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-4">How it works</div>
            <h2 className="text-4xl sm:text-5xl font-black tracking-tight">Data to decision in 3 steps</h2>
          </div>
          <div className="flex flex-col gap-5">
            {[
              { n: '01', title: 'Connect your sources', desc: 'Link data feeds from 50+ global sources in minutes. Finsyt ingests and normalises everything automatically.' },
              { n: '02', title: 'Surface insights with AI', desc: 'Our AI cuts through the noise and surfaces what actually matters — ranked by relevance to your watchlist and focus areas.' },
              { n: '03', title: 'Act with confidence', desc: 'Document decisions, set alerts, collaborate with your team — all in the context of the data that drove them.' },
            ].map((s, i) => (
              <div key={i} className="flex gap-5 items-start p-6 bg-navy-800 border border-border rounded-2xl">
                <div className="w-12 h-12 shrink-0 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center font-black text-blue-400">{s.n}</div>
                <div>
                  <h3 className="font-bold text-base mb-2">{s.title}</h3>
                  <p className="text-muted text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 px-6 bg-navy-900/30">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <div className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-4">Social proof</div>
            <h2 className="text-4xl font-black tracking-tight">Trusted by operators who move fast</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="card-hover relative">
                <div className="text-5xl text-blue-600/10 font-serif absolute top-4 right-5 select-none">"</div>
                <p className="text-sm text-gray-300 leading-relaxed mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center font-bold text-sm">{t.name[0]}</div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-muted">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-black tracking-tight mb-5">
            Ready to move at the<br /><span className="gradient-text">speed of insight?</span>
          </h2>
          <p className="text-muted text-lg mb-10">Join hundreds of founders and analysts already on the waitlist.</p>
          {!submitted ? (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 justify-center">
              <input type="email" placeholder="Enter your work email" value={email} onChange={e => setEmail(e.target.value)} className="input w-full sm:w-72" required />
              <button type="submit" className="btn-primary whitespace-nowrap">Get early access →</button>
            </form>
          ) : (
            <div className="inline-flex items-center gap-3 bg-navy-800 border border-teal-600/40 rounded-xl px-6 py-3">
              <span className="text-teal-400 font-semibold">✓ You're on the list!</span>
            </div>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center font-black text-sm">F</div>
            <span className="font-bold">Finsyt</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted">
            {['Privacy', 'Terms', 'Security', 'Contact'].map(l => <a key={l} href="#" className="hover:text-gray-300 transition-colors">{l}</a>)}
          </div>
          <div className="text-xs text-gray-600">© 2026 Finsyt. All rights reserved.</div>
        </div>
      </footer>
    </div>
  )
}
