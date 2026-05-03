'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation } from '@/lib/i18n-helpers'
import type { SupportedCatalogGameType } from '@/lib/game-catalog'
import { isTemporarilyUnavailableGameType } from '@/lib/public-game-access'
import { showToast } from '@/lib/i18n-toast'
import {
  trackLobbyCreateRequest,
  type AnalyticsGameType,
} from '@/lib/analytics'
import { markPendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { buildCurrentAuthUrl } from '@/lib/auth-redirect'

type GameType = SupportedCatalogGameType
type MemoryDifficulty = 'easy' | 'medium' | 'hard'

type GameSettings = {
  hasTurnTimer?: boolean
  hasGameModes?: boolean
  hasRoundSelection?: boolean
  hasDifficultySelection?: boolean
  turnTimerOptions?: number[]
  defaultTurnTimer?: number
  roundOptions?: number[]
  defaultRounds?: number | null
  difficultyOptions?: MemoryDifficulty[]
  defaultDifficulty?: MemoryDifficulty
}

type GameInfo = {
  name: string
  emoji: string
  description: string
  gradient: string
  translationKey: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
  settings: GameSettings
}

const GAME_INFO: Record<string, GameInfo> = {
  yahtzee: {
    name: 'Yahtzee',
    emoji: '🎲',
    description: '',
    gradient: 'from-purple-600 via-pink-500 to-orange-400',
    translationKey: 'yahtzee',
    allowedPlayers: [2, 3, 4],
    defaultMaxPlayers: 4,
    settings: {
      hasTurnTimer: true,
      hasGameModes: true,
      turnTimerOptions: [30, 60, 90, 120],
      defaultTurnTimer: 60,
    },
  },
  guess_the_spy: {
    name: 'Guess the Spy',
    emoji: '🕵️‍♂️',
    description: '',
    gradient: 'from-blue-600 via-cyan-500 to-green-400',
    translationKey: 'guess_the_spy',
    allowedPlayers: [3, 4, 5, 6, 7, 8],
    defaultMaxPlayers: 6,
    settings: {
      hasTurnTimer: false,
      hasGameModes: false,
    },
  },
  tic_tac_toe: {
    name: 'Tic-Tac-Toe',
    emoji: '❌',
    description: '',
    gradient: 'from-indigo-600 via-blue-500 to-sky-400',
    translationKey: 'tictactoe',
    allowedPlayers: [2],
    defaultMaxPlayers: 2,
    settings: {
      hasTurnTimer: false,
      hasGameModes: false,
      hasRoundSelection: true,
      roundOptions: [3, 5, 10],
      defaultRounds: null,
    },
  },
  rock_paper_scissors: {
    name: 'Rock Paper Scissors',
    emoji: '🍂',
    description: '',
    gradient: 'from-indigo-500 via-purple-500 to-pink-400',
    translationKey: 'rock_paper_scissors',
    allowedPlayers: [2],
    defaultMaxPlayers: 2,
    settings: {
      hasTurnTimer: false,
      hasGameModes: false,
    },
  },
  memory: {
    name: 'Memory',
    emoji: '🧠',
    description: '',
    gradient: 'from-emerald-500 via-teal-500 to-cyan-400',
    translationKey: 'memory',
    allowedPlayers: [2, 3, 4],
    defaultMaxPlayers: 4,
    settings: {
      hasTurnTimer: false,
      hasGameModes: false,
      hasDifficultySelection: true,
      difficultyOptions: ['easy', 'medium', 'hard'],
      defaultDifficulty: 'easy',
    },
  },
  alias: {
    name: 'Alias',
    emoji: '🗣️',
    description: '',
    gradient: 'from-violet-600 via-fuchsia-500 to-pink-400',
    translationKey: 'alias',
    allowedPlayers: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    defaultMaxPlayers: 8,
    settings: {
      hasTurnTimer: false,
      hasGameModes: false,
    },
  },
  liars_party: {
    name: "Liar's Party",
    emoji: '🎭',
    description: '',
    gradient: 'from-rose-600 via-pink-500 to-orange-400',
    translationKey: 'liars_party',
    allowedPlayers: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    defaultMaxPlayers: 8,
    settings: {
      hasTurnTimer: false,
      hasGameModes: false,
    },
  },
}

function isSelectableGameType(value: string | null | undefined): value is GameType {
  if (typeof value !== 'string' || !(value in GAME_INFO)) {
    return false
  }
  return !isTemporarilyUnavailableGameType(value)
}

const FriendsListModal = dynamic(() => import('@/components/FriendsListModal'))

function CreateLobbyPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()
  const { isGuest } = useGuest()

  const requestedGameType = searchParams.get('gameType')
  const [selectedGameType, setSelectedGameType] = useState<GameType>(
    isSelectableGameType(requestedGameType) ? requestedGameType : 'yahtzee'
  )
  const gameInfo = GAME_INFO[selectedGameType]

  const [boardSize, setBoardSize] = useState<3 | 4 | 5>(3)
  const [bestOf, setBestOf] = useState<1 | 3 | 5>(1)
  const [whoStarts, setWhoStarts] = useState<'host' | 'guest' | 'random'>('random')

  const [formData, setFormData] = useState({
    name: '',
    password: '',
    maxPlayers: GAME_INFO[selectedGameType].defaultMaxPlayers,
    allowSpectators: true,
    turnTimer: GAME_INFO[selectedGameType].settings.defaultTurnTimer || 60,
    ticTacToeRounds: GAME_INFO[selectedGameType].settings.defaultRounds ?? null,
    memoryDifficulty: GAME_INFO[selectedGameType].settings.defaultDifficulty ?? 'easy',
    gameType: selectedGameType as GameType,
  })
  const LOBBY_NAME_MAX = 22
  const [showNameWarning, setShowNameWarning] = useState(false)
  const [maxPlayersInput, setMaxPlayersInput] = useState(GAME_INFO[selectedGameType].defaultMaxPlayers.toString())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPlayerWarning, setShowPlayerWarning] = useState(false)
  const [showFriendsModal, setShowFriendsModal] = useState(false)
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([])
  const [tipsOpen, setTipsOpen] = useState(false)

  useEffect(() => {
    clientLogger.log('🎮 Game type selected:', selectedGameType)
    if (gameInfo) {
      setFormData(prev => ({
        ...prev,
        maxPlayers: gameInfo.defaultMaxPlayers,
        turnTimer: gameInfo.settings.defaultTurnTimer || 60,
        ticTacToeRounds: gameInfo.settings.defaultRounds ?? null,
        memoryDifficulty: gameInfo.settings.defaultDifficulty ?? 'easy',
        gameType: selectedGameType,
      }))
      setMaxPlayersInput(gameInfo.defaultMaxPlayers.toString())
      setShowPlayerWarning(false)
    }
  }, [selectedGameType, gameInfo])

  useEffect(() => {
    if (status === 'unauthenticated' && !isGuest) {
      router.push('/')
    }
  }, [status, isGuest, router])

  const handlePartySelection = async (friendIds: string[]) => {
    setSelectedFriendIds(friendIds)
    showToast.success('toast.saved')
  }

  if (!gameInfo) {
    return (
      <div className="bd-page bd-screen flex-1 flex items-center justify-center p-4">
        <div className="bd-card" style={{ padding: 40, maxWidth: 400, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 24, color: 'var(--bd-ink)', marginBottom: 12 }}>
            {t('lobby.create.gameNotFound')}
          </h1>
          <p style={{ color: 'var(--bd-ink-muted)', marginBottom: 24, fontSize: 15 }}>
            {t('lobby.create.gameNotSupported', { gameType: selectedGameType })}
          </p>
          <button
            onClick={() => router.push('/games')}
            className="bd-btn bd-btn-coral bd-btn-lg"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {t('lobby.create.backToGames')}
          </button>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const createStartedAt = Date.now()
    let responseStatus: number | undefined
    let createMetricTracked = false

    try {
      if (!session && !isGuest) {
        router.push(buildCurrentAuthUrl('login'))
        return
      }

      clientLogger.log('📤 Sending lobby creation request:', formData)

      const payload = {
        name: formData.name,
        password: formData.password,
        maxPlayers: formData.maxPlayers,
        allowSpectators: formData.allowSpectators,
        turnTimer: formData.turnTimer,
        gameType: formData.gameType,
        ...(formData.gameType === 'tic_tac_toe' ? {
          ticTacToeRounds: formData.ticTacToeRounds,
          boardSize,
          bestOf,
          whoStarts,
        } : {}),
        ...(formData.gameType === 'memory' ? { memoryDifficulty: formData.memoryDifficulty } : {}),
      }

      const res = await fetchWithGuest('/api/lobby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      responseStatus = res.status

      const data = await res.json()
      clientLogger.log('📥 Received response:', { status: res.status, data })

      if (!res.ok) {
        trackLobbyCreateRequest({
          gameType: formData.gameType as AnalyticsGameType,
          durationMs: Date.now() - createStartedAt,
          isGuest,
          success: false,
          statusCode: responseStatus,
        })
        createMetricTracked = true
        throw new Error(data.error || 'Failed to create lobby')
      }

      const lobbyCode = typeof data?.lobby?.code === 'string' ? data.lobby.code : null
      if (!lobbyCode) {
        trackLobbyCreateRequest({
          gameType: formData.gameType as AnalyticsGameType,
          durationMs: Date.now() - createStartedAt,
          isGuest,
          success: false,
          statusCode: responseStatus,
        })
        createMetricTracked = true
        throw new Error('Lobby code missing in response')
      }

      trackLobbyCreateRequest({
        gameType: formData.gameType as AnalyticsGameType,
        durationMs: Date.now() - createStartedAt,
        isGuest,
        success: true,
        statusCode: responseStatus,
      })
      createMetricTracked = true

      markPendingLobbyCreateMetric({
        lobbyCode,
        gameType: formData.gameType as AnalyticsGameType,
        startedAt: createStartedAt,
        isGuest,
      })

      if (!isGuest && selectedFriendIds.length > 0) {
        try {
          const inviteResponse = await fetch(`/api/lobby/${lobbyCode}/invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ friendIds: selectedFriendIds }),
          })
          const inviteResult = await inviteResponse.json().catch(() => null)
          if (!inviteResponse.ok) {
            clientLogger.warn('Lobby created but party invite request failed', {
              lobbyCode, status: inviteResponse.status, error: inviteResult,
            })
          } else {
            clientLogger.log('Party invite flow completed during lobby creation', {
              lobbyCode,
              invitedCount: typeof inviteResult?.invitedCount === 'number' ? inviteResult.invitedCount : selectedFriendIds.length,
              skippedCount: Array.isArray(inviteResult?.skippedFriendIds) ? inviteResult.skippedFriendIds.length : 0,
            })
          }
        } catch (inviteError) {
          clientLogger.warn('Lobby created but party invite request threw an error', { lobbyCode, error: inviteError })
        }
      }

      clientLogger.log('✅ Lobby created successfully, redirecting to:', lobbyCode)
      router.push(`/lobby/${lobbyCode}`)
    } catch (err) {
      if (!createMetricTracked) {
        trackLobbyCreateRequest({
          gameType: formData.gameType as AnalyticsGameType,
          durationMs: Date.now() - createStartedAt,
          isGuest,
          success: false,
          statusCode: responseStatus,
        })
      }
      clientLogger.error('❌ Lobby creation error:', err)
      const errorMessage = err instanceof Error ? err.message : t('lobby.create.errors.failedToCreate')
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="bd-page bd-screen flex-1 flex items-center justify-center">
        <div style={{ color: 'var(--bd-ink-soft)', fontSize: 18 }}>{t('common.loading')}</div>
      </div>
    )
  }

  if (status === 'unauthenticated' && !isGuest) {
    return null
  }

  const sliderPct = gameInfo.allowedPlayers.length > 1
    ? ((formData.maxPlayers - gameInfo.allowedPlayers[0]) / (gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1] - gameInfo.allowedPlayers[0])) * 100
    : 0

  const optionBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 14px',
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 14,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
    background: active ? 'var(--bd-ink)' : 'var(--bd-bg2)',
    color: active ? 'var(--bd-bg)' : 'var(--bd-ink)',
    border: active ? '1.5px solid var(--bd-ink)' : '1.5px solid var(--bd-line)',
  })

  const isTTT = selectedGameType === 'tic_tac_toe'

  // MiniBoard component inline — shows a tic-tac-toe preview grid with demo moves
  const MiniBoard = ({ size }: { size: 3 | 4 | 5 }) => {
    const dim = 160
    const demoCells: Record<number, 'x' | 'o'> = size === 3 ? { 0: 'x', 4: 'o', 8: 'x' } : size === 4 ? { 5: 'x', 10: 'o' } : { 6: 'x', 12: 'o', 18: 'x' }
    const total = size * size
    return (
      <div style={{
        width: dim, height: dim,
        display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`,
        background: 'white', borderRadius: 16, border: '2px solid var(--bd-ink)',
        boxShadow: '0 4px 0 var(--bd-ink)', overflow: 'hidden', flexShrink: 0,
      }}>
        {Array.from({ length: total }).map((_, i) => {
          const m = demoCells[i]
          return (
            <div key={i} style={{
              display: 'grid', placeItems: 'center',
              borderRight: (i % size) < size - 1 ? '1.5px solid var(--bd-line)' : 'none',
              borderBottom: Math.floor(i / size) < size - 1 ? '1.5px solid var(--bd-line)' : 'none',
              fontSize: Math.floor(dim / size * 0.55),
              fontFamily: 'var(--bd-font-display)', fontWeight: 800,
              color: m === 'x' ? 'var(--bd-coral)' : 'var(--bd-lav-deep)',
            }}>{m === 'x' ? '✕' : m === 'o' ? '○' : ''}</div>
          )
        })}
      </div>
    )
  }

  const SegPicker = <T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; l: string }[] }) => (
    <div style={{
      display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 4,
      padding: 4, background: 'var(--bd-card-warm)', borderRadius: 12, border: '1.5px solid var(--bd-line)',
    }}>
      {options.map(o => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)} style={{
          padding: '8px 10px', borderRadius: 9, fontWeight: 600, fontSize: 13,
          background: value === o.v ? 'var(--bd-ink)' : 'transparent',
          color: value === o.v ? 'var(--bd-bg)' : 'var(--bd-ink-soft)',
          border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          transition: 'all 0.12s',
        }}>{o.l}</button>
      ))}
    </div>
  )

  return (
    <div className="bd-page bd-screen flex-1 overflow-y-auto">
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px 80px' }} className="md:px-8">

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => router.push('/games')}
            className="bd-btn bd-btn-soft"
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            ← {t('lobby.create.cancel')}
          </button>
          <span className="bd-kicker" style={{ fontSize: 11 }}>
            Games · {gameInfo.name} · <span style={{ color: 'var(--bd-ink)' }}>Create lobby</span>
          </span>
        </div>

        {/* Game selector strip */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          {Object.entries(GAME_INFO)
            .filter(([key]) => !isTemporarilyUnavailableGameType(key))
            .sort(([, a], [, b]) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
            .map(([key, info]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedGameType(key as GameType)}
                className="bd-btn"
                style={{
                  padding: '8px 14px', fontSize: 13, fontWeight: 600, gap: 6,
                  background: selectedGameType === key ? 'var(--bd-ink)' : 'var(--bd-card-warm)',
                  color: selectedGameType === key ? 'var(--bd-bg)' : 'var(--bd-ink-soft)',
                  border: `1.5px solid ${selectedGameType === key ? 'var(--bd-ink)' : 'var(--bd-line)'}`,
                }}
                aria-label={t('lobby.create.selectGame', { name: info.name })}
              >
                <span>{info.emoji}</span>
                <span style={{ fontFamily: 'var(--bd-font-display)' }}>{info.name}</span>
              </button>
            ))}
        </div>

        {/* Split layout */}
        <div style={{ display: 'grid', gridTemplateColumns: isTTT ? 'minmax(280px,340px) 1fr' : '1fr', gap: 20 }}>

          {/* PREVIEW COLUMN — only for tic_tac_toe */}
          {isTTT && (
            <div className="bd-card" style={{
              padding: 20, display: 'flex', flexDirection: 'column', gap: 16,
              background: 'linear-gradient(155deg, var(--bd-card) 0%, rgba(155,140,255,0.10) 100%)',
              position: 'relative', overflow: 'hidden', alignSelf: 'start',
            }}>
              <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,196,77,0.18)', pointerEvents: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                <span className="bd-kicker" style={{ fontSize: 10 }}>Preview</span>
                <span style={{ flex: 1, height: 1, background: 'var(--bd-line)' }} />
              </div>
              <div style={{ alignSelf: 'center', position: 'relative' }}>
                <MiniBoard size={boardSize} />
              </div>
              <div style={{ position: 'relative' }}>
                <div className="bd-kicker" style={{ fontSize: 10, marginBottom: 4 }}>Lobby name</div>
                <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22, lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--bd-ink)' }}>
                  {formData.name || 'Untitled lobby'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', position: 'relative' }}>
                <span className="bd-chip bd-chip-lav">{formData.password ? '🔒 Private' : '🌐 Public'}</span>
                <span className="bd-chip bd-chip-mint">2 players</span>
                <span className="bd-chip">{boardSize}×{boardSize}</span>
                {bestOf > 1 && <span className="bd-chip bd-chip-coral">Bo{bestOf}</span>}
              </div>
              <div style={{ marginTop: 'auto', position: 'relative' }}>
                <div style={{ height: 1, background: 'var(--bd-line)', margin: '8px 0 12px' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="bd-avatar bd-avatar-coral" style={{ width: 36, height: 36, flexShrink: 0 }}>You</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--bd-ink)' }}>You</div>
                    <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>Host · waiting for opponent</div>
                  </div>
                  <span className="bd-chip bd-chip-sun" style={{ padding: '3px 8px', fontSize: 10 }}>HOST</span>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS COLUMN */}
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
          >
            <div className="bd-card" style={{ overflow: 'hidden', marginBottom: 12 }}>
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--bd-line)' }}>
                <h1 style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 'clamp(22px,3vw,32px)', lineHeight: 1.1, letterSpacing: '-0.02em', color: 'var(--bd-ink)' }}>
                  Set up your <span style={{ color: 'var(--bd-coral)' }}>{gameInfo.name}</span> room
                </h1>
                <div style={{ fontSize: 12, color: 'var(--bd-ink-muted)', marginTop: 4 }}>
                  {gameInfo.emoji} {gameInfo.name} · {gameInfo.allowedPlayers.join('–')} players
                </div>
              </div>

              {/* Settings grid */}
              <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 20 }}>


            {/* Lobby name */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 8 }}>
                🎮 {t('lobby.create.lobbyName')}{' '}
                <span style={{ fontWeight: 400, color: 'var(--bd-ink-muted)' }}>({t('common.optional')})</span>
              </label>
              <input
                type="text"
                placeholder={t('lobby.create.lobbyNamePlaceholder')}
                maxLength={LOBBY_NAME_MAX}
                className="bd-input"
                value={formData.name}
                onChange={(e) => {
                  let value = e.target.value
                  if (value.length > LOBBY_NAME_MAX) value = value.slice(0, LOBBY_NAME_MAX)
                  setFormData({ ...formData, name: value })
                  setShowNameWarning(value.length >= LOBBY_NAME_MAX)
                }}
                onBlur={() => setShowNameWarning(false)}
              />
              {showNameWarning && (
                <p style={{ fontSize: 12, color: 'var(--bd-coral-deep)', marginTop: 6 }}>
                  ⚠️ {t('lobby.create.maxCharacters', { max: LOBBY_NAME_MAX })}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 8 }}>
                🔒 {t('lobby.create.password')}
              </label>
              <input
                type="text"
                autoComplete="off"
                placeholder={t('lobby.create.passwordPlaceholder')}
                className="bd-input"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            {/* Max players */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 8 }}>
                👥 {t('lobby.create.maxPlayers')} *
              </label>

              {gameInfo.allowedPlayers.length === 1 ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', background: 'var(--bd-bg2)', borderRadius: 12, border: '1.5px solid var(--bd-line)' }}>
                    <span style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 22, color: 'var(--bd-ink)' }}>
                      {gameInfo.allowedPlayers[0]}
                    </span>
                    <span style={{ fontSize: 14, color: 'var(--bd-ink-soft)', fontWeight: 600 }}>
                      {gameInfo.allowedPlayers[0] === 1 ? t('lobby.create.player') : t('lobby.create.players')}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                    <input
                      type="number"
                      min={gameInfo.allowedPlayers[0]}
                      max={gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1]}
                      value={maxPlayersInput}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        setMaxPlayersInput(inputValue)
                        if (inputValue === '') { setShowPlayerWarning(false); return }
                        const value = parseInt(inputValue)
                        if (!isNaN(value)) {
                          if (gameInfo.allowedPlayers.includes(value)) {
                            setFormData({ ...formData, maxPlayers: value })
                            setShowPlayerWarning(false)
                          } else if (value < gameInfo.allowedPlayers[0] || value > gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1]) {
                            setShowPlayerWarning(true)
                          } else {
                            setShowPlayerWarning(false)
                          }
                        }
                      }}
                      onFocus={() => setShowPlayerWarning(false)}
                      onBlur={() => {
                        setMaxPlayersInput(formData.maxPlayers.toString())
                        setShowPlayerWarning(false)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' || e.key === 'Delete') setShowPlayerWarning(false)
                      }}
                      style={{
                        width: 56, padding: '8px 4px', textAlign: 'center',
                        fontFamily: 'var(--bd-font-display)', fontWeight: 700, fontSize: 16,
                        border: '2px solid var(--bd-line)', borderRadius: 10,
                        background: 'white', color: 'var(--bd-ink)',
                        appearance: 'textfield',
                      } as React.CSSProperties}
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {showPlayerWarning && (
                      <p style={{ fontSize: 12, color: 'var(--bd-coral-deep)', marginTop: 6, textAlign: 'center' }}>
                        ⚠️ {t('lobby.create.mustBeBetween', { min: gameInfo.allowedPlayers[0], max: gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1] })}
                      </p>
                    )}
                  </div>

                  <div style={{ position: 'relative' }}>
                    <input
                      type="range"
                      min={gameInfo.allowedPlayers[0]}
                      max={gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1]}
                      step="1"
                      value={formData.maxPlayers}
                      onChange={(e) => {
                        const value = parseInt(e.target.value)
                        if (gameInfo.allowedPlayers.includes(value)) {
                          setFormData({ ...formData, maxPlayers: value })
                          setMaxPlayersInput(value.toString())
                          setShowPlayerWarning(false)
                        }
                      }}
                      className="slider-thumb"
                      style={{
                        width: '100%',
                        background: `linear-gradient(to right, var(--bd-ink) 0%, var(--bd-ink) ${sliderPct}%, var(--bd-bg2) ${sliderPct}%, var(--bd-bg2) 100%)`,
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 2px' }}>
                      {gameInfo.allowedPlayers.map((num) => (
                        <span
                          key={num}
                          style={{
                            fontSize: 12,
                            fontWeight: formData.maxPlayers === num ? 700 : 400,
                            color: formData.maxPlayers === num ? 'var(--bd-ink)' : 'var(--bd-ink-muted)',
                          }}
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)', marginTop: 8, textAlign: 'center' }}>
                {gameInfo.allowedPlayers.length === 1
                  ? t('lobby.create.playerCountHelperExact', { count: gameInfo.allowedPlayers[0] })
                  : t('lobby.create.playerCountHelperRange', { min: gameInfo.allowedPlayers[0], max: gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1] })}
              </p>
            </div>

            {/* Round settings — Tic-Tac-Toe */}
            {gameInfo.settings.hasRoundSelection && (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 8 }}>
                  🔁 {t('lobby.create.roundsToPlay')}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {(gameInfo.settings.roundOptions || [3, 5, 10]).map((rounds) => (
                    <button
                      key={rounds}
                      type="button"
                      onClick={() => setFormData({ ...formData, ticTacToeRounds: rounds })}
                      style={optionBtnStyle(formData.ticTacToeRounds === rounds)}
                    >
                      {rounds}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, ticTacToeRounds: null })}
                    style={optionBtnStyle(formData.ticTacToeRounds === null)}
                  >
                    ∞
                  </button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)', marginTop: 8, textAlign: 'center' }}>
                  {t('lobby.create.roundsHelper')}
                </p>
              </div>
            )}

            {/* Difficulty — Memory */}
            {gameInfo.settings.hasDifficultySelection && (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 8 }}>
                  🧠 {t('lobby.create.memoryDifficulty')}
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(gameInfo.settings.difficultyOptions || ['easy', 'medium', 'hard']).map((difficulty) => (
                    <button
                      key={difficulty}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, memoryDifficulty: difficulty as MemoryDifficulty }))}
                      style={optionBtnStyle(formData.memoryDifficulty === difficulty)}
                    >
                      {difficulty === 'easy'
                        ? t('lobby.create.difficultyEasy')
                        : difficulty === 'medium'
                          ? t('lobby.create.difficultyMedium')
                          : t('lobby.create.difficultyHard')}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)', marginTop: 8, textAlign: 'center' }}>
                  {t('lobby.create.memoryDifficultyHelper')}
                </p>
              </div>
            )}

            {/* Turn timer */}
            {gameInfo.settings.hasTurnTimer && (
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 8 }}>
                  ⏱️ {t('lobby.create.turnTimer')} *
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(gameInfo.settings.turnTimerOptions || [30, 60, 90, 120]).map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setFormData({ ...formData, turnTimer: seconds })}
                      style={{ ...optionBtnStyle(formData.turnTimer === seconds), flex: 1 }}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)', marginTop: 8, textAlign: 'center' }}>
                  {t('lobby.create.turnTimerHelper')}
                </p>
              </div>
            )}

            {/* Spectators toggle */}
            <div className="bd-card" style={{ padding: 16, background: 'var(--bd-card-warm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--bd-ink)', marginBottom: 2 }}>Spectators</p>
                  <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>Allow users to watch in read-only mode</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, allowSpectators: !prev.allowSpectators }))}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    height: 28,
                    width: 52,
                    alignItems: 'center',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: 'background 0.2s',
                    background: formData.allowSpectators ? 'var(--bd-mint)' : 'var(--bd-bg2)',
                  }}
                  aria-pressed={formData.allowSpectators}
                  aria-label="Toggle spectators"
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'white',
                      boxShadow: '0 1px 4px rgba(31,27,22,0.2)',
                      transition: 'transform 0.2s',
                      transform: formData.allowSpectators ? 'translateX(28px)' : 'translateX(4px)',
                    }}
                  />
                </button>
              </div>
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--bd-ink-muted)' }}>
                Spectator capacity is unlimited when enabled.
              </p>
            </div>

            {/* Invite friends */}
            {!isGuest && (
              <div className="bd-card" style={{ padding: 16, background: 'var(--bd-card-warm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--bd-ink)', marginBottom: 2 }}>
                      👥 {t('lobby.invite.title')}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--bd-ink-muted)' }}>
                      {t('lobby.invite.description')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFriendsModal(true)}
                    className="bd-btn bd-btn-soft"
                    style={{ padding: '8px 14px', fontSize: 13, flexShrink: 0 }}
                  >
                    {selectedFriendIds.length > 0
                      ? t('lobby.invite.send', { count: selectedFriendIds.length })
                      : t('lobby.invite.title')}
                  </button>
                </div>
                {selectedFriendIds.length > 0 && (
                  <p style={{ marginTop: 10, fontSize: 12, color: 'var(--bd-mint-deep)', fontWeight: 600 }}>
                    ✓ {t('lobby.invite.send', { count: selectedFriendIds.length })}
                  </p>
                )}
              </div>
            )}

                {/* Game mode (coming soon) */}
                {gameInfo.settings.hasGameModes && (
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--bd-ink)', marginBottom: 8 }}>
                      🎮 {t('lobby.create.gameMode')}
                    </label>
                    <button type="button" disabled style={{
                      width: '100%', padding: '12px 16px', borderRadius: 12,
                      background: 'var(--bd-bg2)', color: 'var(--bd-ink-muted)',
                      border: '1.5px solid var(--bd-line)', fontFamily: 'inherit',
                      fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                      <span>🔒</span>
                      <span>{t('lobby.create.comingSoon')}</span>
                    </button>
                  </div>
                )}

                {/* TicTacToe-specific settings */}
                {isTTT && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bd-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Board size
                      </label>
                      <SegPicker
                        value={boardSize}
                        onChange={(v) => setBoardSize(v as 3 | 4 | 5)}
                        options={[{ v: 3, l: '3×3' }, { v: 4, l: '4×4' }, { v: 5, l: '5×5' }]}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bd-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        Match length
                      </label>
                      <SegPicker
                        value={bestOf}
                        onChange={(v) => setBestOf(v as 1 | 3 | 5)}
                        options={[{ v: 1, l: 'Single' }, { v: 3, l: 'Bo3' }, { v: 5, l: 'Bo5' }]}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--bd-ink-soft)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                        First move
                      </label>
                      <SegPicker
                        value={whoStarts}
                        onChange={(v) => setWhoStarts(v as 'host' | 'guest' | 'random')}
                        options={[{ v: 'host', l: 'You (X)' }, { v: 'guest', l: 'Guest' }, { v: 'random', l: '🎲 Random' }]}
                      />
                    </div>
                  </>
                )}

              </div>{/* end settings grid */}
            </div>{/* end settings card */}

            {/* Error */}
            {error && (
              <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,107,91,0.10)', border: '1.5px solid rgba(255,107,91,0.3)', color: 'var(--bd-coral-deep)', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <svg style={{ width: 18, height: 18, flexShrink: 0 }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {/* Dark action bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 16,
              background: 'var(--bd-ink)', color: 'var(--bd-bg)',
              boxShadow: '0 6px 0 0 rgba(31,27,22,0.12)',
            }}>
              <span style={{ fontSize: 13, opacity: 0.6 }}>Invite code generated on create</span>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => router.push('/games')}
                className="bd-btn bd-btn-soft"
                style={{ padding: '10px 16px' }}
              >
                {t('lobby.create.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bd-btn bd-btn-coral"
                style={{ padding: '10px 20px', fontWeight: 700, opacity: loading ? 0.6 : 1 }}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin" style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('lobby.create.creating')}
                  </>
                ) : (
                  <>{t('lobby.create.create')} →</>
                )}
              </button>
            </div>

          </form>

        </div>{/* end split layout */}
      </div>

      {!isGuest && (
        <FriendsListModal
          isOpen={showFriendsModal}
          onClose={() => setShowFriendsModal(false)}
          onSelect={handlePartySelection}
          initialSelectedFriendIds={selectedFriendIds}
          confirmLabel={t('common.save')}
          lobbyCode="pending-lobby"
        />
      )}
    </div>
  )
}

export default function CreateLobbyPageWrapper() {
  return (
    <Suspense fallback={<div className="bd-page bd-screen flex-1 flex items-center justify-center"><div style={{ color: 'var(--bd-ink-soft)', fontSize: 18 }}>Loading...</div></div>}>
      <CreateLobbyPage />
    </Suspense>
  )
}
