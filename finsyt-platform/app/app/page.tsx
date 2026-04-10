'use client'
import { usePathname } from 'next/navigation'
import WidgetGrid from '@/components/WidgetGrid'
import { useWorkspace } from '@/lib/workspace'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { t } from '@/lib/i18n/translations'

export default function AppOverview() {
  const pathname = usePathname()
  const { editMode, openPicker } = useWorkspace()
  const { locale } = useLocale()
  const tr = (k: string) => t(locale, k)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? tr('good_morning') : hour < 17 ? tr('good_afternoon') : tr('good_evening')

  return (
    <div style={{ padding: '1.25rem 1.5rem', background: '#F7F9FC', minHeight: 'calc(100vh - 60px)' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{tr('home_subtitle')}</p>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.025em' }}>{greeting} 👋</h1>
        </div>
        {!editMode && (
          <button onClick={() => openPicker(pathname)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: '#fff', border: '1.5px solid #E8EDF4', borderRadius: 9, fontSize: 12, fontWeight: 700, color: '#3D4F6E', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span>+ Add Widget</span>
          </button>
        )}
      </div>
      <WidgetGrid page={pathname} />
    </div>
  )
}
