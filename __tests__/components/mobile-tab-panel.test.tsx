import { render, screen } from '@testing-library/react'
import MobileTabPanel from '@/app/lobby/[code]/components/MobileTabPanel'

describe('MobileTabPanel', () => {
  it('keeps inactive panels hidden without moving them off-canvas', () => {
    render(
      <MobileTabPanel id="scorecard" activeTab="game">
        <div>Scorecard content</div>
      </MobileTabPanel>
    )

    const panel = screen.getByText('Scorecard content').parentElement?.parentElement as HTMLElement

    const style = panel.getAttribute('style') ?? ''

    expect(style).toContain('transform: translate3d(0, 0, 0)')
    expect(style).toContain('visibility: hidden')
    expect(style).toContain('overflow-x: hidden')
  })

  it('gives panel children a definite full-height container', () => {
    render(
      <MobileTabPanel id="game" activeTab="game">
        <div>Game content</div>
      </MobileTabPanel>
    )

    const contentWrapper = screen.getByText('Game content').parentElement as HTMLElement

    expect(contentWrapper.className).toContain('h-full')
    expect(contentWrapper.className).toContain('min-h-0')
  })
})
