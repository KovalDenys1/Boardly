import type { ComponentType } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AliasDetailContent from '@/app/(site)/games/alias/AliasDetailContent'
import CheckersDetailContent from '@/app/(site)/games/checkers/CheckersDetailContent'
import ConnectFourDetailContent from '@/app/(site)/games/connect-four/ConnectFourDetailContent'
import LiarsPartyDetailContent from '@/app/(site)/games/liars-party/LiarsPartyDetailContent'
import LudoDetailContent from '@/app/(site)/games/ludo/LudoDetailContent'
import MemoryDetailContent from '@/app/(site)/games/memory/MemoryDetailContent'
import RockPaperScissorsDetailContent from '@/app/(site)/games/rock-paper-scissors/RockPaperScissorsDetailContent'
import SketchAndGuessDetailContent from '@/app/(site)/games/sketch-and-guess/SketchAndGuessDetailContent'
import SpyDetailContent from '@/app/(site)/games/spy/SpyDetailContent'
import TicTacToeDetailContent from '@/app/(site)/games/tic-tac-toe/TicTacToeDetailContent'
import YahtzeeDetailContent from '@/app/(site)/games/yahtzee/YahtzeeDetailContent'
import GameJsonLd from '@/app/(site)/games/components/GameJsonLd'
import { getCatalogEntryById } from '@/lib/game-catalog'
import { buildGameMetadata, gameIdForSlug } from '@/lib/game-seo'
import type { PrefixedLocale } from '@/lib/seo-locales'

/** Every `/games/<slug>` page, for `app/<locale>/games/[game]` under each language prefix. */
const DETAIL_CONTENT: Record<string, ComponentType> = {
  alias: AliasDetailContent,
  checkers: CheckersDetailContent,
  'connect-four': ConnectFourDetailContent,
  'liars-party': LiarsPartyDetailContent,
  ludo: LudoDetailContent,
  memory: MemoryDetailContent,
  'rock-paper-scissors': RockPaperScissorsDetailContent,
  'sketch-and-guess': SketchAndGuessDetailContent,
  spy: SpyDetailContent,
  'tic-tac-toe': TicTacToeDetailContent,
  yahtzee: YahtzeeDetailContent,
}

export type LocalizedGameParams = { params: Promise<{ game: string }> }

export function localizedGameParams(): { game: string }[] {
  return Object.keys(DETAIL_CONTENT).map((game) => ({ game }))
}

export function localizedGameMetadata(locale: PrefixedLocale, slug: string): Metadata {
  const id = gameIdForSlug(slug)
  return buildGameMetadata(id, { locale, index: getCatalogEntryById(id)?.availability === 'available' })
}

export function LocalizedGamePage({ locale, slug }: { locale: PrefixedLocale; slug: string }) {
  const Content = DETAIL_CONTENT[slug]
  if (!Content) notFound()

  return (
    <>
      <GameJsonLd gameId={gameIdForSlug(slug)} locale={locale} />
      <Content />
    </>
  )
}
