import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function AliasLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="alias"
      pagePath="/games/alias/lobbies"
      titleEmoji="🗣️"
      gameNameKey="games.alias.name"
      lobbiesNamespace="games.alias.lobbies"
    />
  )
}
