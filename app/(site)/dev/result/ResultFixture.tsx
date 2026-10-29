'use client'

import { useEffect, useState } from 'react'
import GameResultOverlay, { type ResultStanding } from '@/components/game-chrome/GameResultOverlay'
import YahtzeeResults from '@/components/YahtzeeResults'
import { analyzeResults } from '@/lib/yahtzee-results'
import type { GameOutcome } from '@/components/game-chrome/GameStatusBanner'
import type { AnalyticsGameType } from '@/lib/analytics'

export type FixtureState = 'win' | 'loss' | 'draw' | 'standings' | 'waiting' | 'crowd'
export type FixtureGame = 'ttt' | 'c4' | 'memory' | 'yahtzee' | 'ludo'

const GAMES: Record<FixtureGame, { gameType: AnalyticsGameType; accent: string; shadow: string; kicker?: string }> = {
  ttt: { gameType: 'tic_tac_toe', accent: 'var(--bd-coral)', shadow: 'var(--bd-coral-deep)', kicker: 'Best of 5' },
  c4: { gameType: 'connect_four', accent: 'var(--bd-mint-deep)', shadow: 'rgba(0,0,0,0.25)' },
  memory: { gameType: 'memory', accent: 'var(--bd-mint)', shadow: 'var(--bd-mint-deep)' },
  yahtzee: { gameType: 'yahtzee', accent: 'var(--bd-sun)', shadow: 'var(--bd-sun-deep)' },
  ludo: { gameType: 'ludo', accent: 'var(--bd-sun)', shadow: 'rgba(0,0,0,0.25)' },
}

const VERSUS: ResultStanding[] = [
  { id: 'me', name: 'Denys', score: 3, isViewer: true },
  { id: 'bot', name: 'Bot Ada', score: 1 },
]

const TABLE: ResultStanding[] = [
  { id: 'kari', name: 'Kari', score: 241 },
  { id: 'me', name: 'Denys', score: 198, isViewer: true },
  { id: 'ola', name: 'Ola Nordmann', score: 176 },
  { id: 'bot', name: 'Bot Ada', score: 140 },
]

const CROWD: ResultStanding[] = [
  { id: 'a', name: 'Kari', score: 18 },
  { id: 'b', name: 'Ola Nordmann', score: 15 },
  { id: 'c', name: 'Ingrid', score: 15 },
  { id: 'd', name: 'Magnus', score: 11 },
  { id: 'e', name: 'Sofie', score: 9 },
  { id: 'f', name: 'Henrik', score: 7 },
  { id: 'me', name: 'Denys', score: 4, isViewer: true },
]

function fixture(state: FixtureState): { title: string; outcome?: GameOutcome; isDraw?: boolean; standings?: ResultStanding[]; isHost: boolean } {
  switch (state) {
    case 'win':
      return { title: 'Denys wins!', outcome: 'win', standings: VERSUS, isHost: true }
    case 'loss':
      return { title: 'Bot Ada wins!', outcome: 'loss', standings: [VERSUS[1], { ...VERSUS[0], score: 0 }].map((row, i) => ({ ...row, score: i === 0 ? 3 : 2 })), isHost: true }
    case 'draw':
      return { title: "It's a draw", outcome: 'draw', isDraw: true, standings: VERSUS.map((row) => ({ ...row, score: 2 })), isHost: true }
    case 'standings':
      return { title: 'Kari wins!', outcome: 'loss', standings: TABLE, isHost: true }
    case 'crowd':
      return { title: 'Kari wins!', outcome: 'loss', standings: CROWD, isHost: false }
    case 'waiting':
      return { title: 'Denys wins!', outcome: 'win', standings: VERSUS, isHost: false }
  }
}

function YahtzeeSurface({ state }: { state: FixtureState }) {
  const rows = (state === 'standings' || state === 'crowd' ? TABLE : fixture(state).standings ?? VERSUS)
  const results = analyzeResults(
    rows.map((row) => ({ id: row.id, name: row.name, score: Number(row.score) * (state === 'standings' || state === 'crowd' ? 1 : 60) })),
    (id) => ({ chance: Number(rows.find((row) => row.id === id)?.score ?? 0) })
  )
  return (
    <div className="page-shell flex flex-col">
      <YahtzeeResults
        results={results}
        currentUserId="me"
        canStartGame={state !== 'waiting' && state !== 'crowd'}
        canRequestRematch
        onPlayAgain={() => undefined}
        onBackToLobby={() => undefined}
        onReturnToLobbyRoom={() => undefined}
        isGuest
        lobbyCode="DEVRSLT"
        gameId="dev-result"
        faceCounts={[11, 9, 12, 10, 8, 10]}
      />
    </div>
  )
}

export default function ResultFixture({
  state,
  game,
  dark,
  openMore,
  surface,
}: {
  state: FixtureState
  game: FixtureGame
  dark: boolean
  openMore: boolean
  surface: 'fixture' | 'yahtzee'
}) {
  const [inspecting, setInspecting] = useState(false)
  const config = GAMES[game]
  const data = fixture(state)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    if (!openMore) return
    const timer = setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[data-testid="game-result-more-button"]')?.click()
    }, 50)
    return () => clearTimeout(timer)
  }, [openMore])

  if (surface === 'yahtzee') return <YahtzeeSurface state={state} />

  return (
    <div className="page-shell grid place-items-center p-4">
      <div className="grid aspect-square w-full max-w-[min(32rem,70dvh)] grid-cols-3 gap-2 rounded-bd-lg border border-bd-line bg-bd-card p-3">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className="rounded-bd-sm bg-bd-bg2" />
        ))}
      </div>
      {inspecting ? (
        <button type="button" className="fixed bottom-6 rounded-full bg-bd-inverse px-4 py-2 text-sm font-semibold text-bd-ink-on-inverse" onClick={() => setInspecting(false)}>
          Show results
        </button>
      ) : (
        <GameResultOverlay
          title={data.title}
          kicker={config.kicker}
          outcome={data.outcome}
          isDraw={data.isDraw}
          standings={data.standings}
          accentColor={config.accent}
          accentShadowColor={config.shadow}
          onInspect={() => setInspecting(true)}
          isHost={data.isHost}
          onPlayAgain={() => undefined}
          onReturnToLobby={() => undefined}
          onLeave={() => undefined}
          isGuest
          canAskRematch={false}
          inviteCode="DEVRSLT"
          gameId="dev-result"
          gameType={config.gameType}
          revealDelayMs={0}
        />
      )}
    </div>
  )
}
