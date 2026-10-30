import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { render } from '@testing-library/react'
import GameScreenshot, { hasScreenshot } from '@/app/(site)/games/components/GameScreenshot'
import { getCatalogGames, isAvailableCatalogEntry } from '@/lib/game-catalog'

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const PUBLIC = path.join(__dirname, '..', '..', 'public')
const detailGames = getCatalogGames().filter(isAvailableCatalogEntry)

function sources(container: HTMLElement): { light: string; dark: string } {
  const light = container.querySelector('img[data-theme-shot="light"]')
  const dark = container.querySelector('img[data-theme-shot="dark"]')
  expect(light).not.toBeNull()
  expect(dark).not.toBeNull()
  const file = (img: Element) => decodeURIComponent(/url=([^&]+)/.exec(img.getAttribute('src')!)?.[1] ?? img.getAttribute('src')!)
  return { light: file(light!), dark: file(dark!) }
}

// #1565: every game page has the same hero, and dark mode shows a dark frame.
describe('GameScreenshot', () => {
  it.each(detailGames.map((game) => [game.id]))('%s has a light and a dark frame on disk', (gameId) => {
    expect(hasScreenshot(gameId)).toBe(true)
    const { light, dark } = sources(render(<GameScreenshot gameId={gameId} gameName={gameId} />).container)

    expect(light).not.toBe(dark)
    expect(existsSync(path.join(PUBLIC, light))).toBe(true)
    expect(existsSync(path.join(PUBLIC, dark))).toBe(true)
  })

  it('names the frame for the theme it belongs to, so the html class can swap them', () => {
    const { container } = render(<GameScreenshot gameId="checkers" gameName="Checkers" />)

    expect(container.querySelector('img[data-theme-shot="light"]')).toHaveClass('bd-shot-light')
    expect(container.querySelector('img[data-theme-shot="dark"]')).toHaveClass('bd-shot-dark')
  })

  it('swaps the frames on the html class, not only on the system setting', () => {
    const css = readFileSync(path.join(__dirname, '..', '..', 'app', 'globals.css'), 'utf8').replace(/\s+/g, ' ')

    expect(css).toMatch(/(^|[ }])\.bd-shot-dark ?\{ ?display: ?none;? ?\}/)
    expect(css).toMatch(/html\.dark \.bd-shot-light ?\{ ?display: ?none;? ?\}/)
    expect(css).toMatch(/html\.dark \.bd-shot-dark ?\{ ?display: ?block;? ?\}/)
  })
})
