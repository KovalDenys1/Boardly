import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function YahtzeeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="yahtzee"
      pagePath="/games/yahtzee/lobbies"
      titleEmoji="🎲"
      gameNameKey="games.yahtzee.name"
      lobbiesNamespace="games.yahtzee.lobbies"
    />
  )
}
