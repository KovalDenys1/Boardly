import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function ConnectFourLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="connect_four"
      pagePath="/games/connect-four/lobbies"
      titleEmoji="🔴"
      gameNameKey="games.connect_four.name"
      lobbiesNamespace="games.connect_four.lobbies"
    />
  )
}
