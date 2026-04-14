'use client'

import { Suspense } from 'react'
import AuthCard from '@/app/app/auth/_components/AuthCard'

type AuthPageShellProps = {
  mode: 'login' | 'signup'
}

export default function AuthPageShell({ mode }: AuthPageShellProps) {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: '#F5F7FB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1rem',
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '2rem',
              boxShadow: '0 16px 40px rgba(10,22,40,0.08)',
            }}
          >
            <p style={{ color: '#5F7394', fontSize: '0.9rem' }}>Loading authentication…</p>
          </div>
        </div>
      }
    >
      <AuthCard mode={mode} />
    </Suspense>
  )
}
