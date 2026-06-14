import type { Metadata } from 'next'
import ReportsInner from './_ReportsInner'

export const metadata: Metadata = {
  title: 'Reports · Finsyt',
  description: 'Compose, save, and export research reports and tearsheets from reusable blocks.',
}

export default function ReportsPage() {
  return <ReportsInner />
}
