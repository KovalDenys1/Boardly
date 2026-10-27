import { act, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useTabIndicator } from '@/hooks/useTabIndicator'

type Tab = 'profile' | 'friends' | 'settings'
const TABS: Tab[] = ['profile', 'friends', 'settings']
const TAB_WIDTH = 100

// jsdom has no layout: each tab reports a 100px box at its index, the list sits at x=10.
function fakeRect(el: HTMLElement): DOMRect {
  const index = TABS.indexOf(el.dataset.tab as Tab)
  const left = index >= 0 ? 10 + index * TAB_WIDTH : 10
  const width = index >= 0 ? TAB_WIDTH : TAB_WIDTH * TABS.length
  return { left, width, top: 0, height: 40, right: left + width, bottom: 40, x: left, y: 0, toJSON: () => ({}) } as DOMRect
}

function Tabs({ loading, initialTab = 'profile' }: { loading: boolean; initialTab?: Tab }) {
  const [active, setActive] = useState<Tab>(initialTab)
  const { indicatorStyle, animate, setList, setButton } = useTabIndicator(active, { insetPx: 2 })
  // The profile page returns a loading screen before the tab list exists.
  if (loading) return <p>loading</p>
  return (
    <nav ref={setList} role="tablist">
      <div
        data-testid="pill"
        className={animate ? 'animated' : undefined}
        style={{ width: indicatorStyle.width, transform: `translateX(${indicatorStyle.left}px)`, opacity: indicatorStyle.opacity }}
      />
      {TABS.map((tab) => (
        <button key={tab} ref={setButton(tab)} data-tab={tab} role="tab" aria-selected={active === tab} onClick={() => setActive(tab)}>
          {tab}
        </button>
      ))}
    </nav>
  )
}

describe('useTabIndicator', () => {
  let rectSpy: jest.SpyInstance

  beforeEach(() => {
    rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return fakeRect(this)
    })
  })

  afterEach(() => rectSpy.mockRestore())

  it('shows the pill under the active tab when the list mounts after a loading screen', () => {
    const { rerender } = render(<Tabs loading />)
    rerender(<Tabs loading={false} />)

    const pill = screen.getByTestId('pill')
    expect(pill.style.opacity).toBe('1')
    expect(pill.style.width).toBe(`${TAB_WIDTH - 4}px`)
    expect(pill.style.transform).toBe('translateX(2px)')
  })

  it('shows the pill on first render when the list is there from the start', () => {
    render(<Tabs loading={false} initialTab="settings" />)

    const pill = screen.getByTestId('pill')
    expect(pill.style.opacity).toBe('1')
    expect(pill.style.transform).toBe(`translateX(${2 * TAB_WIDTH + 2}px)`)
  })

  it('lands on a deep-linked tab without sliding, then animates later moves', async () => {
    render(<Tabs loading={false} initialTab="settings" />)

    const pill = screen.getByTestId('pill')
    expect(pill.style.transform).toBe(`translateX(${2 * TAB_WIDTH + 2}px)`)
    expect(pill).not.toHaveClass('animated')
    await waitFor(() => expect(pill).toHaveClass('animated'))
  })

  it('moves to the tab that is clicked', () => {
    render(<Tabs loading={false} />)

    act(() => screen.getByRole('tab', { name: 'friends' }).click())

    expect(screen.getByTestId('pill').style.transform).toBe(`translateX(${TAB_WIDTH + 2}px)`)
  })
})
