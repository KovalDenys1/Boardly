import { readFileSync } from 'fs'
import path from 'path'

// Stylesheet assertion: jsdom lays nothing out.
const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')

describe('Guess the Spy desktop right column', () => {
  it('lets the role and score stack shrink and gives the chat a floor, only where there is a chat', () => {
    const rule = css.match(/\.spy-screen-kit \.ttt-right-col:has\(> \.game-chat-panel\)\s*\{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/grid-template-rows:\s*minmax\(0,\s*auto\)\s+minmax\(\d+px,\s*1fr\)/)
  })
})
