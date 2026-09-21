import type { Metadata } from 'next'
import { buildGameMetadata } from '@/lib/game-seo'
import GameJsonLd from '../components/GameJsonLd'
import GameDetailPage from '../components/GameDetailPage'

export const metadata: Metadata = buildGameMetadata('liars-party')

export default function LiarsPartyGamePage() {
  return (
    <>
      <GameJsonLd gameId="liars-party" />
      <GameDetailPage
        gameName="Liar's Party"
        title="Play Liar's Party Online"
        description="A social bluffing game where players make claims, read the room, and vote on who is telling the truth."
        iconLabel="Liar's Party"
        gameId="liars-party"
        accentColor="var(--bd-lav)"
        accent="var(--bd-lav)"
        lobbiesHref="/games/liars-party/lobbies"
        primaryCtaLabel="Play now"
        facts={[
          { label: 'Players', value: '4–12' },
          { label: 'Price', value: 'Free' },
          { label: 'Download', value: 'None' },
          { label: 'Game type', value: 'Social' },
        ]}
        introTitle="What is Liar's Party?"
        intro={[
          'Liar\'s Party is a social bluffing game. One player makes a claim, and everyone else decides whether to believe it or challenge it.',
          'Good reads earn points. Bad reads cost you. Get caught too many times and you are out of the round.',
        ]}
        steps={[
          { title: 'Create a lobby', desc: 'Invite a group and start a round together.' },
          { title: 'Make your claim', desc: 'Tell the truth or bluff, then mark it secretly.' },
          { title: 'Vote', desc: 'Other players choose whether to believe or challenge the claim.' },
          { title: 'Reveal and survive', desc: 'The truth comes out and the scoreboard updates.' },
        ]}
        benefitsTitle="Why Liar's Party belongs on Boardly"
        benefits={[
          'Built for shared room play.',
          'Clear voting and reveal moments.',
          'Great for social groups.',
          'No app download planned.',
        ]}
      />
    </>
  )
}
