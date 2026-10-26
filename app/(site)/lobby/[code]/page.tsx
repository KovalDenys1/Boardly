import { Suspense } from 'react'
import { LobbyPageLoadingFallback } from './components/LobbyPageFallbacks'
import LobbyClientWrapper from './LobbyClientWrapper'

export default function LobbyPage() {
  return (
    <Suspense fallback={<LobbyPageLoadingFallback />}>
      <LobbyClientWrapper />
    </Suspense>
  )
}
