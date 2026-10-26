import { SITE_NAV_ITEMS, isNavItemActive, visibleNavItems } from '@/lib/site-nav'

const byId = (id: string) => {
  const item = SITE_NAV_ITEMS.find((candidate) => candidate.id === id)
  if (!item) throw new Error(`no nav item ${id}`)
  return item
}

describe('site nav', () => {
  it('lists the public items in order and adds Friends for a member', () => {
    expect(visibleNavItems({ isAuthenticated: false }).map((item) => item.href)).toEqual([
      '/', '/games', '/lobby', '/leaderboard', '/guides',
    ])
    expect(visibleNavItems({ isAuthenticated: true }).map((item) => item.href)).toEqual([
      '/', '/games', '/lobby', '/leaderboard', '/guides', '/friends',
    ])
  })

  it('matches Home exactly and the others by prefix', () => {
    expect(isNavItemActive(byId('home'), '/')).toBe(true)
    expect(isNavItemActive(byId('home'), '/games')).toBe(false)
    expect(isNavItemActive(byId('games'), '/games/checkers')).toBe(true)
    expect(isNavItemActive(byId('lobbies'), '/lobby/ABCD')).toBe(true)
    expect(isNavItemActive(byId('guides'), null)).toBe(false)
  })
})
