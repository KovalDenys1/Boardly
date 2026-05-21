import type { CSSProperties } from 'react'

export const LOBBY_THEMES = {
  default:   { name: 'Default',   bg: '#FFF8EC', bg2: '#F2E9D8', accent: '#FF6B5B', border: '#E8DDC8', text: '#1F1B16', textSoft: '#4A3F33', textMuted: '#8A7A66', dark: false },
  ocean:     { name: 'Ocean',     bg: '#EEF6FF', bg2: '#DEEDf8', accent: '#4FA3E8', border: '#B3D4F5', text: '#1a3a5c', textSoft: '#2a5080', textMuted: '#4a7595', dark: false },
  midnight:  { name: 'Midnight',  bg: '#1A202C', bg2: '#2D3748', accent: '#9B8CFF', border: '#4A5568', text: '#E2E8F0', textSoft: '#A0AEC0', textMuted: '#718096', dark: true  },
  sakura:    { name: 'Sakura',    bg: '#FCEEF0', bg2: '#F5DEE2', accent: '#E48AA0', border: '#F1D4DA', text: '#3D2730', textSoft: '#6B4E5A', textMuted: '#9E7A85', dark: false },
  neon_city: { name: 'Neon City', bg: '#0E0B1F', bg2: '#1A1535', accent: '#FF3FA4', border: '#2B2150', text: '#F0E9FF', textSoft: '#B794F4', textMuted: '#7B6FBF', dark: true  },
} as const

export type LobbyTheme = keyof typeof LOBBY_THEMES

export const LOBBY_THEME_IDS = Object.keys(LOBBY_THEMES) as LobbyTheme[]

export const FREE_LOBBY_THEME: LobbyTheme = 'default'
export const PREMIUM_LOBBY_THEMES = LOBBY_THEME_IDS.filter((t) => t !== FREE_LOBBY_THEME)

export function getLobbyTheme(theme: string | null | undefined) {
  if (theme && theme in LOBBY_THEMES) return LOBBY_THEMES[theme as LobbyTheme]
  return LOBBY_THEMES.default
}

export function getThemePageStyle(theme: string | null | undefined): CSSProperties {
  const t = getLobbyTheme(theme)
  const isDefault = !theme || theme === 'default'
  if (isDefault) return { transition: 'background 0.3s ease, color 0.3s ease' }

  return {
    '--bd-bg': t.bg,
    '--bd-bg2': t.bg2,
    '--bd-ink': t.text,
    '--bd-ink-soft': t.textSoft,
    '--bd-ink-muted': t.textMuted,
    '--bd-line': t.border,
    '--bd-card-warm': t.bg2,
    '--bd-input-bg': t.dark ? t.bg2 : '#ffffff',
    '--bd-btn-ink': t.text,
    background: t.bg,
    color: t.text,
    transition: 'background 0.3s ease, color 0.3s ease',
  } as CSSProperties
}
