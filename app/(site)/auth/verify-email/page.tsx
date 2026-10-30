'use client'

import { Suspense } from 'react'
import VerifyEmailContent from './VerifyEmailContent'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-(--game-h) items-center justify-center" style={{ background: 'var(--bd-bg)' }}>
        <LoadingSpinner />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
