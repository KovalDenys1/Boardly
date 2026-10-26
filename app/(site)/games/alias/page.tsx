import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import AliasDetailContent from './AliasDetailContent'

/**
 * `metadata` stays server-side and stays English on purpose. The <title>,
 * description and openGraph block are what a crawler reads, and localizing
 * them needs the per-locale alternates and hreflang set that #928 owns - not
 * this page. Do not "fix" it by moving these strings into a client component;
 * Next.js only reads a `metadata` export from the server module.
 */
export const metadata: Metadata = buildGameMetadata('alias')

export default function AliasGamePage() {
  return (
    <>
      <GameJsonLd gameId="alias" />
      <AliasDetailContent />
    </>
  )
}
