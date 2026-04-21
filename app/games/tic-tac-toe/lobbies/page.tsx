import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function TicTacToeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="tic_tac_toe"
      pagePath="/games/tic-tac-toe/lobbies"
      pageGradientClassName="from-indigo-600 via-blue-500 to-sky-400"
      createCardGradientClassName="from-indigo-500 to-blue-600"
      accentTextClassName="text-indigo-600"
      titleEmoji="❌⭕"
      gameNameKey="games.tictactoe.name"
      lobbiesNamespace="games.tictactoe.lobbies"
    />
  )
}
