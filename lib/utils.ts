export function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n)) return '—'
  return n.toFixed(decimals)
}
export function fmtLarge(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return '—'
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toFixed(0)}`
}
export function fmtNum(n: number | null | undefined): string {
  if (n == null || isNaN(n) || n === 0) return '—'
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  return n.toFixed(0)
}
export function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—'
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}
export function changeClass(n: number | null | undefined): string {
  if (n == null) return 'neu'
  return n > 0 ? 'pos' : n < 0 ? 'neg' : 'neu'
}
export function formatDate(s: string): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
