// @ts-nocheck
import { readFileSync } from 'fs'
import path from 'path'
import { render, screen } from '@testing-library/react'
import SpyVoting from '@/components/SpyVoting'

// Stylesheet assertions: jsdom lays nothing out.
jest.mock('@/lib/i18n-helpers', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const css = readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')

function declarations(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const match = css.match(new RegExp(`(?:^|\\n|,\\s*)${escaped}\\s*\\{([^}]*)\\}`))
  return match ? match[1] : ''
}

describe('Guess the Spy on a phone', () => {
  it('puts I\'m Ready before the secret tiles in the phone layout', () => {
    const action = Number(declarations('.ttt-mobile-content .spy-role-action').match(/order:\s*(-?\d+)/)?.[1])
    const info = Number(declarations('.ttt-mobile-content .spy-role-info').match(/order:\s*(-?\d+)/)?.[1])
    expect(Number.isFinite(action) && Number.isFinite(info)).toBe(true)
    expect(action).toBeLessThan(info)
  })

  it('keeps Confirm Vote in view while the list of players scrolls', () => {
    const sticky = declarations('.ttt-mobile-content .spy-vote-submit')
    expect(sticky).toMatch(/position:\s*sticky/)
    expect(sticky).toMatch(/bottom:\s*0/)

    render(
      <SpyVoting
        players={[{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }]}
        currentUserId="a"
        onVote={jest.fn()}
        hasVoted={false}
        votesSubmitted={0}
        timeRemaining={30}
      />
    )
    expect(screen.getByRole('button', { name: 'spy.confirmVote' }).closest('.spy-vote-submit')).not.toBeNull()
  })

  it('lets the results column shrink to its board instead of growing to its content', () => {
    expect(declarations('.spy-stage')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })
})
