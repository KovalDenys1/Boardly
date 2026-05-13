export const LOBBY_THEMES = {
  default:  { name: 'Default',   bg: '#FFF8EC', accent: '#FF6B5B', border: '#E8DDC8', text: '#1F1B16', dark: false },
  ocean:    { name: 'Ocean',     bg: '#EEF6FF', accent: '#4FA3E8', border: '#B3D4F5', text: '#1a3a5c', dark: false },
  forest:   { name: 'Forest',    bg: '#F0FFF4', accent: '#48BB78', border: '#9AE6B4', text: '#1a3a2a', dark: false },
  sunset:   { name: 'Sunset',    bg: '#FFFAF0', accent: '#F6AD55', border: '#FBD38D', text: '#3a2a1a', dark: false },
  midnight: { name: 'Midnight',  bg: '#1A202C', accent: '#9B8CFF', border: '#4A5568', text: '#E2E8F0', dark: true  },
  sakura:   { name: 'Sakura',    bg: '#FCEEF0', accent: '#E48AA0', border: '#F1D4DA', text: '#3D2730', dark: false },
  arctic:   { name: 'Arctic',    bg: '#EEF6FB', accent: '#5BAFD6', border: '#D2E3EE', text: '#172935', dark: false },
  neon_city: { name: 'Neon City', bg: '#0E0B1F', accent: '#FF3FA4', border: '#2B2150', text: '#F0E9FF', dark: true  },
  vintage:  { name: 'Vintage',   bg: '#F2E6CE', accent: '#9C5B2E', border: '#D6BE94', text: '#3A2A1A', dark: false },
} as const

export type LobbyTheme = keyof typeof LOBBY_THEMES

export const LOBBY_THEME_IDS = Object.keys(LOBBY_THEMES) as LobbyTheme[]

export const FREE_LOBBY_THEME: LobbyTheme = 'default'
export const PREMIUM_LOBBY_THEMES = LOBBY_THEME_IDS.filter((t) => t !== FREE_LOBBY_THEME)

export function getLobbyTheme(theme: string | null | undefined) {
  if (theme && theme in LOBBY_THEMES) return LOBBY_THEMES[theme as LobbyTheme]
  return LOBBY_THEMES.default
}
