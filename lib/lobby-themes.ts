import type { CSSProperties } from 'react'

export const LOBBY_THEMES = {
  default:   { name: 'Default',   bg: '#FFF8EC', bg2: '#F2E9D8', accent: '#FF6B5B', border: '#E8DDC8', text: '#1F1B16', textSoft: '#4A3F33', textMuted: '#736451', inputBorder: '#958567', dark: false },
  ocean:     { name: 'Ocean',     bg: '#EEF6FF', bg2: '#DEEDf8', accent: '#4FA3E8', border: '#B3D4F5', text: '#1a3a5c', textSoft: '#2a5080', textMuted: '#436E8D', inputBorder: '#5E8AAB', dark: false },
  midnight:  { name: 'Midnight',  bg: '#1A202C', bg2: '#2D3748', accent: '#9B8CFF', border: '#4A5568', text: '#E2E8F0', textSoft: '#A0AEC0', textMuted: '#91A1B8', inputBorder: '#738298', dark: true  },
  sakura:    { name: 'Sakura',    bg: '#FCEEF0', bg2: '#F5DEE2', accent: '#E48AA0', border: '#F1D4DA', text: '#3D2730', textSoft: '#6B4E5A', textMuted: '#7E5C66', inputBorder: '#9B7782', dark: false },
  neon_city: { name: 'Neon City', bg: '#0E0B1F', bg2: '#1A1535', accent: '#FF3FA4', border: '#2B2150', text: '#F0E9FF', textSoft: '#B794F4', textMuted: '#8478C9', inputBorder: '#695CAA', dark: true  },
} as const

export type LobbyTheme = keyof typeof LOBBY_THEMES

export const LOBBY_THEME_IDS = Object.keys(LOBBY_THEMES) as LobbyTheme[]

export const FREE_LOBBY_THEME: LobbyTheme = 'default'
export const PREMIUM_LOBBY_THEMES = LOBBY_THEME_IDS.filter((t) => t !== FREE_LOBBY_THEME)

export function getLobbyTheme(theme: string | null | undefined) {
  if (theme && theme in LOBBY_THEMES) return LOBBY_THEMES[theme as LobbyTheme]
  return LOBBY_THEMES.default
}

const DARK_THEME_TEXT: Record<string, string> = { '--bd-coral-text': '#FF8475', '--bd-mint-text': '#4AC3A0', '--bd-lav-text': '#A99BFF', '--bd-sky-text': '#77CDFD' }
// The theme's own surfaces are lighter than html.dark's, so the default lav-deep ring falls under 3:1 on them.
const DARK_THEME_SHADE: Record<string, string> = { '--bd-lav-deep': '#8070EE' }
// Ocean's ink is a mid navy, so the default ring on an ink-filled control is 2.7:1; this one is 3.1:1 there and on its pale surfaces.
const OCEAN_SHADE: Record<string, string> = { '--bd-lav-deep': '#8272F4' }
const LIGHT_THEME_TEXT: Record<string, string> = { '--bd-coral-text': '#B71F14', '--bd-mint-text': '#076F57', '--bd-lav-text': '#5E49C7', '--bd-sky-text': '#04658C' }

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
    '--bd-card': t.dark ? t.bg2 : '#ffffff',
    // A lobby theme replaces the surfaces under the raised plates, so it has to
    // move the plate too: the light value on Midnight or Neon City is the same
    // washed-out overlay html.dark was fixed for (#904).
    '--bd-surface-raised': t.dark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.55)',
    '--bd-input-bg': t.dark ? t.bg2 : '#ffffff',
    '--bd-input-border': t.inputBorder,
    '--bd-btn-ink': t.text,
    // A light theme sets them too, or inside html.dark it would inherit the pale dark values.
    ...(t.dark ? { ...DARK_THEME_TEXT, ...DARK_THEME_SHADE } : LIGHT_THEME_TEXT),
    ...(theme === 'ocean' ? OCEAN_SHADE : {}),
    '--bd-inverse': t.dark ? t.bg2 : t.text,
    '--bd-ink-on-inverse': t.dark ? t.text : t.bg,
    '--bd-sun-text': t.dark ? '#FFC44D' : '#875D01',
    background: t.bg,
    color: t.text,
    transition: 'background 0.3s ease, color 0.3s ease',
  } as CSSProperties
}
