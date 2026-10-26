'use client'

import { useEffect, useState } from 'react'
import GameIcon, { GAME_ICON_IDS, GameGlyph } from '@/components/GameIcon'
import { Icon, ICON_NAMES } from '@/components/icons'
import { getGameMetadata, getCatalogGames } from '@/lib/game-catalog'
import { LOBBY_THEME_IDS, getThemePageStyle, type LobbyTheme } from '@/lib/lobby-themes'
import { applyThemeMode, type ThemeMode } from '@/lib/theme'

const GLYPH_SIZES = [16, 20, 24, 40]
const GAME_SIZES = [24, 40, 72]

function accentFor(gameId: string): string {
  const entry = getCatalogGames().find((game) => game.id === gameId)
  const meta = entry?.gameType ? getGameMetadata(entry.gameType) : null
  return meta?.accentColor ?? 'var(--bd-coral)'
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="bd-kicker mb-3">{title}</h2>
      {children}
    </section>
  )
}

function GlyphGrid() {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
      {ICON_NAMES.map((name) => (
        <div key={name} className="bd-card flex flex-col gap-2 p-3" style={{ borderRadius: 14 }}>
          <div className="flex items-end gap-2" style={{ color: 'var(--bd-ink)' }}>
            {GLYPH_SIZES.map((size) => (
              <Icon key={size} name={name} size={size} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Icon name={name} size={20} tone="coral" />
            <Icon name={name} size={20} tone="mint" />
            <Icon name={name} size={20} tone="sun" />
            <Icon name={name} size={20} tone="lav" />
            <Icon name={name} size={20} tone="sky" />
            <Icon name={name} size={20} tone="muted" />
          </div>
          <code className="text-[11px]" style={{ color: 'var(--bd-ink-muted)' }}>{name}</code>
        </div>
      ))}
    </div>
  )
}

function GameGrid() {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
      {GAME_ICON_IDS.map((gameId) => {
        const accent = accentFor(gameId)
        return (
          <div key={gameId} className="bd-card p-4" style={{ borderRadius: 16 }}>
            <div className="flex items-end gap-4">
              {GAME_SIZES.map((size) => (
                <GameIcon key={size} gameId={gameId} accentColor={accent} size={size} />
              ))}
            </div>
            <div className="mt-4 flex items-center gap-5">
              <GameIcon gameId={gameId} accentColor={accent} size={44} variant="sticker" />
              <div className="flex items-center gap-3" style={{ color: 'var(--bd-ink)' }}>
                <GameIcon gameId={gameId} accentColor={accent} size={16} variant="bare" />
                <GameIcon gameId={gameId} accentColor={accent} size={24} variant="bare" />
                <GameIcon gameId={gameId} accentColor="var(--bd-ink)" detailColor="var(--bd-sun)" size={28} variant="bare" />
              </div>
            </div>
            <code className="mt-3 block text-[11px]" style={{ color: 'var(--bd-ink-muted)' }}>{gameId}</code>
          </div>
        )
      })}
    </div>
  )
}

export default function IconSheet() {
  const [mode, setMode] = useState<ThemeMode>('light')
  const [lobbyTheme, setLobbyTheme] = useState<LobbyTheme | null>(null)

  useEffect(() => {
    applyThemeMode(mode)
  }, [mode])

  const frameStyle = lobbyTheme ? getThemePageStyle(lobbyTheme) : undefined

  return (
    <div className="bd-page min-h-screen px-6 py-8" style={{ background: 'var(--bd-bg)' }}>
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold" style={{ fontFamily: 'var(--bd-font-display)', color: 'var(--bd-ink)' }}>
              Boardly icons
            </h1>
            <p className="text-sm" style={{ color: 'var(--bd-ink-muted)' }}>
              {ICON_NAMES.length} chrome glyphs · {GAME_ICON_IDS.length} game icons · dev only
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['light', 'dark'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`bd-chip cursor-pointer ${mode === m ? 'border-bd-ink bg-bd-ink text-bd-bg' : ''}`}
              >
                {m}
              </button>
            ))}
            <span className="w-px self-stretch bg-bd-line" />
            <button
              type="button"
              onClick={() => setLobbyTheme(null)}
              className={`bd-chip cursor-pointer ${lobbyTheme === null ? 'border-bd-ink bg-bd-ink text-bd-bg' : ''}`}
            >
              no lobby theme
            </button>
            {LOBBY_THEME_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setLobbyTheme(id)}
                className={`bd-chip cursor-pointer ${lobbyTheme === id ? 'border-bd-ink bg-bd-ink text-bd-bg' : ''}`}
              >
                {id}
              </button>
            ))}
          </div>
        </header>

        <div className="rounded-3xl p-6" style={{ ...frameStyle, background: 'var(--bd-bg)', border: '1.5px solid var(--bd-line)' }}>
          <Section title="Game icons — tile 24 / 40 / 72, sticker, bare 16 / 24, ink-on-sun">
            <GameGrid />
          </Section>
          <Section title="Chrome glyphs — 16 / 20 / 24 / 40 in ink, then every tone">
            <GlyphGrid />
          </Section>
          <Section title="Game glyphs at 128 — the review size (grid lines = 48-grid centre and 4px safe margin)">
            <div data-measure-sheet className="flex flex-wrap gap-4">
              {GAME_ICON_IDS.map((gameId) => (
                <div key={gameId} className="flex flex-col items-center gap-1">
                  <div
                    style={{
                      position: 'relative',
                      width: 128,
                      height: 128,
                      background: 'var(--bd-bg2)',
                      borderRadius: 12,
                      backgroundImage:
                        'linear-gradient(var(--bd-line) 1px, transparent 1px), linear-gradient(90deg, var(--bd-line) 1px, transparent 1px)',
                      backgroundSize: '64px 64px',
                      backgroundPosition: '-1px -1px',
                      outline: '1px dashed var(--bd-ink-muted)',
                      outlineOffset: -10.67,
                    }}
                  >
                    <GameGlyph gameId={gameId} size={128} color={accentFor(gameId)} detailColor="var(--bd-ink)" />
                  </div>
                  <code className="text-[11px]" style={{ color: 'var(--bd-ink-muted)' }}>{gameId}</code>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
