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

const CHOICES: { choice: RPSChoice; emoji: string; label: string; beats: string }[] = [
    { choice: 'rock', emoji: '🪨', label: 'lobby.choice.rock', beats: '✂️' },
    { choice: 'paper', emoji: '📄', label: 'lobby.choice.paper', beats: '🪨' },
    { choice: 'scissors', emoji: '✂️', label: 'lobby.choice.scissors', beats: '📄' },
]

const CHOICE_LABEL_BY_VALUE: Record<RPSChoice, string> = {
    rock: 'lobby.choice.rock',
    paper: 'lobby.choice.paper',
    scissors: 'lobby.choice.scissors',
}

function getChoiceEmoji(choice: RPSChoice | null | undefined): string {
    if (!choice) return '❔'
    return CHOICES.find((entry) => entry.choice === choice)?.emoji || '❔'
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

    const myPlayer = players.find((player) => player.id === playerId) || { id: playerId, name: playerName }
    const opponent = players.find((player) => player.id !== playerId) || null

    const myScore = gameData.scores[playerId] || 0
    const opponentScore = opponent ? (gameData.scores[opponent.id] || 0) : 0
    const winsNeeded = gameData.mode === 'best-of-5' ? 3 : 2
    const maxRounds = gameData.mode === 'best-of-5' ? 5 : 3
    const currentRoundNumber = gameData.rounds.length + 1

    const mySubmitted = gameData.playersReady.includes(playerId)
    const opponentSubmitted = opponent ? gameData.playersReady.includes(opponent.id) : false
    const myCurrentChoice = (gameData.playerChoices[playerId] as RPSChoice | null | undefined) ?? null

    const latestRound = gameData.rounds[gameData.rounds.length - 1] || null
    const myLatestChoice =
        latestRound && latestRound.choices ? ((latestRound.choices[playerId] as RPSChoice | undefined) || null) : null
    const opponentLatestChoice =
        latestRound && latestRound.choices && opponent
            ? ((latestRound.choices[opponent.id] as RPSChoice | undefined) || null)
            : null

    const canChoose = !isLoading && !mySubmitted && !gameData.gameWinner && !!opponent

    let statusTitle = t('lobby.game.makeyourChoice')
    let statusDescription = t('lobby.game.waitingForPlayers')

    if (!opponent) {
        statusTitle = t('lobby.game.waitingForPlayers')
        statusDescription = 'Join with one more player to start submitting moves.'
    } else if (gameData.gameWinner) {
        statusTitle = gameData.gameWinner === playerId ? t('lobby.game.you_won') : t('lobby.game.opponent_won')
        statusDescription = `${t('lobby.game.final_score')}: ${myScore} - ${opponentScore}`
    } else if (mySubmitted && !opponentSubmitted) {
        statusTitle = t('lobby.game.waitingForOpponent')
        statusDescription = myCurrentChoice
            ? `You locked: ${t(CHOICE_LABEL_BY_VALUE[myCurrentChoice])}`
            : 'Your move is submitted.'
    } else if (mySubmitted && opponentSubmitted) {
        statusTitle = 'Revealing round...'
        statusDescription = 'Both choices received.'
    } else {
        statusTitle = t('lobby.game.makeyourChoice')
        statusDescription = 'Pick one option below. Both players reveal simultaneously.'
    }

    return (
        <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-700">
                        {t('lobby.game.round')} {Math.min(currentRoundNumber, maxRounds)} / {maxRounds}
                    </p>
                    <p className="text-xs text-slate-500">
                        {t('lobby.game.best_of')}: {gameData.mode === 'best-of-3' ? '3' : '5'} • First to {winsNeeded}
                    </p>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{t('lobby.game.you')}</p>
                        <p className="mt-1 text-lg font-bold text-emerald-900">{myPlayer.name}</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-700">
                            {t('lobby.game.score')}: {myScore}
                        </p>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">{t('lobby.game.opponent')}</p>
                        <p className="mt-1 text-lg font-bold text-slate-900">
                            {opponent?.name || t('lobby.game.waitingForPlayers')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-600">
                            {t('lobby.game.score')}: {opponentScore}
                        </p>
                    </div>
                </div>
            </section>

            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
                <p className="text-lg font-bold text-blue-900">{statusTitle}</p>
                <p className="mt-1 text-sm text-blue-800">{statusDescription}</p>
                {!gameData.gameWinner && opponent && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-blue-800">
                            You: {mySubmitted ? 'Ready' : 'Waiting'}
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-blue-800">
                            {opponent.name}: {opponentSubmitted ? 'Ready' : 'Waiting'}
                        </div>
                    </div>
                )}
            </section>

            {!gameData.gameWinner && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-700 mb-3">{t('lobby.game.makeyourChoice')}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {CHOICES.map(({ choice, emoji, label, beats }) => {
                            const isSelected = myCurrentChoice === choice
                            return (
                                <LoadingButton
                                    key={choice}
                                    onClick={() => onSubmitChoice(choice)}
                                    loading={isLoading && isSelected}
                                    disabled={!canChoose}
                                    className={`h-28 rounded-xl border-2 text-slate-900 transition-all ${
                                        isSelected
                                            ? 'border-blue-500 bg-blue-100 shadow-md'
                                            : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50'
                                    }`}
                                >
                                    <span className="flex flex-col items-center justify-center gap-1">
                                        <span className="text-3xl">{emoji}</span>
                                        <span className="text-sm font-bold">{t(label)}</span>
                                        <span className="text-[11px] text-slate-500">beats {beats}</span>
                                    </span>
                                </LoadingButton>
                            )
                        })}
                    </div>
                </section>
            )}

            {latestRound && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-700">
                        {t('lobby.game.round')} {gameData.rounds.length} result
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs uppercase tracking-wider text-slate-500">{myPlayer.name}</p>
                            <p className="mt-1 text-3xl">{getChoiceEmoji(myLatestChoice)}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                {myLatestChoice ? t(CHOICE_LABEL_BY_VALUE[myLatestChoice]) : '—'}
                            </p>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs uppercase tracking-wider text-slate-500">
                                {opponent?.name || t('lobby.game.opponent')}
                            </p>
                            <p className="mt-1 text-3xl">{getChoiceEmoji(opponentLatestChoice)}</p>
                            <p className="mt-1 text-sm font-semibold text-slate-700">
                                {opponentLatestChoice ? t(CHOICE_LABEL_BY_VALUE[opponentLatestChoice]) : '—'}
                            </p>
                        </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                        {latestRound.winner === 'draw'
                            ? t('lobby.game.draw')
                            : latestRound.winner === playerId
                                ? t('lobby.game.round_won')
                                : t('lobby.game.round_lost')}
                    </div>
                </section>
            )}

            {gameData.rounds.length > 0 && (
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-slate-700 mb-3">{t('lobby.game.round_history')}</p>
                    <div className="max-h-56 space-y-2 overflow-y-auto">
                        {[...gameData.rounds].reverse().map((round, reverseIndex) => {
                            const roundNumber = gameData.rounds.length - reverseIndex
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

                            return (
                                <div
                                    key={`round-${roundNumber}`}
                                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                                >
                                    <span className="text-slate-600">
                                        {t('lobby.game.round')} {roundNumber}: {getChoiceEmoji(myRoundChoice)} vs {getChoiceEmoji(opponentRoundChoice)}
                                    </span>
                                    <span className="font-semibold text-slate-800">{outcome}</span>
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}
        </div>
    )
}
