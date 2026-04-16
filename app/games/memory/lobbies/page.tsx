import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function MemoryLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="memory"
      pagePath="/games/memory/lobbies"
      pageGradientClassName="from-emerald-500 via-teal-500 to-cyan-400"
      createCardGradientClassName="from-emerald-500 to-teal-600"
      accentTextClassName="text-emerald-600"
      titleEmoji="🧠"
      gameNameKey="games.memory.name"
      lobbiesNamespace="games.memory.lobbies"
    />
  )
}
