'use client'

import dynamic from 'next/dynamic'
import { LobbyPageLoadingFallback } from './components/LobbyPageFallbacks'

const LobbyPageClient = dynamic(() => import('./LobbyPageClient'), {
  ssr: false,
  loading: () => <LobbyPageLoadingFallback />,
})

export default function LobbyPage() {
  return <LobbyPageClient />
}
