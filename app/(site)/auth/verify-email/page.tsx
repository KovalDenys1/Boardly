'use client'

import { Suspense } from 'react'
import VerifyEmailContent from './VerifyEmailContent'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="page-shell flex items-center justify-center" style={{ background: 'var(--bd-bg)' }}>
        <LoadingSpinner />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
