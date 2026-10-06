import { LOBBY_THEMES, LOBBY_THEME_IDS, getThemePageStyle } from '@/lib/lobby-themes'
import { THEME_TOKENS, isThemeScoped } from '@/lib/dev/theme-tokens'

describe('getThemePageStyle', () => {
  const darkThemes = LOBBY_THEME_IDS.filter((id) => LOBBY_THEMES[id].dark)

  it('sets every token html.dark redefines, so a dark theme looks the same in light site mode', () => {
    expect(darkThemes.length).toBeGreaterThan(0)
    const scoped = THEME_TOKENS.filter(isThemeScoped).map((t) => `--${t.name}`)
    for (const id of darkThemes) {
      const style = getThemePageStyle(id) as Record<string, string>
      for (const token of scoped) expect([id, token, style[token]]).toEqual([id, token, expect.any(String)])
    }
  })

  it('paints the card plate in the theme colour on a dark theme and white on a light one', () => {
    for (const id of LOBBY_THEME_IDS.filter((t) => t !== 'default')) {
      const style = getThemePageStyle(id) as Record<string, string>
      const theme = LOBBY_THEMES[id]
      expect(style['--bd-card']).toBe(theme.dark ? theme.bg2 : '#ffffff')
    }
  })
})
