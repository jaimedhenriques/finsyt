'use client'
import { CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useEffect, useRef, useState, KeyboardEvent } from 'react'

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, padding = 16, className = '', style, ...rest }:
  { children: ReactNode; padding?: number | string; className?: string; style?: CSSProperties; [k: string]: any }) {
  return (
    <div
      className={`card ${className}`}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

// ─── Button ──────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type BtnSize = 'sm' | 'md' | 'lg'

const BTN_BG: Record<BtnVariant, string> = {
  primary:   'var(--gradient-brand)',
  secondary: 'rgba(255,255,255,0.06)',
  ghost:     'transparent',
  danger:    'var(--neg-dim)',
}
const BTN_FG: Record<BtnVariant, string> = {
  primary: '#fff', secondary: 'var(--text-primary)', ghost: 'var(--text-secondary)', danger: 'var(--neg)',
}
const BTN_PAD: Record<BtnSize, string> = { sm: '5px 10px', md: '8px 14px', lg: '11px 18px' }
const BTN_FS:  Record<BtnSize, number> = { sm: 12, md: 13, lg: 14 }

export function Button({
  children, variant = 'secondary', size = 'md', disabled, onClick, type = 'button', style, title, ariaLabel,
}: {
  children: ReactNode; variant?: BtnVariant; size?: BtnSize; disabled?: boolean;
  onClick?: () => void; type?: 'button' | 'submit'; style?: CSSProperties; title?: string; ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      style={{
        padding: BTN_PAD[size],
        fontSize: BTN_FS[size],
        fontWeight: 700,
        borderRadius: 8,
        border: variant === 'secondary' ? '1px solid var(--border)' : 'none',
        background: BTN_BG[variant],
        color: BTN_FG[variant],
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all .12s',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

// ─── Badge ───────────────────────────────────────────────────────────────────
type BadgeTone = 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'violet'
const BADGE_BG: Record<BadgeTone, string> = {
  gray:   'rgba(255,255,255,0.06)',
  blue:   'rgba(27,79,255,0.18)',
  green:  'rgba(52,211,153,0.18)',
  red:    'rgba(248,113,113,0.18)',
  amber:  'rgba(251,191,36,0.18)',
  violet: 'rgba(167,139,250,0.18)',
}
const BADGE_FG: Record<BadgeTone, string> = {
  gray: 'var(--text-secondary)', blue: 'var(--accent-text)', green: 'var(--pos)', red: 'var(--neg)', amber: 'var(--amber)', violet: 'var(--violet)',
}
export function Badge({ children, tone = 'gray', style }: { children: ReactNode; tone?: BadgeTone; style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, lineHeight: 1.4,
      background: BADGE_BG[tone], color: BADGE_FG[tone],
      ...style,
    }}>
      {children}
    </span>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 14, radius = 4, style }:
  { width?: number | string; height?: number | string; radius?: number; style?: CSSProperties }) {
  return (
    <span style={{
      display: 'inline-block', width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.10), rgba(255,255,255,0.04))',
      backgroundSize: '200% 100%',
      animation: 'sk 1.4s linear infinite',
      ...style,
    }} />
  )
}

// ─── EmptyState ──────────────────────────────────────────────────────────────
export function EmptyState({ icon = '∅', title, hint, action }:
  { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div style={{ fontSize: 28, opacity: 0.5, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{title}</div>
      {hint && <div style={{ fontSize: 13, marginBottom: 14 }}>{hint}</div>}
      {action}
    </div>
  )
}

// ─── Tabs (keyboard-accessible) ──────────────────────────────────────────────
export interface TabItem { id: string; label: ReactNode; badge?: ReactNode }

export function Tabs({ items, value, onChange, sticky = false }:
  { items: TabItem[]; value: string; onChange: (id: string) => void; sticky?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  function onKey(e: KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const next = (idx + dir + items.length) % items.length
      onChange(items[next].id)
      const btns = ref.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
      btns?.[next]?.focus()
    }
  }
  return (
    <div
      ref={ref}
      role="tablist"
      style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        position: sticky ? 'sticky' : 'static',
        top: sticky ? 0 : undefined,
        background: sticky ? 'var(--bg)' : 'transparent',
        zIndex: sticky ? 10 : undefined,
      }}
    >
      {items.map((it, i) => {
        const active = it.id === value
        return (
          <button
            key={it.id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={e => onKey(e, i)}
            style={{
              padding: '12px 18px',
              border: 'none',
              background: 'transparent',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: active ? 800 : 600,
              cursor: 'pointer',
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              transition: 'color .12s',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            {it.label}
            {it.badge}
          </button>
        )
      })}
    </div>
  )
}

// ─── Drawer (right side) ─────────────────────────────────────────────────────
export function Drawer({ open, onClose, title, children, width = 440 }:
  { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    function onEsc(e: globalThis.KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(2,6,18,0.6)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity .18s',
          zIndex: 70,
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width,
          maxWidth: '92vw',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.4)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .22s ease-out',
          zIndex: 71,
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>{children}</div>
      </aside>
    </>
  )
}

// ─── CitationChip ────────────────────────────────────────────────────────────
export function CitationChip({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Source: ${label}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '1px 7px',
        margin: '0 2px',
        borderRadius: 4,
        background: 'rgba(27,79,255,0.16)',
        color: '#7DA1FF',
        border: '1px solid rgba(27,79,255,0.32)',
        fontSize: 10,
        fontWeight: 700,
        cursor: 'pointer',
        verticalAlign: 'baseline',
      }}
    >
      ◆ {label}
    </button>
  )
}

// ─── Input ───────────────────────────────────────────────────────────────────
type InputProps = InputHTMLAttributes<HTMLInputElement> & { fieldSize?: 'sm' | 'md' }
export function Input({ fieldSize = 'md', style, className = '', ...rest }: InputProps) {
  const pad = fieldSize === 'sm' ? '6px 10px' : '9px 12px'
  const fs  = fieldSize === 'sm' ? 12 : 13
  return (
    <input
      className={className}
      style={{
        width: '100%',
        background: 'var(--bg-input)',
        border: '1.5px solid var(--border)',
        color: 'var(--text-primary)',
        padding: pad,
        borderRadius: 8,
        fontSize: fs,
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color 0.14s',
        ...style,
      }}
      {...rest}
    />
  )
}

// ─── Select ──────────────────────────────────────────────────────────────────
type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { fieldSize?: 'sm' | 'md' }
export function Select({ fieldSize = 'md', style, className = '', children, ...rest }: SelectProps) {
  const pad = fieldSize === 'sm' ? '6px 10px' : '9px 12px'
  const fs  = fieldSize === 'sm' ? 12 : 13
  return (
    <select
      className={className}
      style={{
        width: '100%',
        background: 'var(--bg-input)',
        border: '1.5px solid var(--border)',
        color: 'var(--text-primary)',
        padding: pad,
        borderRadius: 8,
        fontSize: fs,
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color 0.14s',
        ...style,
      }}
      {...rest}
    >
      {children}
    </select>
  )
}

// ─── FieldLabel ──────────────────────────────────────────────────────────────
export function FieldLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <label style={{
      display: 'block',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-secondary)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: 6,
      ...style,
    }}>{children}</label>
  )
}

// ─── DataTable ───────────────────────────────────────────────────────────────
export interface DataColumn<T> {
  key: string
  header: ReactNode
  align?: 'left' | 'right'
  width?: number | string
  sortable?: boolean
  render?: (row: T, index: number) => ReactNode
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, sortBy, sortDir = 'desc', onSort, getRowKey, emptyMessage = 'No data', onRowClick, isRowActive,
}: {
  columns: DataColumn<T>[]
  rows: T[]
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string) => void
  getRowKey?: (row: T, index: number) => string | number
  emptyMessage?: ReactNode
  onRowClick?: (row: T, index: number) => void
  isRowActive?: (row: T, index: number) => boolean
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th
                key={col.key}
                className={col.align === 'right' ? 'right' : ''}
                style={{
                  width: col.width,
                  cursor: col.sortable && onSort ? 'pointer' : undefined,
                  userSelect: col.sortable ? 'none' : undefined,
                  whiteSpace: 'nowrap',
                }}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
              >
                {col.header}
                {col.sortable && sortBy === col.key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>{emptyMessage}</td></tr>
          ) : rows.map((row, i) => {
            const active = isRowActive ? isRowActive(row, i) : false
            return (
            <tr
              key={getRowKey ? getRowKey(row, i) : i}
              onClick={onRowClick ? () => onRowClick(row, i) : undefined}
              aria-selected={isRowActive ? active : undefined}
              style={{
                ...(onRowClick ? { cursor: 'pointer' } : {}),
                ...(active ? { background: 'var(--accent-bg, rgba(99,102,241,0.1))' } : {}),
              }}
            >
              {columns.map(col => (
                <td key={col.key} className={col.align === 'right' ? 'right' : ''}>
                  {col.render ? col.render(row, i) : row[col.key]}
                </td>
              ))}
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Global keyframes (skeleton shimmer + fade-up already in globals) ───────
export function UIKeyframes() {
  return <style>{`@keyframes sk { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
}

// ─── Kbd ─────────────────────────────────────────────────────────────────────
// Inline keyboard shortcut chip used inside command surfaces and tooltips.
export function Kbd({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <kbd style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 6px', borderRadius: 5,
      background: 'var(--hover)', border: '1px solid var(--border)',
      color: 'var(--text-muted)',
      fontSize: 10.5, fontWeight: 700,
      letterSpacing: '0.04em',
      fontFamily: 'inherit',
      ...style,
    }}>{children}</kbd>
  )
}

// ─── IconButton ──────────────────────────────────────────────────────────────
// Square ghost button used for toolbar/topbar icon affordances. Pairs with
// a Lucide icon at 16px / 1.6 stroke per the icon scale below.
export function IconButton({
  children, label, onClick, active = false, size = 36, disabled, style,
}: {
  children: ReactNode; label: string; onClick?: () => void; active?: boolean;
  size?: number; disabled?: boolean; style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: size, height: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8,
        border: '1px solid', borderColor: active ? 'var(--border)' : 'transparent',
        background: active ? 'var(--hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.12s',
        ...style,
      }}
      onMouseEnter={e => {
        if (active || disabled) return
        ;(e.currentTarget as HTMLElement).style.background = 'var(--hover)'
        ;(e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'
      }}
      onMouseLeave={e => {
        if (active || disabled) return
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
        ;(e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
      }}
    >
      {children}
    </button>
  )
}

// ─── PageHeader ──────────────────────────────────────────────────────────────
// Compact, dense page chrome for utility pages — sits below the topbar and
// above the content. Distinct from `PageHero` (used for marketing-feel
// surfaces). Includes optional breadcrumbs, eyebrow, title, subtitle, and an
// action slot. Designed to be the *only* heading pattern on most app pages.
export interface BreadcrumbItem { label: ReactNode; href?: string }

export function PageHeader({
  breadcrumbs, eyebrow, title, subtitle, actions, meta, sticky = false,
}: {
  breadcrumbs?: BreadcrumbItem[]
  eyebrow?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  sticky?: boolean
}) {
  return (
    <header style={{
      padding: '20px 28px 16px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-page)',
      position: sticky ? 'sticky' : 'static',
      top: sticky ? 0 : undefined,
      zIndex: sticky ? 12 : undefined,
    }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11.5, color: 'var(--text-muted)',
          marginBottom: 8,
        }}>
          {breadcrumbs.map((b, i) => {
            const last = i === breadcrumbs.length - 1
            const node: ReactNode = b.href && !last
              ? <a href={b.href} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{b.label}</a>
              : <span style={{ color: last ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: last ? 700 : 500 }}>{b.label}</span>
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {node}
                {!last && <span aria-hidden style={{ color: 'var(--text-muted)' }}>/</span>}
              </span>
            )
          })}
        </nav>
      )}
      {eyebrow && (
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em',
          color: 'var(--accent-text)', textTransform: 'uppercase',
          marginBottom: 6,
        }}>{eyebrow}</div>
      )}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <h1 style={{
            margin: 0,
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
            fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em',
            lineHeight: 1.15, color: 'var(--text-primary)',
          }}>{title}</h1>
          {subtitle && (
            <p style={{
              margin: '6px 0 0',
              fontSize: 13, lineHeight: 1.55,
              color: 'var(--text-secondary)',
              maxWidth: 720,
            }}>{subtitle}</p>
          )}
          {meta && (
            <div style={{
              marginTop: 8,
              display: 'flex', flexWrap: 'wrap', gap: 12,
              fontSize: 11.5, color: 'var(--text-muted)',
            }}>{meta}</div>
          )}
        </div>
        {actions && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}

// ─── MetricTile ──────────────────────────────────────────────────────────────
// Compact KPI cell used on Overview, Markets, Macro, Portfolio, etc. Variants
// keep change colouring consistent across the app. Empty/loading states are
// first-class so callers never render `0` as a placeholder.
export type Tone = 'neutral' | 'pos' | 'neg' | 'amber' | 'accent'
const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--text-secondary)',
  pos:     'var(--pos)',
  neg:     'var(--neg)',
  amber:   'var(--amber)',
  accent:  'var(--accent-text)',
}

export function MetricTile({
  label, value, change, changeTone = 'neutral', hint, loading = false, footer, onClick, dense = false,
}: {
  label: ReactNode
  value?: ReactNode
  change?: ReactNode
  changeTone?: Tone
  hint?: ReactNode
  loading?: boolean
  footer?: ReactNode
  onClick?: () => void
  dense?: boolean
}) {
  const interactive = !!onClick
  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: dense ? '10px 12px' : '14px 16px',
        display: 'flex', flexDirection: 'column', gap: dense ? 4 : 6,
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color .12s, transform .12s',
      }}
      onMouseEnter={e => { if (interactive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-dim)' }}
      onMouseLeave={e => { if (interactive) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
        color: 'var(--text-muted)', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {hint && <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
      </div>
      <div style={{
        fontSize: dense ? 16 : 20, fontWeight: 800,
        color: 'var(--text-primary)', letterSpacing: '-0.01em',
        fontVariantNumeric: 'tabular-nums',
        minHeight: dense ? 20 : 26,
      }}>
        {loading ? <Skeleton width={84} height={18} /> : (value ?? <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>—</span>)}
      </div>
      {(change || footer) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
          {change != null && (
            <span style={{ fontWeight: 700, color: TONE_COLOR[changeTone], fontVariantNumeric: 'tabular-nums' }}>
              {loading ? <Skeleton width={48} height={12} /> : change}
            </span>
          )}
          {footer && <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{footer}</span>}
        </div>
      )}
    </div>
  )
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────
// Horizontal action rail that sits between the PageHeader and the main
// content. Lays out left and right slots with a faint divider underneath.
export function Toolbar({ left, right, sticky = false, padding = '10px 28px' }:
  { left?: ReactNode; right?: ReactNode; sticky?: boolean; padding?: string | number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
      padding,
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-page)',
      position: sticky ? 'sticky' : 'static',
      top: sticky ? 0 : undefined,
      zIndex: sticky ? 11 : undefined,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>{left}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{right}</div>
    </div>
  )
}

// ─── LoadingSkeleton variants ───────────────────────────────────────────────
// Tile (KPI), table-rows, and chart placeholders. Use these instead of
// rendering `—` or `0` while real data is in flight.
export function LoadingTile({ count = 1, dense = false }: { count?: number; dense?: boolean }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12,
          padding: dense ? '10px 12px' : '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <Skeleton width={64} height={10} />
          <Skeleton width={96} height={dense ? 16 : 20} />
          <Skeleton width={48} height={11} />
        </div>
      ))}
    </>
  )
}

export function LoadingTableRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c}><Skeleton width={c === 0 ? 80 : '70%'} height={12} /></td>
          ))}
        </tr>
      ))}
    </>
  )
}

export function LoadingChart({ height = 180 }: { height?: number }) {
  return (
    <div style={{
      height, borderRadius: 12,
      background: 'linear-gradient(180deg, var(--accent-dim) 0%, transparent 100%)',
      border: '1px solid var(--border)',
      display: 'flex', alignItems: 'flex-end', padding: 16, gap: 6,
    }}>
      {[0.3,0.5,0.4,0.7,0.6,0.85,0.7,0.95,0.8,0.6,0.45,0.55].map((v, i) => (
        <span key={i} style={{
          flex: 1, height: `${v * 100}%`, borderRadius: 3,
          background: 'linear-gradient(180deg, rgba(0,53,229,0.18), rgba(0,53,229,0.06))',
          animation: `sk 1.4s linear infinite`,
        }}/>
      ))}
    </div>
  )
}

// ─── Re-exports — agentic surfaces ─────────────────────────────────────────
// Pages should always import from `@/components/ui` so future renames stay
// localised. The agentic surface modules live in their own files for
// readability.
export { ContextualAskBar } from './contextual-ask-bar'
export type { ContextualAskBarProps, AskChip } from './contextual-ask-bar'
export { InlineAgentMenu } from './inline-agent-menu'
export type { InlineAgentMenuProps } from './inline-agent-menu'
export { CommandInput } from './command-input'
export { CommandPalette } from './command-palette'
export type { PaletteAction } from './command-palette'
export { FloatingFinsytAgent } from './floating-finsyt-agent'
export { ICON_STROKE, ICON_SIZE_SM, ICON_SIZE_MD, ICON_SIZE_LG, NAV_ICONS, ACTION_ICONS } from './icons'
export type { NavIconKey } from './icons'

// ─── PageHero ────────────────────────────────────────────────────────────────
// AlphaSense-style display heading: tight Inter Tight, one accent word, calm
// subhead, optional eyebrow + actions. Use at the top of major surfaces
// (Overview, Research, Company, Workspaces).
export function PageHero({
  eyebrow, title, accentWord, subtitle, actions, children,
}: {
  eyebrow?: ReactNode;
  title: string;
  accentWord?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  let titleNode: ReactNode = title
  if (accentWord && title.includes(accentWord)) {
    const parts = title.split(accentWord)
    titleNode = (
      <>
        {parts[0]}
        <span style={{ color: 'var(--accent-text)' }}>{accentWord}</span>
        {parts.slice(1).join(accentWord)}
      </>
    )
  }
  return (
    <div style={{
      padding: '32px 32px 24px',
      animation: 'heroFadeUp 0.4s ease',
    }}>
      {eyebrow && (
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
          color: 'var(--text-muted)', textTransform: 'uppercase',
          marginBottom: 10,
        }}>{eyebrow}</div>
      )}
      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        gap: 24, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <h1 style={{
            fontFamily: "'Inter Tight', 'Inter', sans-serif",
            fontSize: 'clamp(32px, 4.2vw, 52px)',
            fontWeight: 700, letterSpacing: '-0.025em',
            lineHeight: 1.05, margin: 0,
            color: 'var(--text-primary)',
          }}>{titleNode}</h1>
          {subtitle && (
            <p style={{
              marginTop: 14, marginBottom: 0,
              fontSize: 15, lineHeight: 1.6,
              color: 'var(--text-secondary)',
              maxWidth: 640,
            }}>{subtitle}</p>
          )}
        </div>
        {actions && <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>{actions}</div>}
      </div>
      {children && <div style={{ marginTop: 24 }}>{children}</div>}
    </div>
  )
}

// ─── SectionBand ─────────────────────────────────────────────────────────────
// Soft pastel band that breaks long pages into chapters. Mirrors the AlphaSense
// mid-page band pattern. Variants pull from the token system so they read
// correctly on every theme.
const BAND_BG: Record<string, string> = {
  blue:   'linear-gradient(180deg, var(--accent-dim), transparent)',
  sage:   'linear-gradient(180deg, var(--pos-dim), transparent)',
  amber:  'linear-gradient(180deg, var(--amber-dim), transparent)',
  violet: 'linear-gradient(180deg, var(--violet-dim), transparent)',
  none:   'transparent',
}
export function SectionBand({
  variant = 'blue', eyebrow, title, subtitle, actions, children, padded = true,
}: {
  variant?: 'blue' | 'sage' | 'amber' | 'violet' | 'none';
  eyebrow?: ReactNode;
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  padded?: boolean;
}) {
  return (
    <section style={{
      background: BAND_BG[variant],
      borderTop: '1px solid var(--border)',
      padding: padded ? '32px' : 0,
    }}>
      {(eyebrow || title || subtitle || actions) && (
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 24, marginBottom: children ? 20 : 0, flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            {eyebrow && (
              <div style={{
                fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                color: 'var(--accent-text)', textTransform: 'uppercase',
                marginBottom: 8,
              }}>{eyebrow}</div>
            )}
            {title && (
              <h2 style={{
                fontFamily: "'Inter Tight', 'Inter', sans-serif",
                fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em',
                lineHeight: 1.15, margin: 0, color: 'var(--text-primary)',
              }}>{title}</h2>
            )}
            {subtitle && (
              <p style={{
                marginTop: 8, marginBottom: 0,
                fontSize: 13.5, lineHeight: 1.55,
                color: 'var(--text-secondary)', maxWidth: 640,
              }}>{subtitle}</p>
            )}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}
