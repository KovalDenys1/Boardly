'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Modal from './Modal'

interface PlayerCardData {
  userId: string
  username: string | null
  image: string | null
  publicProfileId: string | null
  isGuest: boolean
  gamesPlayed: number
  wins: number
  winRate: number
  favouriteGame: string | null
  relation: 'self' | 'friends' | 'request_sent' | 'request_received' | 'can_send' | 'login_required'
}

interface PlayerProfileCardProps {
  userId: string | null
  onClose: () => void
}

const GAME_LABELS: Record<string, { emoji: string; name: string }> = {
  yahtzee:           { emoji: '🎲', name: 'Yahtzee' },
  guess_the_spy:     { emoji: '🕵️', name: 'Guess the Spy' },
  tic_tac_toe:       { emoji: '❌', name: 'Tic-Tac-Toe' },
  memory:            { emoji: '🧠', name: 'Memory' },
  rock_paper_scissors: { emoji: '✊', name: 'Rock Paper Scissors' },
  alias:             { emoji: '🗣️', name: 'Alias' },
  liars_party:       { emoji: '🎭', name: "Liar's Party" },
}

export default function PlayerProfileCard({ userId, onClose }: PlayerProfileCardProps) {
  const { status } = useSession()
  const [data, setData] = useState<PlayerCardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [friendState, setFriendState] = useState<'idle' | 'loading' | 'done'>('idle')

  const fetchCard = useCallback(async (id: string) => {
    setLoading(true)
    setData(null)
    setFriendState('idle')
    try {
      const res = await fetch(`/api/users/${id}/card`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (userId) fetchCard(userId)
  }, [userId, fetchCard])

  const handleAddFriend = async () => {
    if (!data?.username || friendState !== 'idle') return
    setFriendState('loading')
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverUsername: data.username }),
      })
      if (res.ok) {
        setData((prev) => prev ? { ...prev, relation: 'request_sent' } : prev)
        setFriendState('done')
      } else {
        setFriendState('idle')
      }
    } catch {
      setFriendState('idle')
    }
  }

  const initials = data?.username?.slice(0, 2).toUpperCase() ?? '?'
  const gameLabel = data?.favouriteGame ? GAME_LABELS[data.favouriteGame] : null
  const isOpen = !!userId

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="p-5 space-y-4">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          </div>
        ) : !data ? (
          <p className="text-center text-gray-500 dark:text-gray-400 py-6 text-sm">
            Profile unavailable
          </p>
        ) : (
          <>
            {/* Avatar + name */}
            <div className="flex items-center gap-3">
              {data.image ? (
                <img
                  src={data.image}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-700 shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shrink-0">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-gray-900 dark:text-white text-base truncate">
                    {data.username ?? 'Unknown'}
                  </span>
                  {data.isGuest && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                      Guest
                    </span>
                  )}
                </div>
                {data.publicProfileId && (
                  <Link
                    href={`/u/${data.publicProfileId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                    onClick={onClose}
                  >
                    View full profile →
                  </Link>
                )}
              </div>
            </div>

            {/* Stats */}
            {!data.isGuest && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Games', value: data.gamesPlayed },
                  { label: 'Wins', value: data.wins },
                  { label: 'Win rate', value: `${data.winRate}%` },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center"
                  >
                    <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Favourite game */}
            {!data.isGuest && gameLabel && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span>Favourite:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {gameLabel.emoji} {gameLabel.name}
                </span>
              </div>
            )}

            {/* Friend action */}
            {!data.isGuest && data.relation !== 'self' && status === 'authenticated' && (
              <div>
                {data.relation === 'friends' ? (
                  <p className="text-sm text-green-600 dark:text-green-400 font-semibold">
                    ✓ Friends
                  </p>
                ) : data.relation === 'request_sent' ? (
                  <p className="text-sm text-blue-500 font-semibold">📨 Request sent</p>
                ) : data.relation === 'request_received' ? (
                  <p className="text-sm text-orange-500 font-semibold">📩 Friend request received</p>
                ) : data.relation === 'can_send' ? (
                  <button
                    onClick={handleAddFriend}
                    disabled={friendState === 'loading'}
                    className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    {friendState === 'loading' ? 'Sending…' : '+ Add Friend'}
                  </button>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
