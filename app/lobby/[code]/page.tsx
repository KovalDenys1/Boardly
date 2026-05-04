import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { LobbyPageLoadingFallback } from './components/LobbyPageFallbacks'

const LobbyPageClient = dynamic(() => import('./LobbyPageClient'), {
  ssr: false,
  loading: () => <LobbyPageLoadingFallback />,
})

export default function LobbyPage() {
  return (
    <Suspense fallback={<LobbyPageLoadingFallback />}>
      <LobbyPageClient />
    </Suspense>
  )
}
