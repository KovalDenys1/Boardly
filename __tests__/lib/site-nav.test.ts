import { SITE_NAV_ITEMS, isNavItemActive, shouldGateNav, visibleNavItems } from '@/lib/site-nav'

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

  it('gates a member route only for a signed-out visitor who is not a guest', () => {
    const friends = byId('friends')
    expect(shouldGateNav(friends, { isAuthenticated: false, isGuest: false })).toBe(true)
    expect(shouldGateNav(friends, { isAuthenticated: false, isGuest: true })).toBe(false)
    expect(shouldGateNav(friends, { isAuthenticated: true })).toBe(false)
    expect(shouldGateNav(byId('games'), { isAuthenticated: false, isGuest: false })).toBe(false)
  })
})
