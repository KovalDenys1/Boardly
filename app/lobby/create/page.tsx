'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import dynamic from 'next/dynamic'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation, type TranslationKeys } from '@/lib/i18n-helpers'
import { getCatalogGames, type SupportedCatalogGameType, type LobbyCreateConfig, type GameCatalogEntry } from '@/lib/game-catalog'
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
  nameKey: string
  emoji: string
  gradient: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
  settings: GameSettings
}

function buildGameInfoFromCatalog(): Record<string, GameInfo> {
  return Object.fromEntries(
    getCatalogGames()
      .filter((g): g is GameCatalogEntry & { gameType: SupportedCatalogGameType; lobbyCreateConfig: LobbyCreateConfig } =>
        g.gameType !== undefined && g.lobbyCreateConfig !== undefined
      )
      .map((g) => [
        g.gameType,
        {
          nameKey: g.nameKey,
          emoji: g.emoji,
          gradient: g.lobbyCreateConfig.gradient,
          allowedPlayers: g.lobbyCreateConfig.allowedPlayers,
          defaultMaxPlayers: g.lobbyCreateConfig.defaultMaxPlayers,
          settings: {
            hasTurnTimer: !!g.lobbyCreateConfig.turnTimer,
            turnTimerOptions: g.lobbyCreateConfig.turnTimer?.options,
            defaultTurnTimer: g.lobbyCreateConfig.turnTimer?.default,
            hasGameModes: false,
            hasRoundSelection: !!g.lobbyCreateConfig.rounds,
            roundOptions: g.lobbyCreateConfig.rounds?.options,
            defaultRounds: g.lobbyCreateConfig.rounds?.default ?? null,
            hasDifficultySelection: !!g.lobbyCreateConfig.difficulty,
            difficultyOptions: g.lobbyCreateConfig.difficulty?.options as MemoryDifficulty[] | undefined,
            defaultDifficulty: g.lobbyCreateConfig.difficulty?.default as MemoryDifficulty | undefined,
          },
        } satisfies GameInfo,
      ])
  )
}

const GAME_INFO = buildGameInfoFromCatalog()

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

  const boardSize = 3
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

  const isTTT = selectedGameType === 'tic_tac_toe'

  const MiniBoard = ({ size }: { size: 3 | 4 | 5 }) => {
    const dim = 168
    const demoCells: Record<number, 'x' | 'o'> =
      size === 3 ? { 4: 'x', 0: 'o', 8: 'x' } :
      size === 4 ? { 5: 'x', 10: 'o', 0: 'x' } :
      { 12: 'x', 6: 'o', 18: 'x', 24: 'o' }
    return (
      <div style={{
        width: dim, height: dim,
        display: 'grid', gridTemplateColumns: `repeat(${size}, 1fr)`,
        background: 'white', borderRadius: 16, border: '2px solid var(--bd-ink)',
        boxShadow: '4px 4px 0 var(--bd-ink)', overflow: 'hidden', flexShrink: 0,
      }}>
        {Array.from({ length: size * size }).map((_, i) => {
          const m = demoCells[i]
          return (
            <div key={i} style={{
              display: 'grid', placeItems: 'center',
              borderRight: (i % size) < size - 1 ? '1.5px solid var(--bd-line)' : 'none',
              borderBottom: Math.floor(i / size) < size - 1 ? '1.5px solid var(--bd-line)' : 'none',
              fontSize: Math.floor(dim / size * 0.48),
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

  const GamePreview = () => {
    if (selectedGameType === 'tic_tac_toe') {
      return (
        <div className="flex flex-col items-center gap-5">
          <MiniBoard size={boardSize} />
          <div className="text-center">
            <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>Tic-Tac-Toe</p>
            <p className="text-sm text-bd-ink-muted">{boardSize}×{boardSize} grid</p>
          </div>
        </div>
      )
    }
    if (selectedGameType === 'yahtzee') {
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
      const vals = [6, 3, 3, 1, 5]
      const rotations = [-5, 3, -8, 5, -3]
      const offsets = [0, -4, 0, -6, 2]
      return (
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-end gap-2">
            {vals.map((v, i) => (
              <div key={i} style={{
                width: 50, height: 50, borderRadius: 12, background: 'white',
                border: '2px solid var(--bd-ink)', boxShadow: '3px 3px 0 var(--bd-ink)',
                display: 'grid', placeItems: 'center', fontSize: 26,
                transform: `rotate(${rotations[i]}deg) translateY(${offsets[i]}px)`,
              }}>{faces[v - 1]}</div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>Yahtzee!</p>
            <p className="text-sm text-bd-ink-muted">Roll dice · score combos</p>
          </div>
        </div>
      )
    }
    if (selectedGameType === 'memory') {
      const cols = formData.memoryDifficulty === 'easy' ? 4 : formData.memoryDifficulty === 'medium' ? 5 : 6
      const emojis = ['🦊', '🐧', '🦁', '🐬', '🌟', '🍕', '🎸', '🚀', '🎨', '🎭', '🎲', '🌈']
      const revealed = [0, 5, 3]
      const total = Math.min(cols * cols, 20)
      const sz = formData.memoryDifficulty === 'easy' ? 38 : formData.memoryDifficulty === 'medium' ? 32 : 28
      return (
        <div className="flex flex-col items-center gap-5">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 5 }}>
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} style={{
                width: sz, height: sz, borderRadius: 7, display: 'grid', placeItems: 'center',
                background: revealed.includes(i) ? 'white' : 'var(--bd-ink)',
                border: '1.5px solid var(--bd-line)', fontSize: sz * 0.52, transition: 'all 0.2s',
              }}>
                {revealed.includes(i) ? emojis[i % emojis.length] : ''}
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>Memory</p>
            <p className="text-sm text-bd-ink-muted capitalize">{formData.memoryDifficulty} · find pairs</p>
          </div>
        </div>
      )
    }
    if (selectedGameType === 'guess_the_spy') {
      const cards = [
        { emoji: '🏖️', label: 'Beach', dark: false },
        { emoji: '🕵️', label: '???', dark: true },
        { emoji: '🏔️', label: 'Mountain', dark: false },
      ]
      const rotations = [-6, 0, 6]
      const offsets = [4, 0, 4]
      return (
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-end gap-2">
            {cards.map((card, i) => (
              <div key={i} style={{
                width: 80, height: 108, borderRadius: 14, flexShrink: 0,
                background: card.dark ? 'var(--bd-ink)' : 'white',
                border: '2px solid var(--bd-ink)', boxShadow: '3px 3px 0 var(--bd-ink)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                transform: `rotate(${rotations[i]}deg) translateY(${offsets[i]}px)`,
              }}>
                <span style={{ fontSize: 26 }}>{card.emoji}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: card.dark ? 'rgba(255,255,255,0.5)' : 'var(--bd-ink-muted)',
                }}>{card.label}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>Guess the Spy</p>
            <p className="text-sm text-bd-ink-muted">Find the impostor</p>
          </div>
        </div>
      )
    }
    if (selectedGameType === 'rock_paper_scissors') {
      const choices = [{ e: '✊', l: 'Rock' }, { e: '✋', l: 'Paper' }, { e: '✌️', l: 'Scissors' }]
      const rotations = [-5, 0, 5]
      const offsets = [4, 0, 4]
      return (
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-end gap-3">
            {choices.map((c, i) => (
              <div key={c.l} style={{
                width: 74, height: 94, borderRadius: 14, background: 'white',
                border: '2px solid var(--bd-ink)', boxShadow: '3px 3px 0 var(--bd-ink)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                transform: `rotate(${rotations[i]}deg) translateY(${offsets[i]}px)`,
              }}>
                <span style={{ fontSize: 28 }}>{c.e}</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--bd-ink-muted)' }}>{c.l}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>Rock Paper Scissors</p>
            <p className="text-sm text-bd-ink-muted">2 players · classic showdown</p>
          </div>
        </div>
      )
    }
    if (selectedGameType === 'alias') {
      return (
        <div className="flex flex-col items-center gap-5">
          <div style={{
            width: 188, borderRadius: 18, background: 'white',
            border: '2px solid var(--bd-ink)', boxShadow: '4px 4px 0 var(--bd-ink)',
            padding: '18px 20px', transform: 'rotate(-2deg)',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--bd-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
              Describe this:
            </div>
            <div style={{ fontFamily: 'var(--bd-font-display)', fontWeight: 800, fontSize: 24, color: 'var(--bd-ink)', marginBottom: 14, lineHeight: 1.1 }}>
              ALGORITHM
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--bd-bg2)', overflow: 'hidden' }}>
              <div style={{ width: '60%', height: '100%', background: 'var(--bd-mint)', borderRadius: 3 }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--bd-ink-muted)', textAlign: 'right' }}>0:35</div>
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>Alias</p>
            <p className="text-sm text-bd-ink-muted">Describe without saying it</p>
          </div>
        </div>
      )
    }
    if (selectedGameType === 'liars_party') {
      const cards = [
        { rank: 'K', suit: '♠', red: false },
        { rank: 'A', suit: '♥', red: true },
        { rank: '7', suit: '♣', red: false },
        { rank: 'Q', suit: '♦', red: true },
      ]
      const rotations = [-8, -3, 3, 8]
      return (
        <div className="flex flex-col items-center gap-5">
          <div style={{ position: 'relative', width: 170, height: 110 }}>
            {cards.map((card, i) => (
              <div key={i} style={{
                position: 'absolute', top: 0, left: `${i * 28}px`,
                width: 68, height: 90, borderRadius: 10, background: 'white',
                border: '2px solid var(--bd-ink)', boxShadow: '2px 2px 0 var(--bd-ink)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: `rotate(${rotations[i]}deg)`,
              }}>
                <span style={{
                  fontSize: 19, fontWeight: 800, fontFamily: 'var(--bd-font-display)',
                  color: card.red ? 'var(--bd-coral)' : 'var(--bd-ink)',
                }}>{card.rank}{card.suit}</span>
              </div>
            ))}
          </div>
          <div className="text-center">
            <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>Liar's Party</p>
            <p className="text-sm text-bd-ink-muted">Bluff your way to victory</p>
          </div>
        </div>
      )
    }
    return (
      <div className="text-center">
        <div style={{ fontSize: 60, marginBottom: 12 }}>{gameInfo.emoji}</div>
        <p className="text-lg font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>{t(gameInfo.nameKey as TranslationKeys)}</p>
      </div>
    )
  }

  const chipOpt = (active: boolean) =>
    `bd-chip flex-1 cursor-pointer justify-center py-2 text-sm transition-all ${
      active ? 'border-bd-ink bg-bd-ink text-bd-bg' : 'hover:border-bd-ink'
    }`

  return (
    <div className="page-shell bd-page bd-screen flex flex-col">

      {/* Top bar: back + game selector */}
      <div className="flex shrink-0 items-center gap-3 border-b border-bd-line bg-white px-5 py-3">
        <button
          type="button"
          onClick={() => router.push('/games')}
          className="bd-btn bd-btn-soft shrink-0 px-3 py-2 text-sm"
        >
          ← {t('lobby.create.cancel')}
        </button>
        <div className="h-4 w-px shrink-0 bg-bd-line" />
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Object.entries(GAME_INFO)
            .filter(([key]) => !isTemporarilyUnavailableGameType(key))
            .sort(([, a], [, b]) => t(a.nameKey as TranslationKeys).localeCompare(t(b.nameKey as TranslationKeys), undefined, { sensitivity: 'base' }))
            .map(([key, info]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedGameType(key as GameType)}
                aria-label={t('lobby.create.selectGame', { name: t(info.nameKey as TranslationKeys) })}
                className={`bd-chip shrink-0 cursor-pointer px-3.5 py-1.5 text-[13px] transition-all ${
                  selectedGameType === key
                    ? 'border-bd-ink bg-bd-ink text-bd-bg'
                    : 'hover:border-bd-ink hover:bg-white'
                }`}
              >
                {info.emoji} {t(info.nameKey as TranslationKeys)}
              </button>
            ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Left: game preview */}
        <div className="hidden w-72 shrink-0 flex-col border-r border-bd-line bg-bd-card-warm xl:flex">
          <div className="flex flex-1 items-center justify-center p-8">
            <GamePreview />
          </div>
          <div className="shrink-0 border-t border-bd-line p-4">
            <div className="bd-card p-4">
              <p className="bd-kicker mb-2">Lobby preview</p>
              <p className="mb-3 text-[17px] font-extrabold leading-tight text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
                {formData.name || <span className="text-sm font-normal italic text-bd-ink-muted">Untitled lobby</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className={`bd-chip ${formData.password ? 'bd-chip-coral' : 'bd-chip-mint'}`}>
                  {formData.password ? '🔒 Private' : '🌐 Public'}
                </span>
                <span className="bd-chip">👥 {formData.maxPlayers}</span>
                {isTTT && bestOf > 1 && <span className="bd-chip bd-chip-lav">Bo{bestOf}</span>}
                {selectedGameType === 'memory' && (
                  <span className="bd-chip bd-chip-mint capitalize">{formData.memoryDifficulty}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right: settings form */}
        <form
          id="create-lobby-form"
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          <div className="mx-auto my-auto w-full max-w-lg space-y-5 px-6 py-7">

            {/* Title */}
            <div>
              <span className="bd-kicker mb-1 block">Create Lobby</span>
              <h1
                className="text-[clamp(22px,3vw,30px)] font-extrabold leading-tight text-bd-ink"
                style={{ fontFamily: 'var(--bd-font-display)' }}
              >
                Set up your <span style={{ color: 'var(--bd-coral)' }}>{t(gameInfo.nameKey as TranslationKeys)}</span> room
              </h1>
            </div>

            {/* Lobby name */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-bd-ink">
                {t('lobby.create.lobbyName')}{' '}
                <span className="font-normal text-bd-ink-muted">({t('common.optional')})</span>
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
                <p className="text-sm" style={{ color: 'var(--bd-coral-deep)' }}>
                  ⚠️ {t('lobby.create.maxCharacters', { max: LOBBY_NAME_MAX })}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-bd-ink">
                🔒 {t('lobby.create.password')}{' '}
                <span className="font-normal text-bd-ink-muted">({t('common.optional')})</span>
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
            {gameInfo.allowedPlayers.length > 1 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-bd-ink">👥 {t('lobby.create.maxPlayers')}</label>
                  <span className="text-2xl font-extrabold text-bd-ink" style={{ fontFamily: 'var(--bd-font-display)' }}>
                    {formData.maxPlayers}
                  </span>
                </div>
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
                  className="slider-thumb w-full"
                  style={{
                    background: `linear-gradient(to right, var(--bd-ink) 0%, var(--bd-ink) ${sliderPct}%, var(--bd-bg2) ${sliderPct}%, var(--bd-bg2) 100%)`,
                  }}
                />
                <div className="flex justify-between px-0.5">
                  {gameInfo.allowedPlayers.map((n) => (
                    <span key={n} className={`text-xs font-semibold ${formData.maxPlayers === n ? 'text-bd-ink' : 'text-bd-ink-muted'}`}>
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-bd-ink">👥 {t('lobby.create.maxPlayers')}</span>
                <span className="bd-chip">{gameInfo.allowedPlayers[0]} {t('lobby.create.players')}</span>
              </div>
            )}

            {/* Game-specific settings */}
            {(isTTT || gameInfo.settings.hasDifficultySelection || gameInfo.settings.hasTurnTimer) && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <div className="h-px flex-1 bg-bd-line" />
                  <span className="bd-kicker text-[10px]">Game settings</span>
                  <div className="h-px flex-1 bg-bd-line" />
                </div>

                {isTTT && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-bd-ink">Match length</label>
                      <SegPicker value={bestOf} onChange={(v) => setBestOf(v as 1 | 3 | 5)} options={[{ v: 1, l: 'Single' }, { v: 3, l: 'Best of 3' }, { v: 5, l: 'Best of 5' }]} />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-bd-ink">First move</label>
                      <SegPicker value={whoStarts} onChange={(v) => setWhoStarts(v as 'host' | 'guest' | 'random')} options={[{ v: 'host', l: 'You (✕)' }, { v: 'guest', l: 'Guest (○)' }, { v: 'random', l: '🎲 Random' }]} />
                    </div>
                    {gameInfo.settings.hasRoundSelection && (
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-bd-ink">{t('lobby.create.roundsToPlay')}</label>
                        <div className="flex gap-2">
                          {[3, 5, 10].map((r) => (
                            <button key={r} type="button" onClick={() => setFormData({ ...formData, ticTacToeRounds: r })} className={chipOpt(formData.ticTacToeRounds === r)}>{r}</button>
                          ))}
                          <button type="button" onClick={() => setFormData({ ...formData, ticTacToeRounds: null })} className={chipOpt(formData.ticTacToeRounds === null)}>∞</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {gameInfo.settings.hasDifficultySelection && (
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-bd-ink">🧠 {t('lobby.create.memoryDifficulty')}</label>
                    <div className="flex gap-2">
                      {(['easy', 'medium', 'hard'] as MemoryDifficulty[]).map((d) => (
                        <button key={d} type="button" onClick={() => setFormData({ ...formData, memoryDifficulty: d })} className={chipOpt(formData.memoryDifficulty === d)}>
                          {d === 'easy' ? '🟢 Easy' : d === 'medium' ? '🟡 Medium' : '🔴 Hard'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {gameInfo.settings.hasTurnTimer && (
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-bd-ink">⏱ {t('lobby.create.turnTimer')}</label>
                    <div className="flex gap-2">
                      {[30, 60, 90, 120].map((s) => (
                        <button key={s} type="button" onClick={() => setFormData({ ...formData, turnTimer: s })} className={chipOpt(formData.turnTimer === s)}>{s}s</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Lobby options */}
            <div className="flex items-center gap-3 pt-1">
              <div className="h-px flex-1 bg-bd-line" />
              <span className="bd-kicker text-[10px]">Lobby options</span>
              <div className="h-px flex-1 bg-bd-line" />
            </div>

            {/* Spectators */}
            <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-bd-line bg-bd-card-warm px-4 py-3.5">
              <div>
                <p className="font-semibold text-bd-ink">Spectators</p>
                <p className="text-[13px] text-bd-ink-muted">Allow others to watch</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, allowSpectators: !prev.allowSpectators }))}
                aria-pressed={formData.allowSpectators}
                aria-label="Toggle spectators"
                style={{
                  position: 'relative', display: 'inline-flex', height: 28, width: 52,
                  alignItems: 'center', borderRadius: 999, border: 'none', cursor: 'pointer',
                  flexShrink: 0, transition: 'background 0.2s',
                  background: formData.allowSpectators ? 'var(--bd-mint)' : 'var(--bd-bg2)',
                }}
              >
                <span style={{
                  display: 'inline-block', width: 20, height: 20, borderRadius: '50%',
                  background: 'white', boxShadow: '0 1px 4px rgba(31,27,22,0.2)',
                  transition: 'transform 0.2s',
                  transform: formData.allowSpectators ? 'translateX(28px)' : 'translateX(4px)',
                }} />
              </button>
            </div>

            {/* Invite friends */}
            {!isGuest && (
              <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-bd-line bg-bd-card-warm px-4 py-3.5">
                <div>
                  <p className="font-semibold text-bd-ink">👥 {t('lobby.invite.title')}</p>
                  <p className="text-[13px] text-bd-ink-muted">
                    {selectedFriendIds.length > 0
                      ? <span style={{ color: 'var(--bd-mint-deep)', fontWeight: 600 }}>✓ {selectedFriendIds.length} selected</span>
                      : t('lobby.invite.description')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFriendsModal(true)}
                  className="bd-btn bd-btn-soft shrink-0 px-3 py-2 text-sm"
                >
                  {selectedFriendIds.length > 0 ? 'Edit' : t('lobby.invite.title')}
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm"
                style={{ background: 'rgba(255,107,91,0.10)', border: '1.5px solid rgba(255,107,91,0.3)', color: 'var(--bd-coral-deep)' }}
              >
                <svg style={{ width: 16, height: 16, flexShrink: 0 }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

          </div>
        </form>
      </div>

      {/* Bottom action bar */}
      <div
        className="flex shrink-0 items-center gap-4 border-t px-6 py-4"
        style={{ background: 'var(--bd-ink)', borderColor: 'var(--bd-ink)' }}
      >
        <span className="hidden text-sm sm:block" style={{ color: 'rgba(251,246,238,0.4)' }}>
          Invite code generated on create
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/games')}
            className="bd-btn bd-btn-soft px-4 py-2.5 text-sm"
          >
            {t('lobby.create.cancel')}
          </button>
          <button
            type="submit"
            form="create-lobby-form"
            disabled={loading}
            className="bd-btn bd-btn-coral px-5 py-2.5 font-bold"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
