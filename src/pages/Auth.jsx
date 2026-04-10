import { useState } from 'react'
import { Link } from 'react-router-dom'

export default function Auth() {
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ name:'', email:'', password:'', confirm:'' })
  const [done, setDone] = useState(false)
  const set = (k,v) => setForm(p=>({...p,[k]:v}))
  const submit = (e) => { e.preventDefault(); setDone(true) }

  return (
    <div className="min-h-screen bg-navy-950 text-gray-100 grid grid-cols-1 lg:grid-cols-2">
      {/* Left */}
      <div className="hidden lg:flex flex-col justify-between p-14 bg-navy-900 border-r border-border relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-64 bg-blue-600/8 rounded-full blur-3xl" />
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-brand flex items-center justify-center font-black text-lg">F</div>
          <span className="font-black text-xl tracking-tight">Finsyt</span>
        </Link>
        <div>
          <h2 className="text-4xl font-black leading-tight tracking-tight mb-8">
            The intelligence workspace<br />for operators who<br /><span className="gradient-text">move fast.</span>
          </h2>
          <div className="card mb-8">
            <p className="text-sm text-gray-300 leading-relaxed mb-5">"Finsyt replaced three separate tools. Our macro review now takes 15 minutes instead of 2 hours."</p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-brand flex items-center justify-center font-bold text-sm">S</div>
              <div>
                <div className="text-sm font-semibold">Sarah K.</div>
                <div className="text-xs text-muted">CFO, Series B SaaS</div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-10">
          {[['500+','Beta users'],['50+','Data sources'],['$49','Starting /mo']].map(([v,l],i) => (
            <div key={i}><div className="text-2xl font-black gradient-text">{v}</div><div className="text-xs text-muted">{l}</div></div>
          ))}
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex justify-center mb-10 lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center font-black">F</div>
              <span className="font-black text-lg">Finsyt</span>
            </Link>
          </div>

          {mode === 'signin' && (
            <>
              <h1 className="text-2xl font-black tracking-tight mb-2">Welcome back</h1>
              <p className="text-muted text-sm mb-8">Sign in to your Finsyt workspace.</p>
              <div className="flex flex-col gap-3 mb-6">
                {[['G','Google'],['in','LinkedIn']].map(([ico,label]) => (
                  <button key={label} className="flex items-center justify-center gap-3 py-3 bg-navy-800 border border-border rounded-xl text-sm font-medium hover:border-blue-500/30 transition-colors">
                    <span className="font-black">{ico}</span> Continue with {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex-1 h-px bg-border" /><span className="text-xs text-gray-600">or email</span><div className="flex-1 h-px bg-border" />
              </div>
              {done ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">✓</div>
                  <div className="font-bold text-lg mb-2">Signed in!</div>
                  <Link to="/dashboard" className="text-blue-400 text-sm">Go to dashboard →</Link>
                </div>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted">Email</label>
                    <input className="input" type="email" placeholder="you@company.com" value={form.email} onChange={e=>set('email',e.target.value)} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between">
                      <label className="text-xs font-semibold text-muted">Password</label>
                      <button type="button" onClick={() => setMode('forgot')} className="text-xs text-blue-400 hover:text-blue-300">Forgot?</button>
                    </div>
                    <input className="input" type="password" placeholder="••••••••" value={form.password} onChange={e=>set('password',e.target.value)} required />
                  </div>
                  <button type="submit" className="btn-primary w-full mt-1">Sign in →</button>
                </form>
              )}
              <p className="text-center text-sm text-muted mt-6">No account? <button onClick={()=>setMode('signup')} className="text-blue-400 hover:text-blue-300">Sign up free</button></p>
            </>
          )}

          {mode === 'signup' && (
            <>
              <h1 className="text-2xl font-black tracking-tight mb-2">Create your account</h1>
              <p className="text-muted text-sm mb-8">14-day free trial. No credit card required.</p>
              {done ? (
                <div className="text-center py-8">
                  <div className="text-5xl mb-4">🎉</div>
                  <div className="font-bold text-lg mb-2">Account created!</div>
                  <p className="text-sm text-muted">Check your email to verify your account.</p>
                </div>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-4">
                  {[['text','Full name','name','Jaime Henriques'],['email','Work email','email','you@company.com'],['password','Password','password','Min. 8 characters'],['password','Confirm password','confirm','••••••••']].map(([type,label,key,ph]) => (
                    <div key={key} className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted">{label}</label>
                      <input className="input" type={type} placeholder={ph} value={form[key]} onChange={e=>set(key,e.target.value)} required />
                    </div>
                  ))}
                  <button type="submit" className="btn-primary w-full mt-1">Create account →</button>
                  <p className="text-xs text-center text-gray-600">By signing up you agree to our Terms and Privacy Policy.</p>
                </form>
              )}
              <p className="text-center text-sm text-muted mt-6">Already have an account? <button onClick={()=>setMode('signin')} className="text-blue-400 hover:text-blue-300">Sign in</button></p>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <h1 className="text-2xl font-black tracking-tight mb-2">Reset password</h1>
              <p className="text-muted text-sm mb-8">Enter your email and we'll send you a reset link.</p>
              {done ? (
                <div className="bg-navy-800 border border-teal-600/30 rounded-xl p-6 text-center">
                  <div className="text-3xl mb-3">📧</div>
                  <div className="font-semibold text-teal-400 mb-2">Check your inbox</div>
                  <div className="text-xs text-muted">We sent a reset link to {form.email}</div>
                </div>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted">Email</label>
                    <input className="input" type="email" placeholder="you@company.com" value={form.email} onChange={e=>set('email',e.target.value)} required />
                  </div>
                  <button type="submit" className="btn-primary w-full mt-1">Send reset link →</button>
                </form>
              )}
              <p className="text-center text-sm text-muted mt-6"><button onClick={()=>setMode('signin')} className="text-blue-400 hover:text-blue-300">← Back to sign in</button></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
