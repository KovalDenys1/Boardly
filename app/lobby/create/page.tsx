'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation } from '@/lib/i18n-helpers'

type GameType = 'yahtzee' | 'guess_the_spy'

type GameSettings = {
  hasTurnTimer?: boolean // Whether this game supports turn timer
  hasGameModes?: boolean // Whether this game supports game modes
  turnTimerOptions?: number[] // Available turn timer options (in seconds)
  defaultTurnTimer?: number // Default turn timer value
}

type GameInfo = {
  name: string
  emoji: string
  description: string
  gradient: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
  settings: GameSettings // Game-specific settings configuration
}

// Game info with settings configuration for each game
const GAME_INFO: Record<GameType, GameInfo> = {
  yahtzee: {
    name: 'Yahtzee',
    emoji: '🎲',
    description: '', // Set via i18n
    gradient: 'from-purple-600 via-pink-500 to-orange-400',
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
    description: '', // Set via i18n
    gradient: 'from-blue-600 via-cyan-500 to-green-400',
    allowedPlayers: [3, 4, 5, 6, 7, 8],
    defaultMaxPlayers: 6,
    settings: {
      hasTurnTimer: false, // Spy game doesn't need turn timer
      hasGameModes: false, // Spy game doesn't need game modes yet
    },
  },
}


import { Disclosure } from '@headlessui/react'

function CreateLobbyPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session, status } = useSession()

  const [selectedGameType, setSelectedGameType] = useState<GameType>((searchParams.get('gameType') as GameType) || 'yahtzee')
  const gameInfo = GAME_INFO[selectedGameType]

  const [formData, setFormData] = useState({
    name: '',
    password: '',
    maxPlayers: GAME_INFO[selectedGameType].defaultMaxPlayers,
    turnTimer: GAME_INFO[selectedGameType].settings.defaultTurnTimer || 60, // Use game-specific default or fallback to 60
    gameType: selectedGameType as GameType,
  })
  const LOBBY_NAME_MAX = 22;
  const [showNameWarning, setShowNameWarning] = useState(false);
  const [maxPlayersInput, setMaxPlayersInput] = useState(GAME_INFO[selectedGameType].defaultMaxPlayers.toString())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showTips, setShowTips] = useState(false)
  const [showPlayerWarning, setShowPlayerWarning] = useState(false)

  useEffect(() => {
    clientLogger.log('🎮 Game type selected:', selectedGameType)
    if (gameInfo) {
      setFormData(prev => ({
        ...prev,
        maxPlayers: gameInfo.defaultMaxPlayers,
        turnTimer: gameInfo.settings.defaultTurnTimer || 60, // Update turn timer when game changes
        gameType: selectedGameType,
      }))
      setMaxPlayersInput(gameInfo.defaultMaxPlayers.toString())
      setShowPlayerWarning(false)
    }
  }, [selectedGameType, gameInfo])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login')
    }
  }, [status, router])

  if (!gameInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-4">{t('lobby.create.gameNotFound')}</h1>
          <p className="text-white/80 mb-6">
            {t('lobby.create.gameNotSupported', { gameType: selectedGameType })}
          </p>
          <button
            onClick={() => router.push('/games')}
            className="w-full bg-white text-purple-600 rounded-xl px-6 py-3 font-semibold hover:bg-white/90 transition-colors"
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

    try {
      if (!session) {
        router.push('/auth/login')
        return
      }

      clientLogger.log('📤 Sending lobby creation request:', formData)

      const res = await fetch('/api/lobby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await res.json()
      clientLogger.log('📥 Received response:', { status: res.status, data })

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create lobby')
      }

      // Notify lobby list about new lobby via WebSocket
      const socketUrl = getBrowserSocketUrl()
      const token = session?.user?.id || null
      
      const authPayload: Record<string, unknown> = {}
      if (token) authPayload.token = token
      authPayload.isGuest = false

      const queryPayload: Record<string, string> = {}
      if (token) queryPayload.token = String(token)
      queryPayload.isGuest = 'false'

      const socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false, // Don't reconnect for this one-time notification
        timeout: 5000,
        auth: authPayload,
        query: queryPayload,
      })
      
      // Set a timeout to force cleanup after 10 seconds
      const cleanupTimeout = setTimeout(() => {
        if (socket.connected) {
          socket.disconnect()
        }
      }, 10000)
      
      socket.on('connect', () => {
        socket.emit('lobby-created')
        clearTimeout(cleanupTimeout)
        socket.disconnect()
      })
      
      socket.on('connect_error', (error) => {
        clientLogger.warn('Socket notification failed (non-critical):', error.message)
        clearTimeout(cleanupTimeout)
        socket.disconnect()
      })

      clientLogger.log('✅ Lobby created successfully, redirecting to:', data.lobby.code)
      // Redirect to the new lobby
      router.push(`/lobby/${data.lobby.code}`)
    } catch (err) {
      clientLogger.error('❌ Lobby creation error:', err)
      const errorMessage = err instanceof Error ? err.message : t('lobby.create.errors.failedToCreate')
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
        <div className="text-white text-xl">{t('common.loading')}</div>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return null
  }

  return (
    <div className={`bg-gradient-to-br ${gameInfo.gradient} flex flex-col`}>
      <section
        className="flex flex-col w-full px-4 py-4 md:py-0 md:h-[calc(100vh-64px)] md:items-center md:justify-center flex-shrink-0"
      >
        <div className="w-full max-w-4xl flex flex-col items-center justify-center">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-white/20 flex flex-col md:flex-row md:gap-0 gap-4 overflow-hidden w-full md:h-[80vh] md:max-h-[800px]">
            {/* 1. Game Type Selector - clean scrollable list */}
            <div className="md:w-1/4 w-full flex flex-col overflow-y-auto bg-white/5 border-b-2 md:border-b-0 md:border-r-2 border-white/10 order-1">
              {Object.entries(GAME_INFO).map(([key, info], index) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedGameType(key as GameType)}
                  className={`flex items-center gap-3 px-4 py-5 h-20 w-full font-semibold transition-all border-b border-white/10 last:border-b-0 ${
                    selectedGameType === key 
                      ? 'bg-white text-blue-600 shadow-lg' 
                      : 'text-white hover:bg-white/10'
                  }`}
                  aria-label={t('lobby.create.selectGame', { name: info.name })}
                >
                  <span className="text-3xl flex-shrink-0">{info.emoji}</span>
                  <span className="text-left text-base md:text-lg font-bold">{info.name}</span>
                </button>
              ))}
            </div>
            {/* 2. Form */}
            <form onSubmit={handleSubmit} className="md:w-2/4 w-full p-4 md:p-6 space-y-2.5 md:space-y-3 flex flex-col justify-center order-3 md:order-2 overflow-y-auto max-h-[70vh] md:max-h-none">
              <div>
                <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                  🎮 {t('lobby.create.lobbyName')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('lobby.create.lobbyNamePlaceholder')}
                  maxLength={LOBBY_NAME_MAX}
                  className="w-full px-4 py-2.5 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                  value={formData.name}
                  onChange={(e) => {
                    let value = e.target.value;
                    if (value.length > LOBBY_NAME_MAX) {
                      value = value.slice(0, LOBBY_NAME_MAX);
                    }
                    setFormData({ ...formData, name: value });
                    setShowNameWarning(value.length >= LOBBY_NAME_MAX);
                  }}
                  onBlur={() => setShowNameWarning(false)}
                />
                {/* Validation warning for name length */}
                {showNameWarning && (
                  <p className="text-xs text-red-300 mt-1 animate-fade-in">
                    ⚠️ {t('lobby.create.maxCharacters', { max: LOBBY_NAME_MAX })}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                  🔒 {t('lobby.create.password')}
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder={t('lobby.create.passwordPlaceholder')}
                  className="w-full px-4 py-2.5 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 transition-all"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                  👥 {t('lobby.create.maxPlayers')} *
                </label>
                
                {/* Number Input - Centered above slider */}
                <div className="flex flex-col items-center mb-2">
                  <input
                    type="number"
                    min={gameInfo.allowedPlayers[0]}
                    max={gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1]}
                    value={maxPlayersInput}
                    onChange={(e) => {
                      const inputValue = e.target.value;
                      setMaxPlayersInput(inputValue);

                      // Check for validation warnings
                      if (inputValue === '') {
                        setShowPlayerWarning(false);
                        return;
                      }

                      const value = parseInt(inputValue);
                      if (!isNaN(value)) {
                        // If value is allowed, sync to formData
                        if (gameInfo.allowedPlayers.includes(value)) {
                          setFormData({ ...formData, maxPlayers: value });
                          setShowPlayerWarning(false);
                        } else {
                          // If value is out of bounds, show warning
                          if (value < gameInfo.allowedPlayers[0] || value > gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1]) {
                            setShowPlayerWarning(true);
                          } else {
                            // Valid number but not in allowed set (if gaps exist), treat as warning or just ignore
                            setShowPlayerWarning(false);
                          }
                        }
                      }
                    }}
                    onFocus={() => {
                      setShowPlayerWarning(false);
                    }}
                    onBlur={() => {
                      // On blur, reset to the last valid value in formData
                      setMaxPlayersInput(formData.maxPlayers.toString());
                      setShowPlayerWarning(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' || e.key === 'Delete') {
                        setShowPlayerWarning(false);
                      }
                    }}
                    className="w-12 px-2 py-1.5 text-center text-base border-2 border-white/30 rounded-md focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white font-bold transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-md"
                  />
                  {/* Validation warning */}
                  {showPlayerWarning && (
                    <p className="text-xs text-red-300 mt-1 animate-fade-in">
                      ⚠️ {t('lobby.create.mustBeBetween', { min: gameInfo.allowedPlayers[0], max: gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1] })}
                    </p>
                  )}
                </div>

                {/* Range Slider */}
                <div className="relative">
                  <input
                    type="range"
                    min={gameInfo.allowedPlayers[0]}
                    max={gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1]}
                    step="1"
                    value={formData.maxPlayers}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      if (gameInfo.allowedPlayers.includes(value)) {
                        setFormData({ ...formData, maxPlayers: value });
                        setMaxPlayersInput(value.toString());
                        setShowPlayerWarning(false);
                      }
                    }}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider-thumb"
                    style={{
                      background: `linear-gradient(to right, white 0%, white ${((formData.maxPlayers - gameInfo.allowedPlayers[0]) / (gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1] - gameInfo.allowedPlayers[0])) * 100}%, rgba(255,255,255,0.2) ${((formData.maxPlayers - gameInfo.allowedPlayers[0]) / (gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1] - gameInfo.allowedPlayers[0])) * 100}%, rgba(255,255,255,0.2) 100%)`
                    }}
                  />
                  {/* Tick marks for allowed values */}
                  <div className="flex justify-between mt-1 px-0.5">
                    {gameInfo.allowedPlayers.map((num) => (
                      <span 
                        key={num} 
                        className={`text-xs transition-all ${formData.maxPlayers === num ? 'text-white font-bold scale-110' : 'text-white/50'}`}
                      >
                        {num}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Helper text */}
                <p className="text-xs text-white/70 mt-2 text-center">
                  {gameInfo.allowedPlayers.length === 1 
                    ? t('lobby.create.playerCountHelper', { count: gameInfo.allowedPlayers[0] })
                    : t('lobby.create.playerCountHelper', { min: gameInfo.allowedPlayers[0], max: gameInfo.allowedPlayers[gameInfo.allowedPlayers.length - 1], count: 2 })
                  }
                </p>
              </div>

              {/* Turn Timer Settings - Only for games that support it */}
              {gameInfo.settings.hasTurnTimer && (
                <div>
                  <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                    ⏱️ {t('lobby.create.turnTimer')} *
                  </label>
                  <div className="flex gap-2">
                    {(gameInfo.settings.turnTimerOptions || [30, 60, 90, 120]).map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() => setFormData({ ...formData, turnTimer: seconds })}
                        className={`flex-1 px-3 py-2 rounded-xl font-semibold transition-all ${
                          formData.turnTimer === seconds
                            ? 'bg-white text-blue-600 shadow-lg scale-105'
                            : 'bg-white/20 text-white hover:bg-white/30'
                        }`}
                      >
                        {seconds}s
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-white/70 mt-2 text-center">
                    {t('lobby.create.turnTimerHelper')}
                  </p>
                </div>
              )}

              {/* Game Mode - Only for games that support it */}
              {gameInfo.settings.hasGameModes && (
                <div>
                  <label className="block text-xs md:text-sm font-bold text-white mb-1.5 md:mb-2">
                    🎮 {t('lobby.create.gameMode')}
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      disabled
                      className="w-full px-4 py-2.5 rounded-xl font-semibold bg-white/10 text-white/50 cursor-not-allowed flex items-center justify-center gap-2 border-2 border-white/20"
                    >
                      <span>🔒</span>
                      <span>{t('lobby.create.comingSoon')}</span>
                    </button>
                    <p className="text-xs text-white/70 mt-2 text-center">
                      {t('lobby.create.gameModeHelper')}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/20 border-2 border-red-400 text-white px-4 py-3 rounded-xl flex items-center gap-2 backdrop-blur-sm">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.push(`/games/${selectedGameType}/lobbies`)}
                  className="flex-1 px-4 py-2.5 bg-white/20 text-white rounded-xl font-bold hover:bg-white/30 transition-all"
                >
                  {t('lobby.create.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2.5 bg-white text-blue-600 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                      {t('lobby.create.creating')}
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      {t('lobby.create.create')}
                    </>
                  )}
                </button>
              </div>
              {/* Tips - compact under the form */}
              <Disclosure defaultOpen={false}>
                {({ open }) => (
                  <div className="bg-white/10 rounded-2xl p-3 mt-2">
                    <Disclosure.Button className="w-full flex items-center justify-between text-white font-bold text-base focus:outline-none">
                      <span>💡 {t('lobby.create.tips.title')}</span>
                      <span className="ml-2">{open ? '▲' : '▼'}</span>
                    </Disclosure.Button>
                    <Disclosure.Panel>
                      <ul className="space-y-2 text-sm text-white/80 mt-3">
                        <li className="flex items-start gap-2">
                          <span className="text-green-400 font-bold mt-0.5">✓</span>
                          <span>{t('lobby.create.tips.autoAdd')}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-400 font-bold mt-0.5">✓</span>
                          <span>{t('lobby.create.tips.shareCode')}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-green-400 font-bold mt-0.5">✓</span>
                          <span>{t('lobby.create.tips.startReady')}</span>
                        </li>
                      </ul>
                    </Disclosure.Panel>
                  </div>
                )}
              </Disclosure>
            </form>
            {/* 3. Preview/Info */}
            <div className="md:w-1/4 w-full bg-white/5 md:bg-white/10 p-4 md:p-6 flex flex-col items-center justify-center text-center border-t-2 md:border-t-0 md:border-l-2 border-white/10 order-2 md:order-3">
              <div className="text-5xl mb-2">{gameInfo.emoji}</div>
              <div className="text-2xl font-bold text-white mb-1">{gameInfo.name}</div>
              <div className="text-white/80 mb-2 text-sm">{t(`games.${selectedGameType}.description`)}</div>
              <div className="flex items-center justify-center gap-3 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/30 text-white text-sm font-semibold">
                  👥 {t('lobby.create.preview.players', { count: formData.maxPlayers })}
                </span>
                {formData.password && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/30 text-white text-sm font-semibold">
                    🔒 {t('lobby.create.preview.private')}
                  </span>
                )}
                {gameInfo.settings.hasTurnTimer && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/30 text-white text-sm font-semibold">
                    ⏱️ {formData.turnTimer}s
                  </span>
                )}
              </div>
              <div className="mt-4 text-xs text-white/70">
                {t('lobby.create.preview.lobbyName')} <span className="font-semibold text-white">{formData.name || t('lobby.create.preview.noName')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

// Wrap component with Suspense for useSearchParams
export default function CreateLobbyPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600"><div className="text-white text-xl">Loading...</div></div>}>
      <CreateLobbyPage />
    </Suspense>
  )
}
