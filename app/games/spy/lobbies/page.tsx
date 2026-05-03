import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function SpyLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="guess_the_spy"
      pagePath="/games/spy/lobbies"
      titleEmoji="🕵️"
      gameNameKey="games.spy.name"
      lobbiesNamespace="games.spy.lobbies"
    />
  )
}
