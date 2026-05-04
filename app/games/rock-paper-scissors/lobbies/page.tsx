import GameLobbiesPage from '@/app/games/components/GameLobbiesPage'

export default function RockPaperScissorsLobbiesPage() {
  return (
    <GameLobbiesPage
      gameType="rock_paper_scissors"
      gameId="rps"
      accentColor="var(--bd-lav)"
      pagePath="/games/rock-paper-scissors/lobbies"
      titleEmoji="✊"
      gameNameKey="games.rock_paper_scissors.name"
      lobbiesNamespace="games.rps.lobbies"
    />
  )
}
