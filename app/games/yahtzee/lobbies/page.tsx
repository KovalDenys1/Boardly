import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function YahtzeeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="yahtzee"
      gameId="yahtzee"
      accentColor="var(--bd-sky)"
      pagePath="/games/yahtzee/lobbies"
      titleEmoji="🎲"
      gameNameKey="games.yahtzee.name"
      lobbiesNamespace="games.yahtzee.lobbies"
    />
  )
}
