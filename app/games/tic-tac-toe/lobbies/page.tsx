import { redirect } from 'next/navigation'

export default function TicTacToeLobbiesPage() {
  redirect('/lobby?gameType=tic_tac_toe')
}
