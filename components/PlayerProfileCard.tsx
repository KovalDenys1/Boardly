'use client'

import { useState, useEffect, useCallback } from 'react'
import { Icon } from '@/components/icons'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Modal from './Modal'
import GameIcon from '@/components/GameIcon'
import { useTranslation } from '@/lib/i18n-helpers'
import { getGameMetadata } from '@/lib/game-catalog'

interface PlayerCardData {
  userId: string
  username: string | null
  image: string | null
  avatarUrl?: string | null
  publicProfileId: string | null
  isGuest: boolean
  isPremium: boolean
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


export default function PlayerProfileCard({ userId, onClose }: PlayerProfileCardProps) {
  const { t } = useTranslation()
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
  const favouriteMeta = data?.favouriteGame ? getGameMetadata(data.favouriteGame) : null
  const gameLabel = favouriteMeta
    ? { svgId: favouriteMeta.svgId, accentColor: favouriteMeta.accentColor, name: favouriteMeta.name }
    : null
  const isOpen = !!userId

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm">
      <div className="p-5 space-y-4 relative">
        <button
          onClick={onClose}
          className="absolute top-0 right-0 flex h-7 w-7 items-center justify-center rounded-full text-lg transition-colors hover:bg-[var(--bd-bg2)]"
          style={{ color: 'var(--bd-ink-soft)' }}
          aria-label={t('common.close')}
        >
          ×
        </button>
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
            {t('profile.playerCard.unavailable')}
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
                  <span className={`font-bold text-base truncate ${data.isPremium ? 'text-amber-500' : ''}`} style={data.isPremium ? {} : { color: 'var(--bd-ink)' }}>
                    {data.username ?? t('game.ui.playerFallback')}
                  </span>
                  {data.isPremium && (
                    <Icon name="crown" size={16} tone="premium" label="Premium" />
                  )}
                  {data.isGuest && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
                    >
                      {t('profile.playerCard.guestBadge')}
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
                    {t('profile.playerCard.viewFullProfile')}
                  </Link>
                )}
              </div>
            </div>

            {/* Stats */}
            {!data.isGuest && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: t('header.games'), value: data.gamesPlayed },
                  { label: t('profile.stats.dashboard.summary.wins'), value: data.wins },
                  { label: t('profile.stats.dashboard.summary.winRate'), value: `${data.winRate}%` },
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
                <span>{t('profile.playerCard.favourite')}</span>
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--bd-ink)' }}>
                  <GameIcon gameId={gameLabel.svgId} accentColor={gameLabel.accentColor} size={16} variant="bare" />
                  {gameLabel.name}
                </span>
              </div>
            )}

            {/* Friend action */}
            {!data.isGuest && data.relation !== 'self' && status === 'authenticated' && (
              <div>
                {data.relation === 'friends' ? (
                  <p className="text-sm font-semibold" style={{ color: '#22C55E' }}>
                    <Icon name="check" size={14} /> {t('profile.friends.tabs.friends')}
                  </p>
                ) : data.relation === 'request_sent' ? (
                  <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--bd-ink-soft)' }}><Icon name="mail" size={15} /> {t('profile.playerCard.requestSent')}</p>
                ) : data.relation === 'request_received' ? (
                  <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--bd-sun)' }}><Icon name="mail" size={15} /> {t('profile.playerCard.requestReceived')}</p>
                ) : data.relation === 'can_send' ? (
                  <button
                    onClick={handleAddFriend}
                    disabled={friendState === 'loading'}
                    className="w-full py-2 px-4 text-white rounded-xl text-sm font-semibold transition-opacity disabled:opacity-60 hover:opacity-80"
                    style={{ background: 'var(--bd-ink)', boxShadow: '0 3px 0 var(--bd-coral)' }}
                  >
                    {friendState === 'loading' ? t('profile.sending') : `+ ${t('profile.friends.addFriend')}`}
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
