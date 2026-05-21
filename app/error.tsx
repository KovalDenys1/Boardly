'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { clientLogger } from '@/lib/client-logger'
import BoardlyErrorState from '@/components/BoardlyErrorState'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    clientLogger.error('Error boundary caught:', error)
    Sentry.captureException(error)
  }, [error])

  return <BoardlyErrorState error={error} onRetry={reset} kicker="Boardly · Recovery" />
}
