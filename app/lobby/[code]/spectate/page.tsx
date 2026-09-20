'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import dynamic from 'next/dynamic'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { useTranslation } from '@/lib/i18n-helpers'
import { Icon } from '@/components/icons'
import { getSupabaseClient } from '@/lib/supabase-client'
import { acquireLobbyChannel } from '@/lib/lobby-channel-registry'
import { restoreGameEngineClient } from '@/lib/restore-game-engine-client'
import LoadingSpinner from '@/components/LoadingSpinner'
import type { Lobby, Game, GamePlayer } from '@/types/game'
import type { GameState } from '@/lib/game-engine'
import type { YahtzeeGame } from '@/lib/games/yahtzee-game'

const ConnectFourLobbyPage = dynamic(() => import('../connect-four-page'), { ssr: false })
const TicTacToeLobbyPage = dynamic(() => import('../tic-tac-toe-page'), { ssr: false })
const RockPaperScissorsLobbyPage = dynamic(() => import('../rock-paper-scissors-page'), { ssr: false })
const AliasPage = dynamic(() => import('../alias-page'), { ssr: false })
const LiarsPartyPage = dynamic(() => import('../liars-party-page'), { ssr: false })
const SketchAndGuessLobbyPage = dynamic(() => import('../sketch-and-guess-page'), { ssr: false })
const MemoryGameBoard = dynamic(() => import('../components/MemoryGameBoard'), { ssr: false })
const SpyGameBoard = dynamic(() => import('../components/SpyGameBoard'), { ssr: false })
const YahtzeeGameBoard = dynamic(() => import('../components/YahtzeeGameBoard'), { ssr: false })
const Scorecard = dynamic(() => import('@/components/Scorecard'), { ssr: false })

const DEDICATED_SPECTATOR_GAMES = new Set(['connect_four', 'tic_tac_toe', 'rock_paper_scissors', 'alias', 'liars_party', 'sketch_and_guess'])

type SpectatorUser = {
  userId: string
  username: string
}

type SpectatorLobbyResponse = {
  lobby: Lobby
  activeGame: Game | null
  canJoinAsPlayer: boolean
  // The broadcast topic to subscribe to. It carries a per-lobby secret, and the
  // snapshot request is what earns it: a lobby with spectators switched off
  // never returns one, so its state is no longer readable by guessing the
  // four-digit code (#845).
  realtimeTopic?: string
}

type SpectatorChatMessage = {
  id: string
  userId: string
  username: string
  lobbyCode: string
  message: string
  timestamp?: number
}

function SpectatorTopBar({
  spectatorCount,
  canJoinAsPlayer,
  joiningAsPlayer,
  onJoinAsPlayer,
  lobbyCode,
  isAdminView,
  isMidMatch,
}: {
  spectatorCount: number
  canJoinAsPlayer: boolean
  joiningAsPlayer: boolean
  onJoinAsPlayer: () => void
  lobbyCode: string
  isAdminView?: boolean
  isMidMatch?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: isAdminView ? 'rgba(124,58,237,0.92)' : 'rgba(31,27,22,0.92)',
      backdropFilter: 'blur(8px)',
      borderBottom: '1px solid rgba(255,255,255,0.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 16px',
      gap: 12,
      flexWrap: 'wrap',
    }}>
      <span style={{
        color: 'white', fontSize: 13, fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Icon name={isAdminView ? 'shield' : 'eye'} size={14} />
        {isAdminView ? t('spectate.adminViewBanner') : t('spectate.watchingCount', { count: spectatorCount })}
      </span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canJoinAsPlayer && (
          <button
            type="button"
            onClick={onJoinAsPlayer}
            disabled={joiningAsPlayer}
            style={{
              padding: '6px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700,
              background: 'var(--bd-coral)', color: 'white', border: 'none',
              cursor: joiningAsPlayer ? 'not-allowed' : 'pointer',
              opacity: joiningAsPlayer ? 0.65 : 1,
              fontFamily: 'inherit',
            }}
          >
            {joiningAsPlayer ? t('spectate.joining') : isMidMatch ? t('spectate.joinNextGame') : t('spectate.joinAsPlayer')}
          </button>
        )}
        <a
          href={`/lobby/${lobbyCode}`}
          style={{
            padding: '6px 14px', borderRadius: 12, fontSize: 13, fontWeight: 600,
            background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.18)', textDecoration: 'none',
            fontFamily: 'inherit',
          }}
        >
          {t('spectate.backToLobbies')}
        </a>
      </div>
    </div>
  )
}

/**
 * Chat for spectate paths that render a real game board full-page (the 6
 * DEDICATED_SPECTATOR_GAMES plus memory/yahtzee/guess_the_spy since #672
 * moved them onto the same real-board pattern) — those pages own their own
 * layout, so chat can't be docked in a sidebar like the generic fallback
 * shell below. A floating collapsible widget avoids touching 9 separate page
 * layouts just to add one shared feature (#653).
 */
function FloatingSpectatorChat({
  isAuthenticated,
  isAdminView,
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendMessage,
}: {
  isAuthenticated: boolean
  isAdminView: boolean
  chatMessages: SpectatorChatMessage[]
  chatInput: string
  onChatInputChange: (value: string) => void
  onSendMessage: (e: React.FormEvent) => void
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  if (!isAuthenticated) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t('spectate.chatTitle')}
        style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 60,
          width: 48, height: 48, borderRadius: 999,
          background: 'var(--bd-ink)', color: 'var(--bd-bg)',
          border: 'none', cursor: 'pointer', fontSize: 20,
          display: 'grid', placeItems: 'center',
          boxShadow: '0 6px 16px -4px rgba(31,27,22,0.4)',
        }}
      >
        <Icon name={isOpen ? 'close' : 'chat'} size={18} />
        {!isOpen && chatMessages.length > 0 && (
          <span aria-hidden style={{
            position: 'absolute', top: -2, right: -2,
            width: 12, height: 12, borderRadius: 999,
            background: 'var(--bd-coral)', border: '2px solid var(--bd-bg)',
          }} />
        )}
      </button>
      {isOpen && (
        <div
          className="bd-card"
          style={{
            position: 'fixed', bottom: 72, right: 16, zIndex: 60,
            width: 300, maxWidth: 'calc(100vw - 32px)',
            display: 'flex', flexDirection: 'column', padding: 16,
          }}
        >
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-bd-ink-muted">{t('spectate.chatTitle')}</h2>
          <div className="mb-3 max-h-48 min-h-[80px] space-y-2 overflow-auto rounded-xl border border-bd-line bg-bd-card-warm p-3">
            {chatMessages.length === 0 && (
              <p className="text-sm text-bd-ink-muted">{t('chat.noMessages')}</p>
            )}
            {chatMessages.map((message) => (
              <div key={message.id} className="text-sm">
                <span className="font-semibold text-bd-ink">{message.username}: </span>
                <span className="text-bd-ink-soft">{message.message}</span>
              </div>
            ))}
          </div>
          {!isAdminView && (
            <form onSubmit={onSendMessage} className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => onChatInputChange(e.target.value)}
                placeholder={t('spectate.chatPlaceholder')}
                maxLength={500}
                className="bd-input min-w-0 flex-1 text-sm"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="bd-btn bd-btn-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('chat.send')}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  )
}

function ReadOnlySpectatorBoard({
  parsedState,
}: {
  parsedState: Record<string, any> | null
}) {
  const { t } = useTranslation()
  if (!parsedState) {
    return <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-4 text-sm font-medium text-bd-ink-muted">{t('spectate.gameUnavailable')}</div>
  }
  return <div className="rounded-2xl border border-bd-line bg-bd-card-warm p-4 text-sm font-medium text-bd-ink-muted">{t('spectate.noViewForGame')}</div>
}

export default function SpectatorLobbyPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session } = useSession()
  const { isGuest, guestToken, guestName, guestId } = useGuest()
  const { t } = useTranslation()
  const code = String(params.code || '').toUpperCase()

  const [data, setData] = useState<SpectatorLobbyResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [spectators, setSpectators] = useState<SpectatorUser[]>([])
  const [spectatorCount, setSpectatorCount] = useState(0)
  const [joiningAsPlayer, setJoiningAsPlayer] = useState(false)
  const [chatMessages, setChatMessages] = useState<SpectatorChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const gameChannelRef = useRef<RealtimeChannel | null>(null)
  const spectatorCountDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isPlayerInGame, setIsPlayerInGame] = useState(false)
  const [isLimitReached, setIsLimitReached] = useState(false)
  const [isAdminView, setIsAdminView] = useState(false)
  const [yahtzeeEngine, setYahtzeeEngine] = useState<YahtzeeGame | null>(null)

  const parsedState = useMemo(() => {
    const raw = data?.activeGame?.state
    if (typeof raw !== 'string') return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }, [data?.activeGame?.state])

  const loadSnapshot = useCallback(async () => {
    if (!code) return
    try {
      // Read at call time (not render time) — on a client-side transition,
      // window.location.search may not reflect the new URL yet during the
      // synchronous render pass, but is always settled by the time effects run.
      const adminViewRequested = new URLSearchParams(window.location.search).get('admin') === '1'

      const request = (asAdmin: boolean) =>
        fetchWithGuest(`/api/lobby/${code}/spectate${asAdmin ? '?adminView=true' : ''}`, {
          cache: 'no-store',
        })

      let res = await request(adminViewRequested)
      let json = await res.json()

      // An admin reaching this page from an ordinary Watch button never asked
      // for admin view, so a lobby with spectating disabled or full used to
      // dead-end them. Retry once as admin instead of maintaining two separate
      // Watch buttons; the API re-checks the role against the database, so a
      // stale client-side role only costs one wasted request.
      const isAdmin = session?.user?.role === 'admin'
      const retryableAsAdmin =
        json?.code === 'SPECTATOR_LIMIT_REACHED' || res.status === 403
      if (!res.ok && !adminViewRequested && isAdmin && retryableAsAdmin) {
        res = await request(true)
        json = await res.json()
      }

      if (!res.ok) {
        if (json?.code === 'PLAYER_IN_GAME') {
          setIsPlayerInGame(true)
          setLoading(false)
          return
        }
        if (json?.code === 'SPECTATOR_LIMIT_REACHED') {
          setIsLimitReached(true)
          setLoading(false)
          return
        }
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      setData(json)
      setSpectatorCount(json?.lobby?.spectatorCount ?? 0)
      setIsAdminView(json?.isAdminView === true)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load spectator view')
    } finally {
      setLoading(false)
    }
  }, [code, session?.user?.role])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  // Polling fallback — safety net for network glitches; realtime handles normal updates
  useEffect(() => {
    const id = setInterval(() => void loadSnapshot(), 30000)
    return () => clearInterval(id)
  }, [loadSnapshot])

  // Subscribe to lobby broadcast for realtime game state updates (legacy games: memory, yahtzee, spy)
  const realtimeTopic = data?.realtimeTopic
  useEffect(() => {
    if (!code || !realtimeTopic) return
    // Shared with the game component this page mounts for the dedicated game
    // types — one subscribe, one teardown, whoever gets there first (#1000).
    const reload = () => void loadSnapshot()
    const lobbyChannel = acquireLobbyChannel(realtimeTopic, {
      events: {
        'game-update': reload,
        'game-started': reload,
        'player-left': reload,
      },
    })
    gameChannelRef.current = lobbyChannel.channel
    return () => {
      lobbyChannel.release()
      gameChannelRef.current = null
    }
  }, [code, realtimeTopic, loadSnapshot])

  // Supabase Realtime: Presence for spectator list, Broadcast for spectator chat
  useEffect(() => {
    if (!code) return

    const userId = session?.user?.id ?? (isGuest ? guestId : null)
    const username = session?.user?.name ?? (isGuest ? (guestName ?? 'Guest') : null)

    const supabase = getSupabaseClient()
    const channel = supabase.channel(`spectators:${code}`, {
      config: {
        presence: { key: userId ?? 'anon' },
        broadcast: { self: false },
      },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string; username: string }>()
        const all = Object.values(state).flat()
        const newCount = all.length
        setSpectators(all.map((s) => ({ userId: s.userId, username: s.username })))
        setSpectatorCount(newCount)

        // Broadcast live count to lobby channel so players see it update in real time
        if (gameChannelRef.current) {
          void gameChannelRef.current.send({
            type: 'broadcast',
            event: 'spectator-count-update',
            payload: { count: newCount },
          })
        }

        // Debounced DB sync so lobby list shows accurate count
        if (spectatorCountDebounceRef.current !== null) {
          clearTimeout(spectatorCountDebounceRef.current)
        }
        spectatorCountDebounceRef.current = setTimeout(() => {
          spectatorCountDebounceRef.current = null
          void fetchWithGuest(`/api/lobby/${code}/spectator-count`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: newCount }),
          })
        }, 2000)
      })
      .on('broadcast', { event: 'spectator-chat' }, ({ payload }: { payload: SpectatorChatMessage }) => {
        if (!payload?.id || !payload?.message) return
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === payload.id)) return prev
          return [...prev, payload].slice(-100)
        })
      })
      .subscribe(async (status) => {
        // Admin-view never tracks presence — stays invisible to the spectator
        // count/list while still receiving sync updates for everyone else.
        if (status === 'SUBSCRIBED' && userId && username && !isAdminView) {
          await channel.track({ userId, username })
        }
      })

    return () => {
      void supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [code, session?.user?.id, session?.user?.name, isGuest, guestId, guestName, isAdminView])

  const sendSpectatorChatMessage = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      const message = chatInput.trim()
      if (!message || isAdminView) return
      const channel = channelRef.current
      if (!channel) {
        setError('Spectator chat is unavailable while disconnected')
        return
      }
      const userId = session?.user?.id ?? (isGuest ? guestId : null) ?? 'anon'
      const username = session?.user?.name ?? (isGuest ? (guestName ?? 'Guest') : 'Viewer')
      void channel.send({
        type: 'broadcast',
        event: 'spectator-chat',
        payload: {
          id: `spectator-chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId,
          username,
          lobbyCode: code,
          message,
          timestamp: Date.now(),
        } satisfies SpectatorChatMessage,
      })
      setChatInput('')
    },
    [chatInput, code, session?.user?.id, session?.user?.name, isGuest, guestId, guestName, isAdminView]
  )

  // Restore Yahtzee engine whenever game state updates (for spectator board display)
  useEffect(() => {
    if (data?.lobby.gameType !== 'yahtzee' || !parsedState || !data?.activeGame?.id) {
      setYahtzeeEngine(null)
      return
    }
    let cancelled = false
    void restoreGameEngineClient('yahtzee', data.activeGame.id, parsedState).then((engine) => {
      if (!cancelled) setYahtzeeEngine(engine as YahtzeeGame)
    })
    return () => { cancelled = true }
  }, [data?.lobby.gameType, data?.activeGame?.id, parsedState])

  const joinAsPlayer = useCallback(async () => {
    if (!data?.canJoinAsPlayer || joiningAsPlayer) return
    setJoiningAsPlayer(true)
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`)
      }
      router.push(`/lobby/${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join as player')
    } finally {
      setJoiningAsPlayer(false)
    }
  }, [code, data?.canJoinAsPlayer, joiningAsPlayer, router])

  if (isPlayerInGame) {
    return (
      <div className="bd-page bd-screen page-shell items-center justify-center p-6">
        <div className="bd-card w-full max-w-xl p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm text-2xl shadow-[0_3px_0_var(--bd-line)]">
            <Icon name="gamepad" size={24} />
          </div>
          <h1 className="font-display text-2xl font-black text-bd-ink">{t('spectate.youArePlayer')}</h1>
          <p className="mt-2 text-sm text-bd-ink-muted">{t('spectate.youArePlayerDesc')}</p>
          <a
            href={`/lobby/${code}`}
            className="bd-btn bd-btn-primary mx-auto mt-5 inline-flex"
          >
            {t('spectate.goToGame')}
          </a>
        </div>
      </div>
    )
  }

  if (isLimitReached) {
    return (
      <div className="bd-page bd-screen page-shell items-center justify-center p-6">
        <div className="bd-card w-full max-w-xl p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm text-2xl shadow-[0_3px_0_var(--bd-line)]">
            <Icon name="users" size={24} />
          </div>
          <h1 className="font-display text-2xl font-black text-bd-ink">{t('spectate.limitReached')}</h1>
          <p className="mt-2 text-sm text-bd-ink-muted">{t('spectate.limitReachedDesc')}</p>
          <button
            type="button"
            onClick={() => router.push('/lobby')}
            className="bd-btn bd-btn-primary mx-auto mt-5"
          >
            {t('spectate.backToLobbiesBtn')}
          </button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bd-page bd-screen page-shell items-center justify-center p-6">
        <div className="bd-card flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
          <LoadingSpinner size="lg" />
          <div>
            <h1 className="font-display text-2xl font-black text-bd-ink">{t('spectate.loadingTitle')}</h1>
            <p className="mt-2 text-sm text-bd-ink-muted">{t('spectate.loadingSubtitle')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bd-page bd-screen page-shell items-center justify-center p-6">
        <div className="bd-card w-full max-w-xl p-6 text-center sm:p-8">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border-[1.5px] border-bd-line bg-bd-card-warm text-2xl shadow-[0_3px_0_var(--bd-line)]">
            <Icon name="eye" size={24} />
          </div>
          <h1 className="font-display text-2xl font-black text-bd-ink">{t('spectate.unavailableTitle')}</h1>
          <p className="mt-2 text-sm text-bd-ink-muted">{error || 'No data'}</p>
          <button
            type="button"
            onClick={() => router.push('/lobby')}
            className="bd-btn bd-btn-primary mx-auto mt-5"
          >
            {t('spectate.backToLobbiesBtn')}
          </button>
        </div>
      </div>
    )
  }

  const isAuthenticated = Boolean(session?.user?.id) || Boolean(isGuest && guestToken)

  // ── Dedicated game types: render real game component with isSpectator prop ──
  if (DEDICATED_SPECTATOR_GAMES.has(data.lobby.gameType)) {
    const gameType = data.lobby.gameType
    return (
      <>
        <SpectatorTopBar
          spectatorCount={spectatorCount}
          canJoinAsPlayer={data.canJoinAsPlayer}
          joiningAsPlayer={joiningAsPlayer}
          onJoinAsPlayer={joinAsPlayer}
          lobbyCode={code}
          isAdminView={isAdminView}
          isMidMatch={data.activeGame?.status === 'playing'}
        />
        {gameType === 'connect_four' && <ConnectFourLobbyPage code={code} isSpectator />}
        {gameType === 'tic_tac_toe' && <TicTacToeLobbyPage code={code} isSpectator />}
        {gameType === 'rock_paper_scissors' && <RockPaperScissorsLobbyPage code={code} isSpectator />}
        {gameType === 'alias' && <AliasPage code={code} isSpectator />}
        {gameType === 'liars_party' && <LiarsPartyPage code={code} isSpectator />}
        {gameType === 'sketch_and_guess' && <SketchAndGuessLobbyPage code={code} isSpectator />}
        <FloatingSpectatorChat
          isAuthenticated={isAuthenticated}
          isAdminView={isAdminView}
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendMessage={sendSpectatorChatMessage}
        />
      </>
    )
  }

  const spectatorUserId = session?.user?.id ?? (isGuest ? guestId : null)
  const activeGamePlayers = (Array.isArray(data.activeGame?.players) ? data.activeGame.players : []) as GamePlayer[]

  // ── Memory: real board component, same UI as players ────────────────────────
  if (data.lobby.gameType === 'memory') {
    return (
      <>
        <SpectatorTopBar
          spectatorCount={spectatorCount}
          canJoinAsPlayer={data.canJoinAsPlayer}
          joiningAsPlayer={joiningAsPlayer}
          onJoinAsPlayer={joinAsPlayer}
          lobbyCode={code}
          isAdminView={isAdminView}
          isMidMatch={data.activeGame?.status === 'playing'}
        />
        <MemoryGameBoard
          gameId={data.activeGame?.id ?? ''}
          lobbyCode={code}
          players={activeGamePlayers}
          state={parsedState}
          currentUserId={spectatorUserId}
          turnTimerLimit={data.lobby.turnTimer ?? undefined}
          isSpectator
        />
        <FloatingSpectatorChat
          isAuthenticated={isAuthenticated}
          isAdminView={isAdminView}
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendMessage={sendSpectatorChatMessage}
        />
      </>
    )
  }

  // ── Guess the Spy: real board component, same UI as players ─────────────────
  if (data.lobby.gameType === 'guess_the_spy') {
    return (
      <>
        <SpectatorTopBar
          spectatorCount={spectatorCount}
          canJoinAsPlayer={data.canJoinAsPlayer}
          joiningAsPlayer={joiningAsPlayer}
          onJoinAsPlayer={joinAsPlayer}
          lobbyCode={code}
          isAdminView={isAdminView}
          isMidMatch={data.activeGame?.status === 'playing'}
        />
        <SpyGameBoard
          gameId={data.activeGame?.id ?? ''}
          lobbyCode={code}
          lobbyCreatorId={data.lobby.creatorId ?? null}
          players={activeGamePlayers}
          state={(parsedState ?? { id: '', gameType: 'guess_the_spy', players: [], currentPlayerIndex: 0, status: 'playing', data: {}, createdAt: new Date(), updatedAt: new Date() }) as GameState<unknown>}
          currentUserId={spectatorUserId}
          isGuest={false}
          guestId={null}
          guestName={null}
          guestToken={null}
          onRefresh={loadSnapshot}
          isSpectator
        />
        <FloatingSpectatorChat
          isAuthenticated={isAuthenticated}
          isAdminView={isAdminView}
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendMessage={sendSpectatorChatMessage}
        />
      </>
    )
  }

  // ── Yahtzee: real board + scorecard, same UI as players ─────────────────────
  if (data.lobby.gameType === 'yahtzee') {
    const yahtzeeCurrentPlayerId = yahtzeeEngine?.getCurrentPlayer()?.id
    const yahtzeeScorecard = yahtzeeEngine && yahtzeeCurrentPlayerId
      ? yahtzeeEngine.getScorecard(yahtzeeCurrentPlayerId)
      : null

    return (
      <>
        <SpectatorTopBar
          spectatorCount={spectatorCount}
          canJoinAsPlayer={data.canJoinAsPlayer}
          joiningAsPlayer={joiningAsPlayer}
          onJoinAsPlayer={joinAsPlayer}
          lobbyCode={code}
          isAdminView={isAdminView}
          isMidMatch={data.activeGame?.status === 'playing'}
        />
        {yahtzeeEngine ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,3fr) minmax(0,6fr)', gap: 16, padding: '16px', height: 'calc(var(--game-h) - 48px)', overflow: 'hidden' }}>
            <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <YahtzeeGameBoard
                gameEngine={yahtzeeEngine}
                game={data.activeGame!}
                isMyTurn={false}
                isSpectator
                timeLeft={0}
                turnTimerLimit={data.lobby.turnTimer ?? 0}
                isMoveInProgress={false}
                isRolling={false}
                isScoring={false}
                isStateReverting={false}
                celebrationEvent={null}
                held={Array.isArray((parsedState?.data as Record<string, unknown> | undefined)?.held) ? (parsedState!.data as Record<string, unknown>).held as boolean[] : Array(5).fill(false)}
                getCurrentUserId={() => spectatorUserId}
                onRollDice={() => undefined}
                onToggleHold={() => undefined}
                onScore={() => undefined}
                onCelebrationComplete={() => undefined}
              />
            </div>
            <div style={{ minHeight: 0, overflow: 'auto' }}>
              {yahtzeeScorecard && (
                <Scorecard
                  scorecard={yahtzeeScorecard}
                  currentDice={yahtzeeEngine.getDice()}
                  rollsLeft={yahtzeeEngine.getRollsLeft()}
                  onSelectCategory={() => undefined}
                  canSelectCategory={false}
                  isCurrentPlayer={false}
                  playerName={(() => {
                    const p = data.activeGame?.players?.find(pl => pl.userId === yahtzeeCurrentPlayerId)
                    return p?.user?.username || p?.name || undefined
                  })()}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        )}
        <FloatingSpectatorChat
          isAuthenticated={isAuthenticated}
          isAdminView={isAdminView}
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          onSendMessage={sendSpectatorChatMessage}
        />
      </>
    )
  }

  // ── Fallback: game types with no dedicated spectator board (e.g. experimental/in-development games) ──
  const players = activeGamePlayers

  return (
    <div className="bd-page bd-screen min-h-[var(--game-h)] text-bd-ink">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">

        {isAdminView && (
          <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: 'rgba(124,58,237,0.92)' }}>
            <Icon name="shield" size={15} />
            {t('spectate.adminViewBanner')}
          </div>
        )}

        {/* Header */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="bd-kicker mb-1">{t('spectate.modeKicker')}</p>
            <h1 className="font-display text-2xl font-black leading-tight text-bd-ink sm:text-3xl">{data.lobby.name}</h1>
            <p className="mt-1 text-sm font-medium text-bd-ink-muted">
              Code <span className="font-mono font-bold text-bd-ink">{data.lobby.code}</span>
              {data.activeGame?.status && (
                <span className="ml-2 inline-flex items-center rounded-full bg-bd-mint/20 px-2 py-0.5 text-xs font-semibold text-bd-mint-deep">
                  {data.activeGame.status}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            {data.canJoinAsPlayer && (
              <button
                type="button"
                onClick={joinAsPlayer}
                disabled={joiningAsPlayer}
                className="bd-btn bd-btn-coral justify-center disabled:cursor-not-allowed disabled:opacity-60"
              >
                {joiningAsPlayer
                  ? t('spectate.joining')
                  : data.activeGame?.status === 'playing'
                    ? t('spectate.joinNextGame')
                    : t('spectate.joinAsPlayer')}
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push(`/lobby/${code}`)}
              className="bd-btn bd-btn-soft justify-center"
            >
              {t('spectate.openLobby')}
            </button>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-2xl border border-bd-coral/30 bg-bd-coral/10 px-4 py-3 text-sm font-medium text-bd-coral-deep">
            {error}
          </p>
        )}

        {/* Main layout: game board + sidebar */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">

          {/* Game board */}
          <section className="bd-card overflow-hidden p-4 sm:p-6">
            <ReadOnlySpectatorBoard parsedState={parsedState} />
          </section>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">

            {/* Players */}
            <section className="bd-card p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-bd-ink-muted">
                Players · {players.length}/{data.lobby.maxPlayers}
              </h2>
              <div className="space-y-2">
                {players.map((player: GamePlayer) => (
                  <div key={player.id} className="flex items-center gap-2 rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2">
                    <span role="img" aria-label={player.user?.username || 'Player'} className="bd-avatar bd-avatar-lav h-7 w-7 text-xs">
                      {(player.user?.username || 'P').charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-semibold text-bd-ink">
                      {player.user?.username || player.name || 'Player'}
                    </span>
                  </div>
                ))}
                {players.length === 0 && <p className="text-sm text-bd-ink-muted">{t('spectate.noPlayersYet')}</p>}
              </div>
            </section>

            {/* Spectators */}
            <section className="bd-card p-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-bd-ink-muted">
                Spectators · {spectatorCount}
              </h2>
              <div className="space-y-2">
                {spectators.map((spectator) => (
                  <div key={spectator.userId} className="flex items-center gap-2 rounded-xl border border-bd-line bg-bd-card-warm px-3 py-2">
                    <span role="img" aria-label={spectator.username} className="bd-avatar bd-avatar-coral h-7 w-7 text-xs">
                      {spectator.username.charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate text-sm font-semibold text-bd-ink">{spectator.username}</span>
                  </div>
                ))}
                {spectators.length === 0 && <p className="text-sm text-bd-ink-muted">{t('spectate.noSpectatorsConnected')}</p>}
              </div>
            </section>

            {/* Chat — only for authenticated / guest users */}
            {isAuthenticated && (
              <section className="bd-card flex flex-col p-4">
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-bd-ink-muted">{t('spectate.chatTitle')}</h2>
                <div className="mb-3 max-h-48 min-h-[80px] space-y-2 overflow-auto rounded-xl border border-bd-line bg-bd-card-warm p-3">
                  {chatMessages.length === 0 && (
                    <p className="text-sm text-bd-ink-muted">{t('chat.noMessages')}</p>
                  )}
                  {chatMessages.map((message) => (
                    <div key={message.id} className="text-sm">
                      <span className="font-semibold text-bd-ink">{message.username}: </span>
                      <span className="text-bd-ink-soft">{message.message}</span>
                    </div>
                  ))}
                </div>
                {!isAdminView && (
                  <form onSubmit={sendSpectatorChatMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={t('spectate.chatPlaceholder')}
                      maxLength={500}
                      className="bd-input min-w-0 flex-1 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="bd-btn bd-btn-primary px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('chat.send')}
                    </button>
                  </form>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
