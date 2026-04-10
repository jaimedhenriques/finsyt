import { useState } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../components/Navbar'

const TIERS = [
  {
    name: 'Free', price: { mo: 0, yr: 0 }, desc: 'For individuals getting started.',
    cta: 'Get started free', ctaTo: '/auth',
    features: ['5 watchlist items','Daily AI summaries','10 data explorer searches/mo','Basic email alerts','1 connected source','Community support'],
    locked: ['Real-time AI insights','Team collaboration','API access','Custom dashboards'],
  },
  {
    name: 'Pro', price: { mo: 49, yr: 39 }, desc: 'For founders and analysts who need the full picture.', badge: 'Most popular',
    cta: 'Start 14-day free trial', ctaTo: '/auth', highlight: true,
    features: ['Unlimited watchlist items','Real-time AI insights','Unlimited data explorer','Alerts via email + Slack','10 connected sources','World Bank Data360 API','Custom dashboards','CSV / JSON exports','Priority support'],
    locked: ['Team collaboration (up to 15)','Full API access','SSO / SAML'],
  },
  {
    name: 'Team', price: { mo: 149, yr: 119 }, desc: 'For investment teams who move together.',
    cta: 'Talk to sales', ctaTo: '/auth',
    features: ['Everything in Pro','Up to 15 team members','Shared watchlists & dashboards','Unlimited connected sources','Full REST API access','SSO / SAML','Audit logs','Dedicated account manager','SLA guarantee'],
    locked: [],
  },
]

const COMPARE = [
  ['Watchlist items','5','Unlimited','Unlimited'],
  ['AI summaries','Daily','Real-time','Real-time'],
  ['Data searches','10/mo','Unlimited','Unlimited'],
  ['Alert channels','Email','Email + Slack','Email + Slack + Webhook'],
  ['Connected sources','1','10','Unlimited'],
  ['World Bank Data360',false,true,true],
  ['Custom dashboards',false,true,true],
  ['API access',false,false,true],
  ['Team collaboration',false,false,true],
  ['SSO / SAML',false,false,true],
  ['Support','Community','Priority','Dedicated'],
]

export default function Pricing() {
  const [annual, setAnnual] = useState(true)

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100">
      <Navbar />

      {/* Header */}
      <section className="pt-32 pb-16 px-6 text-center">
        <div className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-4">Pricing</div>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-5">
          Simple, honest<br /><span className="gradient-text">pricing</span>
        </h1>
        <p className="text-muted text-lg max-w-xl mx-auto mb-10">Start free. Upgrade when you're ready. No sales calls, no hidden fees, no $20k surprises.</p>

        {/* Toggle */}
        <div className="inline-flex bg-navy-800 border border-border rounded-xl p-1 gap-1">
          {['Monthly','Annual'].map((t, i) => (
            <button key={t} onClick={() => setAnnual(i === 1)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${(i===1)===annual ? 'bg-gradient-brand text-white shadow-lg' : 'text-muted hover:text-gray-100'}`}>
              {t} {i===1 && <span className="text-xs opacity-80 ml-1">Save 20%</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Cards */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5 items-start">
          {TIERS.map((tier, i) => (
            <div key={i} className={`rounded-2xl p-7 border relative ${tier.highlight ? 'bg-navy-900 border-blue-600/50 shadow-[0_0_50px_rgba(37,99,235,0.12)]' : 'bg-navy-800 border-border'}`}>
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-brand text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap shadow-lg">{tier.badge}</div>
              )}
              <div className="font-bold text-lg mb-1">{tier.name}</div>
              <div className="text-xs text-muted mb-6 leading-relaxed">{tier.desc}</div>
              <div className="mb-7">
                <span className="text-5xl font-black tracking-tight">${annual ? tier.price.yr : tier.price.mo}</span>
                {tier.price.mo > 0 && <span className="text-muted text-sm ml-1">/mo</span>}
                {tier.price.mo === 0 && <span className="text-muted text-sm ml-1">forever</span>}
                {annual && tier.price.mo > 0 && (
                  <div className="text-xs text-teal-400 mt-1.5">Billed annually · save ${(tier.price.mo - tier.price.yr) * 12}/yr</div>
                )}
              </div>
              <Link to={tier.ctaTo} className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all mb-7 ${tier.highlight ? 'bg-gradient-brand text-white hover:opacity-90' : 'border border-border text-gray-300 hover:border-blue-500/50 hover:text-white'}`}>
                {tier.cta}
              </Link>
              <div className="flex flex-col gap-2.5 border-t border-border pt-6">
                {tier.features.map((f, j) => (
                  <div key={j} className="flex items-start gap-2.5 text-sm text-gray-200">
                    <span className="text-teal-400 shrink-0 mt-px">✓</span> {f}
                  </div>
                ))}
                {tier.locked.map((f, j) => (
                  <div key={j} className="flex items-start gap-2.5 text-sm text-gray-600">
                    <span className="shrink-0 mt-px">—</span> {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-black text-center mb-8 tracking-tight">Full comparison</h2>
          <div className="bg-navy-800 border border-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-4 px-6 py-3 bg-navy-900 border-b border-border">
              <div className="text-xs text-muted font-semibold uppercase tracking-widest">Feature</div>
              {['Free','Pro','Team'].map(t => <div key={t} className="text-xs text-muted font-semibold uppercase tracking-widest text-center">{t}</div>)}
            </div>
            {COMPARE.map(([feat,...vals], i) => (
              <div key={i} className={`grid grid-cols-4 px-6 py-3.5 ${i < COMPARE.length-1 ? 'border-b border-border/50' : ''} ${i%2===1 ? 'bg-navy-950/30' : ''}`}>
                <div className="text-sm text-gray-300">{feat}</div>
                {vals.map((v, j) => (
                  <div key={j} className="text-center text-sm">
                    {typeof v === 'boolean' ? (
                      v ? <span className="text-teal-400">✓</span> : <span className="text-gray-700">—</span>
                    ) : <span className="text-gray-300">{v}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border py-20 px-6 text-center">
        <h2 className="text-3xl font-black mb-4">Still have questions?</h2>
        <p className="text-muted mb-8">We're happy to help you pick the right plan.</p>
        <a href="mailto:hello@finsyt.com" className="btn-primary inline-block">Talk to us →</a>
      </section>
    </div>
  )
}
