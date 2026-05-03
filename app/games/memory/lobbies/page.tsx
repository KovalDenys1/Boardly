import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function MemoryLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="memory"
      pagePath="/games/memory/lobbies"
      titleEmoji="🧠"
      gameNameKey="games.memory.name"
      lobbiesNamespace="games.memory.lobbies"
    />
  )
}
