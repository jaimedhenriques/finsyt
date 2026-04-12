const NYSE_TZ = 'America/New_York'

export function isMarketOpen(): boolean {
  const now = new Date()
  const et = new Date(now.toLocaleString('en-US', { timeZone: NYSE_TZ }))
  const day = et.getDay()
  if (day === 0 || day === 6) return false
  const mins = et.getHours() * 60 + et.getMinutes()
  return mins >= 570 && mins < 960 // 9:30 – 16:00 ET
}

export function marketStatusLabel(): 'LIVE' | 'DELAYED' {
  return isMarketOpen() ? 'LIVE' : 'DELAYED'
}
