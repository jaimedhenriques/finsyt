import { useState } from 'react'
import AppLayout from '../layouts/AppLayout'

export default function Settings() {
  const [tab, setTab] = useState('Profile')
  const [saved, setSaved] = useState(false)
  const [profile, setProfile] = useState({ name:'Jaime Henriques', email:'jaimedhenriques@gmail.com', role:'Founder & CEO', company:'Finsyt', tz:'Europe/London' })
  const [notifs, setNotifs] = useState({ price:true, ai:true, macro:true, digest:true, email:true, slack:true, push:false })
  const save = () => { setSaved(true); setTimeout(()=>setSaved(false),2500) }
  const p = (k,v) => setProfile(prev=>({...prev,[k]:v}))
  const n = k => setNotifs(prev=>({...prev,[k]:!prev[k]}))

  const Toggle = ({on, onClick}) => (
    <button onClick={onClick} className={`w-11 h-6 rounded-full border-none cursor-pointer relative transition-all duration-200 ${on ? 'bg-gradient-brand shadow-lg shadow-blue-600/20' : 'bg-navy-700'}`}>
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm ${on ? 'left-6' : 'left-1'}`} />
    </button>
  )

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl">
        <div className="mb-7">
          <h1 className="text-2xl font-black tracking-tight mb-1">Settings</h1>
          <p className="text-sm text-muted">Manage your account, notifications, and billing.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-navy-800 border border-border rounded-xl p-1 mb-8 w-fit">
          {['Profile','Notifications','Billing'].map(t => (
            <button key={t} onClick={()=>setTab(t)} className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab===t ? 'bg-gradient-brand text-white shadow-lg' : 'text-muted hover:text-gray-100'}`}>{t}</button>
          ))}
        </div>

        {/* Profile */}
        {tab==='Profile' && (
          <div className="flex flex-col gap-5">
            <div className="card">
              <div className="flex items-center gap-5 pb-6 mb-6 border-b border-border">
                <div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center font-black text-2xl shadow-lg">J</div>
                <div>
                  <div className="font-bold text-base mb-0.5">{profile.name}</div>
                  <div className="text-xs text-muted mb-3">{profile.email}</div>
                  <button className="text-xs border border-border text-muted px-3 py-1.5 rounded-lg hover:border-blue-500/30 hover:text-gray-300 transition-colors">Change photo</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[['Full name','text','name','name'],['Email','email','email','email'],['Role','text','role','role'],['Company','text','company','company']].map(([label,type,key,ph]) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted">{label}</label>
                    <input className="input" type={type} value={profile[key]} onChange={e=>p(key,e.target.value)} />
                  </div>
                ))}
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-xs font-semibold text-muted">Timezone</label>
                  <select className="input" value={profile.tz} onChange={e=>p('tz',e.target.value)} style={{background:'#131929'}}>
                    <option value="Europe/London">Europe/London (GMT+1)</option>
                    <option value="America/New_York">America/New_York (GMT-4)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (GMT-7)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="font-bold text-sm mb-5">Password</div>
              <div className="flex flex-col gap-4">
                {['Current password','New password','Confirm new password'].map(l => (
                  <div key={l} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted">{l}</label>
                    <input className="input" type="password" placeholder="••••••••" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-primary" onClick={save}>Save changes</button>
              {saved && <span className="text-teal-400 text-sm font-semibold">✓ Saved!</span>}
            </div>
          </div>
        )}

        {/* Notifications */}
        {tab==='Notifications' && (
          <div className="flex flex-col gap-5">
            <div className="card">
              <div className="font-bold text-sm mb-1">Alert types</div>
              <div className="text-xs text-muted mb-5">Choose which events trigger notifications.</div>
              {[
                {k:'price',l:'Price alerts',d:'When a watchlist item crosses a threshold'},
                {k:'ai',l:'AI insights',d:'When new AI-generated insights are available'},
                {k:'macro',l:'Macro events',d:'Key economic releases and central bank decisions'},
                {k:'digest',l:'Weekly digest',d:'A weekly summary of your top signals'},
              ].map(({k,l,d}) => (
                <div key={k} className="flex items-center justify-between py-4 border-b border-border/50 last:border-0">
                  <div>
                    <div className="text-sm font-semibold mb-0.5">{l}</div>
                    <div className="text-xs text-muted">{d}</div>
                  </div>
                  <Toggle on={notifs[k]} onClick={()=>n(k)} />
                </div>
              ))}
            </div>
            <div className="card">
              <div className="font-bold text-sm mb-1">Delivery channels</div>
              <div className="text-xs text-muted mb-5">Where to receive your notifications.</div>
              {[
                {k:'email',l:'Email',d:'jaimedhenriques@gmail.com',i:'📧'},
                {k:'slack',l:'Slack',d:'Connected · Jaime Henriques workspace',i:'💬'},
                {k:'push',l:'Push notifications',d:'Browser and mobile push',i:'📱'},
              ].map(({k,l,d,i}) => (
                <div key={k} className="flex items-center justify-between py-4 border-b border-border/50 last:border-0">
                  <div className="flex gap-3 items-center">
                    <span className="text-xl">{i}</span>
                    <div>
                      <div className="text-sm font-semibold">{l}</div>
                      <div className="text-xs text-muted">{d}</div>
                    </div>
                  </div>
                  <Toggle on={notifs[k]} onClick={()=>n(k)} />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button className="btn-primary" onClick={save}>Save preferences</button>
              {saved && <span className="text-teal-400 text-sm font-semibold">✓ Saved!</span>}
            </div>
          </div>
        )}

        {/* Billing */}
        {tab==='Billing' && (
          <div className="flex flex-col gap-5">
            <div className="bg-navy-900 border border-blue-600/40 rounded-2xl p-6 shadow-[0_0_30px_rgba(37,99,235,0.08)]">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-2">Current Plan</div>
                  <div className="text-3xl font-black tracking-tight">Pro <span className="text-base text-muted font-normal">· $49/mo</span></div>
                </div>
                <span className="badge bg-green-500/10 text-green-400 border border-green-500/20">Active</span>
              </div>
              <div className="text-xs text-muted mb-5">Renews May 10, 2026 · Billed monthly</div>
              <div className="flex gap-3">
                <button className="btn-primary text-sm py-2.5 px-5">Upgrade to Team</button>
                <button className="btn-outline text-sm py-2.5 px-5">Cancel plan</button>
              </div>
            </div>
            <div className="card">
              <div className="font-bold text-sm mb-4">Payment method</div>
              <div className="flex items-center justify-between p-3.5 bg-navy-950 border border-border rounded-xl mb-3">
                <div className="flex gap-3 items-center">
                  <div className="bg-blue-900 px-2 py-1 rounded text-[10px] font-black">VISA</div>
                  <div>
                    <div className="text-sm font-semibold">•••• •••• •••• 4242</div>
                    <div className="text-xs text-muted">Expires 12/27</div>
                  </div>
                </div>
                <button className="text-xs border border-border text-muted px-3 py-1.5 rounded-lg hover:border-blue-500/30 hover:text-gray-300 transition-colors">Update</button>
              </div>
              <button className="w-full py-2.5 border border-dashed border-border rounded-xl text-sm text-muted hover:text-gray-300 hover:border-blue-500/30 transition-colors">+ Add payment method</button>
            </div>
            <div className="card">
              <div className="font-bold text-sm mb-4">Invoice history</div>
              {[['Apr 10, 2026','$49.00'],['Mar 10, 2026','$49.00'],['Feb 10, 2026','$49.00']].map(([date,amt],i) => (
                <div key={i} className={`flex items-center justify-between py-3.5 ${i<2?'border-b border-border/50':''}`}>
                  <div>
                    <div className="text-sm font-semibold mb-1">Pro Plan — {date}</div>
                    <span className="badge bg-green-500/10 text-green-400 text-[10px]">Paid</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{amt}</span>
                    <button className="text-xs border border-border text-muted px-2.5 py-1 rounded-lg hover:border-blue-500/30 hover:text-gray-300 transition-colors">PDF</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
