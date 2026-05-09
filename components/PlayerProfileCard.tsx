'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Modal from './Modal'

interface PlayerCardData {
  userId: string
  username: string | null
  image: string | null
  avatarUrl?: string | null
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
              <div className="w-14 h-14 rounded-full shrink-0" style={{ background: 'var(--bd-line)' }} />
              <div className="space-y-2 flex-1">
                <div className="h-4 rounded w-2/3" style={{ background: 'var(--bd-line)' }} />
                <div className="h-3 rounded w-1/3" style={{ background: 'var(--bd-line)' }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl" style={{ background: 'var(--bd-line)' }} />
              ))}
            </div>
          </div>
        ) : !data ? (
          <p className="text-center py-6 text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
            Profile unavailable
          </p>
        ) : (
          <>
            {/* Avatar + name */}
            <div className="flex items-center gap-3">
              {(data.avatarUrl || data.image) ? (
                <img
                  src={data.avatarUrl ?? data.image!}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover shrink-0"
                  style={{ outline: '2px solid var(--bd-line)' }}
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl shrink-0"
                  style={{ background: 'var(--bd-ink)', color: 'var(--bd-sun)' }}
                >
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base truncate" style={{ color: 'var(--bd-ink)' }}>
                    {data.username ?? 'Unknown'}
                  </span>
                  {data.isGuest && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
                    >
                      Guest
                    </span>
                  )}
                </div>
                {data.publicProfileId && (
                  <Link
                    href={`/u/${data.publicProfileId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:underline"
                    style={{ color: 'var(--bd-coral)' }}
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
                    className="rounded-xl p-3 text-center"
                    style={{ background: 'var(--bd-bg2)', border: '1px solid var(--bd-line)' }}
                  >
                    <div className="text-xl font-bold" style={{ color: 'var(--bd-ink)' }}>{value}</div>
                    <div className="text-[10px] font-medium mt-0.5" style={{ color: 'var(--bd-ink-muted)' }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Favourite game */}
            {!data.isGuest && gameLabel && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--bd-ink-soft)' }}>
                <span>Favourite:</span>
                <span className="font-semibold" style={{ color: 'var(--bd-ink)' }}>
                  {gameLabel.emoji} {gameLabel.name}
                </span>
              </div>
            )}

            {/* Friend action */}
            {!data.isGuest && data.relation !== 'self' && status === 'authenticated' && (
              <div>
                {data.relation === 'friends' ? (
                  <p className="text-sm font-semibold" style={{ color: '#22C55E' }}>
                    ✓ Friends
                  </p>
                ) : data.relation === 'request_sent' ? (
                  <p className="text-sm font-semibold" style={{ color: 'var(--bd-ink-soft)' }}>📨 Request sent</p>
                ) : data.relation === 'request_received' ? (
                  <p className="text-sm font-semibold" style={{ color: 'var(--bd-sun)' }}>📩 Friend request received</p>
                ) : data.relation === 'can_send' ? (
                  <button
                    onClick={handleAddFriend}
                    disabled={friendState === 'loading'}
                    className="w-full py-2 px-4 text-white rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60 hover:opacity-80"
                    style={{ background: 'var(--bd-ink)', boxShadow: '0 3px 0 var(--bd-coral)' }}
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
