'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import Modal from './Modal'
import LoadingSpinner from './LoadingSpinner'

interface ReplayGamePlayer {
  userId: string
  username: string | null
  isBot: boolean
}

interface ReplaySnapshot {
  id: string
  turnNumber: number
  playerId: string | null
  actionType: string
  actionPayload: unknown
  state: unknown
  createdAt: string
}

interface ReplayData {
  game: {
    id: string
    lobbyName: string
    gameType: string
    players: ReplayGamePlayer[]
  }
  replay: {
    count: number
    snapshots: ReplaySnapshot[]
  }
}

interface ReplayViewerModalProps {
  gameId: string | null
  onClose: () => void
}

const REPLAY_SPEEDS = [0.5, 1, 2, 4]

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2)
  } catch {
    return String(value)
  }
}

function formatActionType(actionType: string): string {
  const normalized = actionType.replace(/[:_-]+/g, ' ').trim()
  if (!normalized) return 'Unknown action'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export default function ReplayViewerModal({ gameId, onClose }: ReplayViewerModalProps) {
  const { t } = useTranslation()
  const [data, setData] = useState<ReplayData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    if (!gameId) {
      setData(null)
      setLoading(false)
      setError(null)
      setIsPlaying(false)
      setCurrentIndex(0)
      return
    }

    const loadReplay = async () => {
      try {
        setLoading(true)
        setError(null)
        setIsPlaying(false)
        setCurrentIndex(0)
        setSpeed(1)

        const response = await fetch(`/api/game/${gameId}/replay`)
        if (!response.ok) {
          throw new Error('Failed to load replay')
        }

        const replayData: ReplayData = await response.json()
        setData(replayData)
      } catch (err) {
        clientLogger.error('Failed to load replay', err)
        setError(t('errors.failedToLoad'))
      } finally {
        setLoading(false)
      }
    }

    loadReplay()
  }, [gameId, t])

  const snapshots = data?.replay.snapshots ?? []
  const currentSnapshot = snapshots[currentIndex] ?? null

  useEffect(() => {
    if (!isPlaying || snapshots.length <= 1) return

    const intervalMs = Math.max(250, Math.round(1200 / speed))
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= snapshots.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, intervalMs)

    return () => clearInterval(interval)
  }, [isPlaying, snapshots.length, speed])

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const player of data?.game.players ?? []) {
      const fallback = player.isBot ? 'Bot' : 'Player'
      map.set(player.userId, player.username || fallback)
    }
    return map
  }, [data?.game.players])

  const actorLabel =
    currentSnapshot?.playerId ? playerNameById.get(currentSnapshot.playerId) || currentSnapshot.playerId : null

  function stepForward() {
    if (snapshots.length === 0) return
    setCurrentIndex((prev) => Math.min(snapshots.length - 1, prev + 1))
  }

  function stepBack() {
    if (snapshots.length === 0) return
    setCurrentIndex((prev) => Math.max(0, prev - 1))
  }

  function togglePlayPause() {
    if (snapshots.length <= 1) return
    if (currentIndex >= snapshots.length - 1) {
      setCurrentIndex(0)
    }
    setIsPlaying((prev) => !prev)
  }

  function onSeek(index: number) {
    if (Number.isNaN(index)) return
    const bounded = Math.max(0, Math.min(snapshots.length - 1, index))
    setCurrentIndex(bounded)
  }

  if (!gameId) return null

  return (
    <Modal
      isOpen={!!gameId}
      onClose={onClose}
      title={data?.game.lobbyName || t('profile.gameReplay.title')}
      maxWidth="2xl"
    >
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
          {error}
        </div>
      ) : !data || snapshots.length === 0 ? (
        <div className="text-center py-10 text-gray-600 dark:text-gray-300">
          {t('profile.gameReplay.noData')}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={togglePlayPause}
              className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              {isPlaying ? t('profile.gameReplay.pause') : t('profile.gameReplay.play')}
            </button>
            <button
              onClick={stepBack}
              className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
            >
              {t('profile.gameReplay.stepBack')}
            </button>
            <button
              onClick={stepForward}
              className="px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
            >
              {t('profile.gameReplay.stepForward')}
            </button>
            <label className="text-sm text-gray-600 dark:text-gray-300">
              {t('profile.gameReplay.speed')}:
            </label>
            <select
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
              className="px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
            >
              {REPLAY_SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
            <a
              href={`/api/game/${gameId}/replay?download=1`}
              className="ml-auto px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
            >
              {t('profile.gameReplay.download')}
            </a>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={Math.max(0, snapshots.length - 1)}
              value={currentIndex}
              onChange={(event) => onSeek(Number(event.target.value))}
              className="w-full"
            />
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {t('profile.gameReplay.stepOf', {
                current: currentIndex + 1,
                total: snapshots.length,
              })}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 space-y-2">
            <div className="text-sm text-gray-700 dark:text-gray-200">
              <span className="font-semibold">{t('profile.gameReplay.action')}:</span>{' '}
              {currentSnapshot ? formatActionType(currentSnapshot.actionType) : '-'}
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-200">
              <span className="font-semibold">{t('profile.gameReplay.player')}:</span>{' '}
              {actorLabel || t('profile.gameReplay.system')}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {currentSnapshot ? new Date(currentSnapshot.createdAt).toLocaleString() : ''}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                {t('profile.gameReplay.actionPayload')}
              </h4>
              <pre className="text-xs bg-gray-950 text-gray-100 rounded-lg p-3 overflow-auto max-h-72">
                {currentSnapshot ? toPrettyJson(currentSnapshot.actionPayload) : 'null'}
              </pre>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                {t('profile.gameReplay.state')}
              </h4>
              <pre className="text-xs bg-gray-950 text-gray-100 rounded-lg p-3 overflow-auto max-h-72">
                {currentSnapshot ? toPrettyJson(currentSnapshot.state) : 'null'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
