import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function LiarsPartyLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="liars_party"
      pagePath="/games/liars-party/lobbies"
      titleEmoji="🎭"
      gameNameKey="games.liars_party.name"
      lobbiesNamespace="games.liars_party.lobbies"
    />
  )
}
