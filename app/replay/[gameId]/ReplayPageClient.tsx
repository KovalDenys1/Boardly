'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import GamePlayerCard from '@/components/game-chrome/GamePlayerCard'
import GameScoreboardHeader from '@/components/game-chrome/GameScoreboardHeader'
import { Icon } from '@/components/icons'
import LoadingSpinner from '@/components/LoadingSpinner'
import ReplayPlayerRail from '@/components/replay/ReplayPlayerRail'
import ReplayTransport, { REPLAY_SPEEDS } from '@/components/replay/ReplayTransport'
import { loadReplayRenderer } from '@/components/replay/registry'
import { clientLogger } from '@/lib/client-logger'
import { getGameMetadata } from '@/lib/game-catalog'
import { gameNameKey } from '@/lib/game-name-key'
import { useTranslation } from '@/lib/i18n-helpers'
import { describeStep } from '@/lib/replay/captions'
import { groupSteps } from '@/lib/replay/group-steps'
import { activeSeatId, buildSeats, winnerSeatId, type ReplayApiPlayer } from '@/lib/replay/seats'
import type { ReplayContext, ReplayRendererProps, ReplaySnapshotInput } from '@/lib/replay/types'

interface ReplayPayload {
  game: { id: string; gameType: string; lobbyName: string; players: ReplayApiPlayer[] }
  viewer: { isPremium: boolean }
  replay: { count: number; snapshots: ReplaySnapshotInput[] }
}

const BASE_INTERVAL_MS = 1200
const SEAT_COLORS = ['var(--bd-coral)', 'var(--bd-lav)', 'var(--bd-sun)', 'var(--bd-mint)']

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable
}

export default function ReplayPageClient({ gameId }: { gameId: string }) {
  const { status, data: session } = useSession()
  const router = useRouter()
  const { t } = useTranslation()
  const [payload, setPayload] = useState<ReplayPayload | null>(null)
  const [error, setError] = useState<'notFound' | 'failed' | null>(null)
  const [Renderer, setRenderer] = useState<ComponentType<ReplayRendererProps> | null>(null)
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)

  useEffect(() => {
    if (status === 'unauthenticated') router.push(`/auth/login?returnUrl=/replay/${gameId}`)
  }, [status, router, gameId])

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    ;(async () => {
      try {
        const response = await fetch(`/api/game/${gameId}/replay`)
        if (!response.ok) {
          if (!cancelled) setError(response.status === 404 || response.status === 403 || response.status === 409 ? 'notFound' : 'failed')
          return
        }
        const data: ReplayPayload = await response.json()
        if (cancelled) return
        setPayload(data)
        const renderer = await loadReplayRenderer(data.game.gameType)
        if (!cancelled) setRenderer(() => renderer)
      } catch (err) {
        clientLogger.error('Error loading replay:', err)
        if (!cancelled) setError('failed')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameId, status])

  const gameType = payload?.game.gameType ?? ''
  const steps = useMemo(() => (payload ? groupSteps(gameType, payload.replay.snapshots) : []), [payload, gameType])
  const seats = useMemo(
    () => (payload ? buildSeats(payload.game.players, steps[0]?.state ?? null, t('profile.gameReplay.playerFallback')) : []),
    [payload, steps, t],
  )
  const ctx = useMemo<ReplayContext>(
    () => ({ seats, playerNameById: new Map(seats.map((seat) => [seat.userId, seat.name])), viewerId: session?.user?.id ?? null }),
    [seats, session?.user?.id],
  )

  const count = steps.length
  const step = steps[Math.min(index, Math.max(0, count - 1))]
  const isFinalStep = count > 0 && index >= count - 1
  const caption = step ? (() => {
    const c = describeStep(gameType, step, ctx)
    return t(c.key, c.params)
  })() : ''

  const seek = useCallback((next: number) => {
    setIndex(Math.max(0, Math.min(count - 1, next)))
  }, [count])

  useEffect(() => {
    if (!playing) return
    if (index >= count - 1) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setIndex((i) => Math.min(count - 1, i + 1)), BASE_INTERVAL_MS / speed)
    return () => clearTimeout(id)
  }, [playing, index, count, speed])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          setPlaying(false)
          seek(index + 1)
          break
        case 'ArrowLeft':
          event.preventDefault()
          setPlaying(false)
          seek(index - 1)
          break
        case 'Home':
          event.preventDefault()
          setPlaying(false)
          seek(0)
          break
        case 'End':
          event.preventDefault()
          setPlaying(false)
          seek(count - 1)
          break
        case ' ':
          event.preventDefault()
          setPlaying((p) => !p)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, count, seek])

  if (status === 'loading' || status === 'unauthenticated' || (!payload && !error)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !payload || !step) {
    return (
      <div className="bd-page page-shell items-center justify-center px-4">
        <div className="max-w-md rounded-[1.75rem] border-[1.5px] border-bd-line bg-bd-card-warm p-6 text-center shadow-bd-soft">
          <p className="text-lg font-bold text-bd-ink">{error === 'failed' ? t('profile.gameReplay.loadFailed') : t('profile.gameReplay.noData')}</p>
          <Link href="/profile?tab=history" className="mt-4 inline-flex items-center gap-2 rounded-2xl border-[1.5px] border-bd-line bg-bd-bg px-4 py-2.5 text-sm font-semibold text-bd-ink hover:bg-bd-bg2">
            <Icon name="arrow-left" size={16} />
            {t('profile.gameReplay.backToHistory')}
          </Link>
        </div>
      </div>
    )
  }

  const meta = getGameMetadata(gameType)
  const nameKey = gameNameKey(gameType)
  const gameName = nameKey ? t(nameKey) : gameType
  const activeId = activeSeatId(step.state)
  const winnerId = isFinalStep ? winnerSeatId(step.state) : null
  const backLink = (
    <Link
      href="/profile?tab=history"
      className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-[1.5px] border-bd-line bg-bd-bg px-3 text-sm font-semibold text-bd-ink hover:bg-bd-bg2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav/50"
    >
      <Icon name="arrow-left" size={16} />
      <span className="hidden sm:inline">{t('profile.gameReplay.backToHistory')}</span>
    </Link>
  )
  const center = (
    <div className="min-w-0 text-center">
      <p className="truncate font-display text-base font-bold text-bd-ink sm:text-lg">{gameName}</p>
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-bd-ink-muted">
        {t('profile.gameReplay.stepCounter', { current: index + 1, total: count })}
      </p>
    </div>
  )
  const card = (seat: (typeof seats)[number], side: 'left' | 'right') => (
    <GamePlayerCard
      name={seat.name}
      isActive={seat.userId === activeId}
      isMe={seat.userId === ctx.viewerId}
      isWinner={seat.userId === winnerId}
      side={side}
      accentColor={side === 'left' ? (meta?.accentColor ?? SEAT_COLORS[0]) : SEAT_COLORS[1]}
      userId={seat.userId}
    />
  )

  return (
    <div className="bd-page page-shell">
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="shrink-0 rounded-[1.5rem] border-[1.5px] border-bd-line bg-bd-card-warm p-3 shadow-bd-soft sm:p-4">
          {seats.length <= 2 && seats.length > 0 ? (
            <GameScoreboardHeader
              leftCard={card(seats[0], 'left')}
              center={center}
              rightCard={seats[1] ? card(seats[1], 'right') : <span />}
              trailing={backLink}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                {center}
                {backLink}
              </div>
              <ReplayPlayerRail seats={seats} activeId={activeId} winnerId={winnerId} viewerId={ctx.viewerId} />
            </div>
          )}
        </div>

        <div className="ttt-board-card flex-1" data-testid="replay-board">
          {Renderer ? (
            <div className="flex max-h-full max-w-full items-center justify-center overflow-auto">
              <Renderer step={step} isFinalStep={isFinalStep} {...ctx} />
            </div>
          ) : (
            <p className="max-w-md px-6 text-center font-display text-2xl font-bold text-bd-ink">{caption}</p>
          )}
        </div>

        <p aria-live="polite" className="h-6 shrink-0 truncate text-center text-sm font-semibold text-bd-ink" data-testid="replay-caption">
          {caption}
        </p>

        <ReplayTransport
          index={index}
          count={count}
          playing={playing}
          speed={speed}
          caption={caption}
          onSeek={(next) => {
            setPlaying(false)
            seek(next)
          }}
          onTogglePlay={() => setPlaying((p) => !p)}
          onCycleSpeed={() => setSpeed((s) => REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(s as (typeof REPLAY_SPEEDS)[number]) + 1) % REPLAY_SPEEDS.length])}
        />

        {(payload.viewer.isPremium || process.env.NODE_ENV !== 'production') && (
          <div className="flex shrink-0 items-center justify-center gap-4 pb-1 text-xs text-bd-ink-muted">
            {payload.viewer.isPremium && (
              <a href={`/api/game/${gameId}/replay?download=1`} className="font-semibold underline-offset-2 hover:underline">
                {t('profile.gameReplay.download')}
              </a>
            )}
            {process.env.NODE_ENV !== 'production' && (
              <details className="max-w-full">
                <summary className="cursor-pointer">{t('profile.gameReplay.advancedDetails')}</summary>
                <pre className="mt-2 max-h-48 max-w-full overflow-auto rounded-xl bg-bd-bg2 p-3 text-left text-[11px] text-bd-ink-soft">{JSON.stringify({ action: step.actionType, payload: step.payload, state: step.state }, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
