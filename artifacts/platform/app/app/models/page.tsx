'use client'
import { PageHero } from '@/components/ui'
import ModelBuilderView from '@/components/model-builder/ModelBuilderView'

export default function ModelsPage() {
  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Model Builder"
        title="Build models from plain English"
        subtitle="Describe a DCF, trading comps, or both — Finsyt fetches live data, runs the math, and delivers an editable, source-linked model you can export or save to a workspace."
      />
      <div style={{ padding: '0 1.75rem 2.5rem' }}>
        <ModelBuilderView />
      </div>
    </div>
  )
}
