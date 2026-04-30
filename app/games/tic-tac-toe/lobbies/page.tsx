import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function TicTacToeLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="tic_tac_toe"
      pagePath="/games/tic-tac-toe/lobbies"
      titleEmoji="❌⭕"
      gameNameKey="games.tictactoe.name"
      lobbiesNamespace="games.tictactoe.lobbies"
    />
  )
}
