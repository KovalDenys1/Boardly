import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function TicTacToeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="tic_tac_toe"
      pagePath="/games/tic-tac-toe/lobbies"
      pageGradientClassName="from-yellow-500 via-orange-500 to-red-400"
      createCardGradientClassName="from-yellow-500 to-orange-600"
      accentTextClassName="text-orange-600"
      titleEmoji="❌⭕"
      gameNameKey="games.tictactoe.name"
      lobbiesNamespace="games.tictactoe.lobbies"
    />
  )
}
