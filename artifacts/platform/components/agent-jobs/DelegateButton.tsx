'use client'
import { useState } from 'react'
import { DelegateToAgentModal, type DelegateContext } from './DelegateToAgentModal'
import { ACTION_ICONS, ICON_SIZE_MD, ICON_STROKE } from '@/components/ui/icons'

// Drop-in "Delegate to agent" button used across surfaces. Pass a context so
// the modal pre-fills the brief and grounds the runner on the right target.

export function DelegateButton({
  context,
  label = 'Delegate to agent',
  variant = 'solid',
  className = '',
}: {
  context?: DelegateContext | null
  label?: string
  variant?: 'solid' | 'ghost' | 'compact'
  className?: string
}) {
  const [open, setOpen] = useState(false)

  const base = 'inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors'
  const styles =
    variant === 'solid'
      ? 'bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-500'
      : variant === 'ghost'
        ? 'border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5'
        : 'px-2 py-1 text-xs text-indigo-300 hover:text-indigo-200'

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${base} ${styles} ${className}`}>
        <ACTION_ICONS.bot size={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
        {label}
      </button>
      <DelegateToAgentModal open={open} onClose={() => setOpen(false)} context={context} />
    </>
  )
}
