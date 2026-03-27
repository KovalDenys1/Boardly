'use client'

import { Suspense } from 'react'
import VerifyEmailContent from './VerifyEmailContent'
import LoadingSpinner from '@/components/LoadingSpinner'

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="page-shell-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 p-4 overflow-y-auto">
        <div className="card max-w-md w-full text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
