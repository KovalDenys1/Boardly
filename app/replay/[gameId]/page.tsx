import type { Metadata } from 'next'
import ReplayPageClient from './ReplayPageClient'

export const metadata: Metadata = {
  title: 'Replay – Boardly',
  robots: { index: false, follow: false },
}

export default async function ReplayPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params
  return <ReplayPageClient gameId={gameId} />
}
