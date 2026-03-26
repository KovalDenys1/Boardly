'use client'

import { useTranslation } from 'react-i18next'
import { RockPaperScissorsGameData, RPSChoice } from '@/lib/games/rock-paper-scissors-game'
import LoadingButton from '@/components/LoadingButton'

interface RPSPlayer {
  id: string
  name: string
}

interface RockPaperScissorsGameBoardProps {
  gameData: RockPaperScissorsGameData
  playerId: string
  playerName: string
  players: RPSPlayer[]
  onSubmitChoice: (choice: RPSChoice) => Promise<void>
  isLoading?: boolean
}

const CHOICES: { choice: RPSChoice; emoji: string; label: string; beats: string; color: string }[] = [
  {
    choice: 'rock',
    emoji: '🪨',
    label: 'lobby.choice.rock',
    beats: '✂️',
    color: 'from-slate-100 to-slate-200 border-slate-300 hover:from-slate-200 hover:to-slate-300 hover:border-slate-400 dark:from-slate-700 dark:to-slate-800 dark:border-slate-600',
  },
  {
    choice: 'paper',
    emoji: '📄',
    label: 'lobby.choice.paper',
    beats: '🪨',
    color: 'from-sky-50 to-blue-100 border-sky-200 hover:from-sky-100 hover:to-blue-200 hover:border-sky-300 dark:from-sky-900/40 dark:to-blue-900/40 dark:border-sky-700',
  },
  {
    choice: 'scissors',
    emoji: '✂️',
    label: 'lobby.choice.scissors',
    beats: '📄',
    color: 'from-rose-50 to-pink-100 border-rose-200 hover:from-rose-100 hover:to-pink-200 hover:border-rose-300 dark:from-rose-900/40 dark:to-pink-900/40 dark:border-rose-700',
  },
]

const CHOICE_LABEL_BY_VALUE: Record<RPSChoice, string> = {
  rock: 'lobby.choice.rock',
  paper: 'lobby.choice.paper',
  scissors: 'lobby.choice.scissors',
}

function getChoiceEmoji(choice: RPSChoice | null | undefined): string {
  if (!choice) return '❔'
  return CHOICES.find((e) => e.choice === choice)?.emoji || '❔'
}

function WinPips({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full border-2 transition-all ${
            i < filled
              ? 'border-emerald-500 bg-emerald-500'
              : 'border-slate-300 bg-transparent dark:border-slate-600'
          }`}
        />
      ))}
    </div>
  )
}

export default function RockPaperScissorsGameBoard({
  gameData,
  playerId,
  playerName,
  players,
  onSubmitChoice,
  isLoading = false,
}: RockPaperScissorsGameBoardProps) {
  const { t } = useTranslation()

  const myPlayer = players.find((p) => p.id === playerId) || { id: playerId, name: playerName }
  const opponent = players.find((p) => p.id !== playerId) || null

  const myScore = gameData.scores[playerId] || 0
  const opponentScore = opponent ? gameData.scores[opponent.id] || 0 : 0
  const winsNeeded = gameData.mode === 'best-of-5' ? 3 : 2
  const maxRounds = gameData.mode === 'best-of-5' ? 5 : 3
  const currentRoundNumber = Math.min(gameData.rounds.length + 1, maxRounds)

  const mySubmitted = gameData.playersReady.includes(playerId)
  const opponentSubmitted = opponent ? gameData.playersReady.includes(opponent.id) : false
  const myCurrentChoice = (gameData.playerChoices[playerId] as RPSChoice | null | undefined) ?? null

  const latestRound = gameData.rounds[gameData.rounds.length - 1] || null
  const myLatestChoice =
    latestRound?.choices ? ((latestRound.choices[playerId] as RPSChoice | undefined) || null) : null
  const opponentLatestChoice =
    latestRound?.choices && opponent
      ? ((latestRound.choices[opponent.id] as RPSChoice | undefined) || null)
      : null

  const canChoose = !isLoading && !mySubmitted && !gameData.gameWinner && !!opponent
  const isGameOver = !!gameData.gameWinner
  const iWon = gameData.gameWinner === playerId

  // Determine status message
  let statusText: string
  let statusVariant: 'neutral' | 'waiting' | 'success' | 'danger' | 'info' = 'neutral'

  if (!opponent) {
    statusText = t('lobby.game.waitingForPlayers')
    statusVariant = 'waiting'
  } else if (isGameOver) {
    statusText = iWon ? t('lobby.game.you_won') : t('lobby.game.opponent_won')
    statusVariant = iWon ? 'success' : 'danger'
  } else if (mySubmitted && opponentSubmitted) {
    statusText = 'Revealing…'
    statusVariant = 'info'
  } else if (mySubmitted) {
    statusText = t('lobby.game.waitingForOpponent')
    statusVariant = 'waiting'
  } else {
    statusText = t('lobby.game.makeyourChoice')
    statusVariant = 'neutral'
  }

  const statusClasses: Record<typeof statusVariant, string> = {
    neutral: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    waiting: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
    success: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    danger: 'bg-rose-50 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
    info: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  }

  return (
    <div className="space-y-4">
      {/* Score board */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
        <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <span>
            {t('lobby.game.round')} {currentRoundNumber} / {maxRounds}
          </span>
          <span>
            {t('lobby.game.best_of')}: {maxRounds} · First to {winsNeeded}
          </span>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {/* You */}
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              {t('lobby.game.you')}
            </p>
            <p className="mt-0.5 truncate text-base font-bold text-slate-900 dark:text-white sm:text-lg">
              {myPlayer.name}
            </p>
            <p className="mt-1.5 text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">{myScore}</p>
            <WinPips filled={myScore} total={winsNeeded} />
          </div>

          {/* VS */}
          <div className="flex flex-col items-center">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              VS
            </span>
          </div>

          {/* Opponent */}
          <div className="min-w-0 text-right">
            <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('lobby.game.opponent')}
            </p>
            <p className="mt-0.5 truncate text-base font-bold text-slate-900 dark:text-white sm:text-lg">
              {opponent?.name || '—'}
            </p>
            <p className="mt-1.5 text-3xl font-black text-slate-900 dark:text-white sm:text-4xl">{opponentScore}</p>
            <div className="flex justify-end">
              <WinPips filled={opponentScore} total={winsNeeded} />
            </div>
          </div>
        </div>
      </div>

      {/* Status banner */}
      <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${statusClasses[statusVariant]}`}>
        <div className="flex items-center justify-between gap-3">
          <span>{statusText}</span>
          {!isGameOver && opponent && (
            <div className="flex items-center gap-2 text-xs font-normal opacity-80">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  mySubmitted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-white/60 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {mySubmitted ? '✓' : '○'} {t('lobby.game.you')}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                  opponentSubmitted ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-white/60 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {opponentSubmitted ? '✓' : '○'} {opponent.name}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Choice cards */}
      {!isGameOver && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('lobby.game.makeyourChoice')}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CHOICES.map(({ choice, emoji, label, beats, color }) => {
              const isSelected = myCurrentChoice === choice
              return (
                <LoadingButton
                  key={choice}
                  onClick={() => onSubmitChoice(choice)}
                  loading={isLoading && isSelected}
                  disabled={!canChoose}
                  className={`group relative h-32 rounded-2xl border-2 bg-gradient-to-br transition-all duration-150 ${
                    isSelected
                      ? 'scale-[1.03] border-blue-500 from-blue-50 to-indigo-100 shadow-lg dark:from-blue-900/40 dark:to-indigo-900/40'
                      : `${color} disabled:opacity-50`
                  }`}
                >
                  <span className="flex flex-col items-center justify-center gap-1.5">
                    <span
                      className={`text-5xl transition-transform duration-150 ${!isSelected && !mySubmitted ? 'group-hover:scale-110' : ''}`}
                    >
                      {emoji}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{t(label)}</span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      beats {beats}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">
                      ✓
                    </span>
                  )}
                </LoadingButton>
              )
            })}
          </div>
        </div>
      )}

      {/* Round reveal */}
      {latestRound && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('lobby.game.round')} {gameData.rounds.length} — {latestRound.winner === 'draw' ? t('lobby.game.draw') : latestRound.winner === playerId ? t('lobby.game.round_won') : t('lobby.game.round_lost')}
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">
                {myPlayer.name}
              </p>
              <p className="text-4xl">{getChoiceEmoji(myLatestChoice)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {myLatestChoice ? t(CHOICE_LABEL_BY_VALUE[myLatestChoice]) : '—'}
              </p>
            </div>
            <div className="text-center text-xl font-black text-slate-400 dark:text-slate-500">vs</div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 truncate">
                {opponent?.name || t('lobby.game.opponent')}
              </p>
              <p className="text-4xl">{getChoiceEmoji(opponentLatestChoice)}</p>
              <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {opponentLatestChoice ? t(CHOICE_LABEL_BY_VALUE[opponentLatestChoice]) : '—'}
              </p>
            </div>
          </div>
          <div
            className={`mt-3 rounded-xl px-3 py-2 text-center text-sm font-bold ${
              latestRound.winner === 'draw'
                ? 'bg-slate-800 text-white dark:bg-slate-700'
                : latestRound.winner === playerId
                ? 'bg-emerald-600 text-white'
                : 'bg-rose-600 text-white'
            }`}
          >
            {latestRound.winner === 'draw'
              ? `${t('lobby.game.draw')} — No points`
              : latestRound.winner === playerId
              ? `${t('lobby.game.round_won')} +1`
              : `${t('lobby.game.round_lost')}`}
          </div>
        </div>
      )}

      {/* Round history */}
      {gameData.rounds.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t('lobby.game.round_history')}
          </p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto">
            {[...gameData.rounds]
              .reverse()
              .slice(1) // skip the last round already shown above
              .map((round, reverseIndex) => {
                const roundNumber = gameData.rounds.length - reverseIndex - 1
                const myRoundChoice = round.choices[playerId] as RPSChoice | undefined
                const opponentRoundChoice = opponent
                  ? (round.choices[opponent.id] as RPSChoice | undefined)
                  : undefined
                const outcome =
                  round.winner === 'draw'
                    ? t('lobby.game.draw')
                    : round.winner === playerId
                    ? t('lobby.game.win')
                    : t('lobby.game.loss')
                const outcomeColor =
                  round.winner === 'draw'
                    ? 'text-slate-600 dark:text-slate-400'
                    : round.winner === playerId
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'

                return (
                  <div
                    key={`round-${roundNumber}`}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  >
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('lobby.game.round')} {roundNumber}: {getChoiceEmoji(myRoundChoice)} vs{' '}
                      {getChoiceEmoji(opponentRoundChoice)}
                    </span>
                    <span className={`font-semibold ${outcomeColor}`}>{outcome}</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
