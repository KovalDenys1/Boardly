'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { RockPaperScissorsGameData, RPSChoice } from '@/lib/games/rock-paper-scissors-game'
import LoadingButton from '@/components/LoadingButton'

interface RockPaperScissorsGameBoardProps {
    gameData: RockPaperScissorsGameData
    playerId: string
    playerName: string
    onSubmitChoice: (choice: RPSChoice) => Promise<void>
    isLoading?: boolean
}

const CHOICES: { choice: RPSChoice; emoji: string; label: string }[] = [
    { choice: 'rock', emoji: '🪨', label: 'choice.rock' },
    { choice: 'paper', emoji: '📄', label: 'choice.paper' },
    { choice: 'scissors', emoji: '✂️', label: 'choice.scissors' },
]

export default function RockPaperScissorsGameBoard({
    gameData,
    playerId,
    playerName,
    onSubmitChoice,
    isLoading = false,
}: RockPaperScissorsGameBoardProps) {
    const { t } = useTranslation()
    const [selectedChoice, setSelectedChoice] = useState<RPSChoice | null>(null)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [revealedRound, setRevealedRound] = useState(false)

    // Check if current player has submitted for this round
    useEffect(() => {
        const hasSubmitted = gameData.playersReady.includes(playerId)
        setIsSubmitted(hasSubmitted)
        if (hasSubmitted) {
            setSelectedChoice(gameData.playerChoices[playerId] || null)
        }
    }, [gameData.playersReady, playerId, gameData.playerChoices])

    // Reset reveal animation when round changes
    useEffect(() => {
        setRevealedRound(false)
    }, [gameData.rounds.length])

    const handleSubmitChoice = async (choice: RPSChoice) => {
        setSelectedChoice(choice)
        try {
            await onSubmitChoice(choice)
        } catch {
            setSelectedChoice(null)
        }
    }

    const currentRound = gameData.rounds[gameData.rounds.length - 1] || null
    const otherPlayerId = Object.keys(gameData.playerChoices).find((id) => id !== playerId)
    const otherPlayerScore = otherPlayerId ? (gameData.scores[otherPlayerId] || 0) : 0
    const otherPlayerSubmitted = otherPlayerId ? gameData.playersReady.includes(otherPlayerId) : false

    // Determine if both players have submitted (round is complete)
    const bothSubmitted = currentRound !== null

    return (
        <div className="space-y-6">
            {/* Game Status */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-center">
                {gameData.gameWinner ? (
                    <div>
                        <p className="text-sm text-indigo-100 mb-2">{t('game.finished')}</p>
                        <p className="text-3xl font-bold text-white">
                            {gameData.gameWinner === playerId ? t('game.you_won') : t('game.opponent_won')}
                        </p>
                        <p className="text-lg text-indigo-100 mt-2">
                            {t('game.final_score')}: {gameData.scores[playerId] || 0} - {otherPlayerScore}
                        </p>
                    </div>
                ) : (
                    <div>
                        <p className="text-sm text-indigo-100 mb-2">
                            {t('game.best_of')}: {gameData.mode === 'best-of-3' ? '3' : '5'}
                        </p>
                        <p className="text-2xl font-bold text-white">
                            {t('game.round')} {gameData.rounds.length + 1}
                        </p>
                        <p className="text-lg text-indigo-100 mt-2">
                            {t('game.score')}: {gameData.scores[playerId] || 0} - {otherPlayerScore}
                        </p>
                    </div>
                )}
            </div>

            {/* Current Status Message */}
            {!gameData.gameWinner && (
                <div className="text-center text-sm text-gray-400">
                    {isSubmitted && !bothSubmitted ? (
                        <p className="text-blue-400">
                            ⏳ {t('game.waiting_for_opponent')}
                        </p>
                    ) : !isSubmitted ? (
                        <p>{t('game.make_your_choice')}</p>
                    ) : null}
                </div>
            )}

            {/* Choice Buttons */}
            {!gameData.gameWinner && !isSubmitted && (
                <div className="grid grid-cols-3 gap-4">
                    {CHOICES.map(({ choice, emoji, label }) => (
                        <LoadingButton
                            key={choice}
                            onClick={() => handleSubmitChoice(choice)}
                            loading={isLoading && selectedChoice === choice}
                            disabled={isLoading}
                            className="h-24 flex flex-col items-center justify-center gap-2 bg-slate-700 hover:bg-indigo-600 disabled:opacity-50 text-2xl font-bold rounded-lg border-2 border-slate-600 hover:border-indigo-500 transition"
                        >
                            <span>{emoji}</span>
                            <span className="text-sm">{t(label)}</span>
                        </LoadingButton>
                    ))}
                </div>
            )}

            {/* Reveal Animation - Show when both submitted */}
            {bothSubmitted && (
                <div className="space-y-4">
                    {/* Round Result */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Player 1 Choice */}
                        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <p className="text-xs text-gray-400 mb-2">{playerName}</p>
                            <div className="text-4xl mb-2">
                                {selectedChoice && CHOICES.find((c) => c.choice === selectedChoice)?.emoji}
                            </div>
                            <p className="text-sm font-semibold text-gray-300">
                                {selectedChoice ? t(`choice.${selectedChoice}`) : ''}
                            </p>
                        </div>

                        {/* Opponent Choice */}
                        <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                            <p className="text-xs text-gray-400 mb-2">{t('game.opponent')}</p>
                            <div className="text-4xl mb-2">
                                {otherPlayerId &&
                                    gameData.playerChoices[otherPlayerId] &&
                                    CHOICES.find((c) => c.choice === gameData.playerChoices[otherPlayerId])?.emoji}
                            </div>
                            <p className="text-sm font-semibold text-gray-300">
                                {otherPlayerId && gameData.playerChoices[otherPlayerId]
                                    ? t(`choice.${gameData.playerChoices[otherPlayerId]}`)
                                    : ''}
                            </p>
                        </div>
                    </div>

                    {/* Round Winner */}
                    {currentRound && (
                        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-4 text-center">
                            {currentRound.winner === 'draw' ? (
                                <p className="text-lg font-bold text-white">🤝 {t('game.draw')}</p>
                            ) : currentRound.winner === playerId ? (
                                <p className="text-lg font-bold text-white">🎉 {t('game.round_won')}</p>
                            ) : (
                                <p className="text-lg font-bold text-white">😔 {t('game.round_lost')}</p>
                            )}
                        </div>
                    )}

                    {/* Next Round Button or Game Complete */}
                    {!gameData.gameWinner && (
                        <button
                            onClick={() => {
                                setSelectedChoice(null)
                                setIsSubmitted(false)
                                setRevealedRound(true)
                            }}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-lg transition"
                        >
                            {t('game.next_round')}
                        </button>
                    )}

                    {gameData.gameWinner && (
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-lg transition"
                        >
                            {t('game.play_again')}
                        </button>
                    )}
                </div>
            )}

            {/* Round History */}
            {gameData.rounds.length > 0 && (
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                    <h3 className="text-sm font-bold text-gray-300 mb-3">{t('game.round_history')}</h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {gameData.rounds.map((round, index) => {
                            const p1Id = Object.keys(gameData.playerChoices)[0]
                            const p1Choice = round.choices[p1Id] as RPSChoice | undefined
                            const p2Id = Object.keys(gameData.playerChoices)[1]
                            const p2Choice = round.choices[p2Id] as RPSChoice | undefined
                            const p1Emoji = CHOICES.find((c) => c.choice === p1Choice)?.emoji
                            const p2Emoji = CHOICES.find((c) => c.choice === p2Choice)?.emoji

                            return (
                                <div key={index} className="flex items-center justify-between text-xs text-gray-400 bg-slate-700/50 p-2 rounded">
                                    <span>
                                        {t('game.round')} {index + 1}: {p1Emoji} vs {p2Emoji}
                                    </span>
                                    <span className="font-bold text-indigo-300">
                                        {round.winner === playerId
                                            ? '✓ ' + t('game.win')
                                            : round.winner === 'draw'
                                                ? '= ' + t('game.draw')
                                                : '✗ ' + t('game.loss')}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
