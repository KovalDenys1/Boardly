'use client'

import { useEffect } from 'react'
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
    // Log the error to an error reporting service
    clientLogger.error('Error boundary caught:', error)
  }, [error])

  return <BoardlyErrorState error={error} onRetry={reset} kicker="Boardly · Recovery" />
}
