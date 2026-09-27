'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Icon } from '@/components/icons'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Modal from './Modal'
import GameIcon from '@/components/GameIcon'
import { ReportForm } from '@/components/ReportDialog'
import { useTranslation } from '@/lib/i18n-helpers'
import { getGameMetadata } from '@/lib/game-catalog'
import { fetchWithGuest, getGuestData } from '@/lib/client/fetch-with-guest'
import type { ReportTarget } from '@/lib/content-reports'

interface PlayerCardData {
  userId: string
  username: string | null
  image: string | null
  avatarUrl?: string | null
  publicProfileId: string | null
  isGuest: boolean
  isPremium: boolean
  /**
   * A profile the viewer may not see (#1226): the card has the username, the picture
   * only for someone who shared a lobby with the player, and no statistics.
   */
  restricted?: boolean
  gamesPlayed?: number
  wins?: number
  winRate?: number
  favouriteGame?: string | null
  relation: 'self' | 'friends' | 'request_sent' | 'request_received' | 'can_send' | 'login_required'
}

/** Where the card was opened, for the Report action (#1172). */
export interface PlayerReportContext {
  lobbyCode?: string
  /** Sketch & Guess: the round this player is drawing, offered as a report target. */
  drawing?: { gameId: string; round: number } | null
}

interface PlayerProfileCardProps {
  userId: string | null
  onClose: () => void
  reportContext?: PlayerReportContext
}


export default function PlayerProfileCard({ userId, onClose, reportContext }: PlayerProfileCardProps) {
  const { t } = useTranslation()
  const { data: session, status } = useSession()
  const [data, setData] = useState<PlayerCardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [friendState, setFriendState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [view, setView] = useState<'card' | 'report'>('card')
  // Back from the report form, focus returns to the card's heading: the Report
  // button that had it was unmounted with the card view.
  const nameRef = useRef<HTMLHeadingElement>(null)
  const returningFromReport = useRef(false)
  useEffect(() => {
    if (view === 'card' && returningFromReport.current) {
      returningFromReport.current = false
      nameRef.current?.focus()
    }
  }, [view])
  const backToCard = useCallback(() => {
    returningFromReport.current = true
    setView('card')
  }, [])

  const fetchCard = useCallback(async (id: string) => {
    setLoading(true)
    setData(null)
    setFriendState('idle')
    setView('card')
    try {
      // With the guest token, so a guest who shares a lobby with the player is known as one.
      const res = await fetchWithGuest(`/api/users/${id}/card`)
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

  // The viewer, signed in or guest. Guests get `relation: 'login_required'` even on
  // their own card, so the id is compared as well; the server refuses a self-report
  // whatever this says.
  const viewerId = session?.user?.id ?? (status === 'authenticated' ? null : getGuestData()?.guestId ?? null)
  const reportTargets = useMemo<ReportTarget[]>(() => {
    if (!data || !viewerId || data.userId === viewerId || data.relation === 'self') return []
    const lobbyCode = reportContext?.lobbyCode
    const targets: ReportTarget[] = []
    if (reportContext?.drawing) {
      targets.push({ targetType: 'drawing', targetId: reportContext.drawing.gameId, round: reportContext.drawing.round, lobbyCode })
    }
    if (data.username) targets.push({ targetType: 'username', targetId: data.userId, lobbyCode })
    if (data.image || data.avatarUrl) targets.push({ targetType: 'avatar', targetId: data.userId, lobbyCode })
    return targets
  }, [data, viewerId, reportContext?.lobbyCode, reportContext?.drawing])

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
        {view === 'report' && reportTargets.length > 0 ? (
          <ReportForm targets={reportTargets} onDone={onClose} onBack={backToCard} focusHeadingOnMount />
        ) : loading ? (
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
                  <h2
                    ref={nameRef}
                    tabIndex={-1}
                    className={`font-bold text-base truncate focus:outline-none ${data.isPremium ? 'text-amber-500' : ''}`}
                    style={data.isPremium ? {} : { color: 'var(--bd-ink)' }}
                  >
                    {data.username ?? t('game.ui.playerFallback')}
                  </h2>
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

            {data.restricted && (
              <p
                data-testid="player-card-private"
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                style={{ background: 'var(--bd-bg2)', color: 'var(--bd-ink-soft)' }}
              >
                <Icon name="lock" size={14} />
                {t('profile.publicProfile.privateTitle')}
              </p>
            )}

            {/* Stats */}
            {!data.isGuest && !data.restricted && (
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: t('header.games'), value: data.gamesPlayed ?? 0 },
                  { label: t('profile.stats.dashboard.summary.wins'), value: data.wins ?? 0 },
                  { label: t('profile.stats.dashboard.summary.winRate'), value: `${data.winRate ?? 0}%` },
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
            {!data.isGuest && !data.restricted && gameLabel && (
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

            {/* Report (#1172): quiet, at the foot of the card, never the first thing. */}
            {reportTargets.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setView('report')}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold transition-colors hover:bg-[var(--bd-bg2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ color: 'var(--bd-ink-muted)' }}
                >
                  <Icon name="flag" size={13} />
                  {t('report.reportPlayer')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
