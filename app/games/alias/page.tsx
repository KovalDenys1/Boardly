import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = buildGameMetadata('alias')

export default function AliasGamePage() {
  return (
    <>
      <GameJsonLd gameId="alias" />
      <GameDetailPage
        gameName="Alias"
        title="Play Alias Online"
        description="A team word game where one player describes secret words and the team races to guess as many as possible."
        iconLabel="Alias"
        gameId="alias"
        accentColor="var(--bd-coral)"
        accent="var(--bd-coral)"
        lobbiesHref="/games/alias/lobbies"
        guideHref="/guides/how-to-play-alias-online"
        primaryCtaLabel="Play now"
        groupNotice="Alias needs at least 4 players and has no bots — it's a group game. Gather your crew before creating a lobby, or warm up with a bot-ready game like Yahtzee or Connect Four."
        facts={[
          { label: 'Players', value: '4–16' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Game type', value: 'Team' },
        ]}
        introTitle="What is Alias?"
        intro={[
          'Alias is a team word-description game. One player sees a secret word and explains it without saying the word itself.',
          'Correct guesses score points. Skips cost points. Teams take turns until the final score decides the winner.',
        ]}
        steps={[
          { title: 'Create a lobby', desc: 'Invite your group and split into teams.' },
          { title: 'Describe words', desc: 'Use clues, synonyms, and examples without saying the secret word.' },
          { title: 'Guess quickly', desc: 'The team guesses against the timer and scores for correct answers.' },
          { title: 'Switch teams', desc: 'Teams alternate turns until the match ends.' },
        ]}
        benefitsTitle="Why Alias belongs on Boardly"
        benefits={[
          'Designed for group play.',
          'Simple room links for friends.',
          'Fast rounds that work for parties.',
          'No app download planned.',
        ]}
      />
    </>
  )
}
