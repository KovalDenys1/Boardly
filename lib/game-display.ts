export function formatGameTypeLabel(gameType: string): string {
  switch (gameType) {
    case 'yahtzee':
      return 'Yahtzee'
    case 'chess':
      return 'Chess'
    case 'guess_the_spy':
      return 'Guess the Spy'
    case 'tic_tac_toe':
      return 'Tic Tac Toe'
    case 'rock_paper_scissors':
      return 'Rock Paper Scissors'
    case 'memory':
      return 'Memory'
    case 'uno':
      return 'Uno'
    default:
      return gameType
  }
}

export function getGameStatusBadgeColor(status: string): string {
  switch (status) {
    case 'finished':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'playing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    case 'abandoned':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    case 'cancelled':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    default:
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  }
}
