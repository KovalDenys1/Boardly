'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Player } from '@/lib/game-engine'

interface SpyQuestioningProps {
  players: Player[]
  currentUserId: string
  currentQuestionerId: string | null
  currentTargetId: string | null
  pendingQuestion: string | null
  questionHistory: Array<{
    askerId: string
    askerName: string
    targetId: string
    targetName: string
    question: string
    answer: string
    timestamp: number
  }>
  timeRemaining: number
  isMyTurn: boolean
  onAskQuestion: (targetId: string, question: string) => void
  onAnswerQuestion: (answer: string) => void
  onSkipTurn: () => void
}

export default function SpyQuestioning({
  players,
  currentUserId,
  currentQuestionerId,
  currentTargetId,
  pendingQuestion,
  questionHistory,
  timeRemaining,
  isMyTurn,
  onAskQuestion,
  onAnswerQuestion,
  onSkipTurn,
}: SpyQuestioningProps) {
  const { t } = useTranslation()
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [questionText, setQuestionText] = useState('')
  const [answerText, setAnswerText] = useState('')

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isQuestioner = currentQuestionerId === currentUserId
  const isTarget = currentTargetId === currentUserId
  const canAsk = isQuestioner && !pendingQuestion
  const canAnswer = isTarget && !!pendingQuestion

  const handleAskQuestion = () => {
    if (selectedTarget && questionText.trim()) {
      onAskQuestion(selectedTarget, questionText.trim())
      setQuestionText('')
      setSelectedTarget('')
    }
  }

  const handleAnswerQuestion = () => {
    if (answerText.trim()) {
      onAnswerQuestion(answerText.trim())
      setAnswerText('')
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl sm:rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-xl border border-white/20">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">💬</div>
          <h2 className="text-3xl font-bold text-white mb-2">
            {t('spy.phases.questioning')}
          </h2>
          <div className="text-xl text-purple-200">
            {t('spy.timeRemaining', { time: formatTime(timeRemaining) })}
          </div>
        </div>

        {/* Current Status */}
        {canAsk && (
          <div className="bg-blue-500/30 rounded-xl p-4 mb-6 text-white text-center">
            <p className="font-semibold text-lg mb-2">🎯 {t('spy.yourTurnToAsk')}</p>
            <p className="text-sm text-blue-200">{t('spy.askQuestionHint')}</p>
          </div>
        )}

        {canAnswer && (
          <div className="bg-yellow-500/30 rounded-xl p-4 mb-6 text-white text-center">
            <p className="font-semibold text-lg mb-2">❓ {t('spy.questionForYou')}</p>
            <p className="text-lg font-bold mb-2">{pendingQuestion}</p>
            <p className="text-sm text-yellow-200">{t('spy.answerQuestionHint')}</p>
          </div>
        )}

        {!canAsk && !canAnswer && (
          <div className="bg-gray-500/30 rounded-xl p-4 mb-6 text-white text-center">
            <p className="text-sm">
              {currentQuestionerId && players.find(p => p.id === currentQuestionerId)?.name} {t('spy.isAsking')}...
            </p>
          </div>
        )}

        {/* Ask Question Section */}
        {canAsk && (
          <div className="mb-6">
            <label className="block text-white font-semibold mb-2">
              {t('spy.selectPlayer')}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {players
                .filter((p) => p.id !== currentUserId)
                .map((player) => (
                  <button
                    key={player.id}
                    onClick={() => setSelectedTarget(player.id)}
                    className={`p-3 rounded-xl font-semibold transition-all ${
                      selectedTarget === player.id
                        ? 'bg-purple-500 text-white shadow-lg scale-105'
                        : 'bg-white/20 text-white hover:bg-white/30'
                    }`}
                  >
                    {player.name}
                  </button>
                ))}
            </div>

            {selectedTarget && (
              <>
                <label className="block text-white font-semibold mb-2">
                  {t('spy.yourQuestion')}
                </label>
                <textarea
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder={t('spy.questionPlaceholder')}
                  className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border-2 border-white/30 focus:border-white/50 focus:outline-none resize-none"
                  rows={3}
                />
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleAskQuestion}
                    disabled={!questionText.trim()}
                    className={`flex-1 py-3 px-6 rounded-xl font-semibold text-white transition-all ${
                      questionText.trim()
                        ? 'bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg'
                        : 'bg-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {t('spy.askQuestion')}
                  </button>
                  <button
                    onClick={onSkipTurn}
                    className="px-6 py-3 rounded-xl font-semibold bg-white/20 text-white hover:bg-white/30 transition-all"
                  >
                    {t('spy.skipTurn')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Answer Question Section */}
        {canAnswer && (
          <div className="mb-6">
            <label className="block text-white font-semibold mb-2">
              {t('spy.yourAnswer')}
            </label>
            <textarea
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              placeholder={t('spy.answerPlaceholder')}
              className="w-full px-4 py-3 rounded-xl bg-white/20 text-white placeholder-white/60 border-2 border-white/30 focus:border-white/50 focus:outline-none resize-none"
              rows={3}
            />
            <button
              onClick={handleAnswerQuestion}
              disabled={!answerText.trim()}
              className={`w-full mt-4 py-3 px-6 rounded-xl font-semibold text-white transition-all ${
                answerText.trim()
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 shadow-lg'
                  : 'bg-gray-500 cursor-not-allowed'
              }`}
            >
              {t('spy.submitAnswer')}
            </button>
          </div>
        )}

        {/* Question History */}
        {questionHistory.length > 0 && (
          <div className="mt-6 border-t-2 border-white/20 pt-6">
            <h3 className="text-white font-semibold mb-3">{t('spy.questionHistory')}</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {questionHistory.slice(-5).map((qa, index) => (
                <div key={index} className="bg-black/20 rounded-xl p-4">
                  <div className="text-white text-sm mb-1">
                    <span className="font-semibold">{qa.askerName}</span> {t('spy.asked')}{' '}
                    <span className="font-semibold">{qa.targetName}</span>:
                  </div>
                  <div className="text-purple-200 text-sm mb-2">"{qa.question}"</div>
                  <div className="text-green-200 text-sm">"{qa.answer}"</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
