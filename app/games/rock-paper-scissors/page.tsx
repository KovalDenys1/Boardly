import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = buildGameMetadata('rps')

export default function RockPaperScissorsGamePage() {
  return (
    <>
      <GameJsonLd gameId="rps" />
      <GameDetailPage
        gameName="Rock Paper Scissors"
        title="Play Rock Paper Scissors Online"
        description="The classic game, played in real time. Both players pick simultaneously — no waiting, no guessing what your opponent chose."
        iconLabel="Rock Paper Scissors"
        gameId="rps"
        accentColor="var(--bd-lav)"
        accent="var(--bd-lav)"
        lobbiesHref="/games/rock-paper-scissors/lobbies"
        guideHref="/guides/how-to-play-rock-paper-scissors-online"
        primaryCtaLabel="Play now"
        playVsBotGameType="rock_paper_scissors"
        facts={[
          { label: 'Players', value: '1–2' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Game type', value: 'Casual' },
        ]}
        introTitle="What is Rock Paper Scissors?"
        intro={[
          'Rock Paper Scissors is a two-player game where both players pick one of three options at the same time: Rock, Paper, or Scissors.',
          'Rock beats Scissors, Scissors beats Paper, and Paper beats Rock. If both players pick the same option, the round is a draw and replays.',
        ]}
        steps={[
          { title: 'Create or join a lobby', desc: 'Open a room and share the code with your opponent.' },
          { title: 'Pick your move', desc: 'Choose Rock, Paper, or Scissors before the timer runs out.' },
          { title: 'Simultaneous reveal', desc: 'Both choices show at the same time — no waiting for the other player.' },
          { title: 'First to the target wins', desc: 'Play rounds until one player reaches the win count.' },
        ]}
        benefitsTitle="Why play Rock Paper Scissors on Boardly?"
        benefits={[
          'Real-time simultaneous reveals.',
          'Bot support for solo practice.',
          'Instant rounds with no setup.',
          'Free to play as a guest.',
        ]}
      />
    </>
  )
}
