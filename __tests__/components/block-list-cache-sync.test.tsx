/**
 * #1466: a signed-in player's block list is copied to the device so chat can hide blocked players
 * before the list loads, and the privacy notice says signing out removes that copy. The header's
 * sign-out, the drawer's and account deletion run on pages without a chat, so the removal lives
 * in an always-mounted component, not in the hook.
 */
import { render } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import BlockListCacheSync from '@/components/BlockListCacheSync'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))

const session = useSession as jest.Mock
const KEY_A = 'boardly_blocked_players_account:user-a'
const KEY_B = 'boardly_blocked_players_account:user-b'
const LIST = JSON.stringify([{ id: 'u9', username: 'Old foe', blockedAt: '2026-10-01T00:00:00.000Z' }])

describe('BlockListCacheSync', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(KEY_A, LIST)
    window.localStorage.setItem(KEY_B, LIST)
    window.localStorage.setItem('boardly_blocked_players', LIST)
  })

  it('removes every account copy once signed out, with no chat on the page, and keeps the guest list', () => {
    session.mockReturnValue({ data: null, status: 'unauthenticated' })
    render(<BlockListCacheSync />)

    expect(window.localStorage.getItem(KEY_A)).toBeNull()
    expect(window.localStorage.getItem(KEY_B)).toBeNull()
    expect(window.localStorage.getItem('boardly_blocked_players')).toBe(LIST)
  })

  it("keeps only the signed-in account's copy", () => {
    session.mockReturnValue({ data: { user: { id: 'user-b' } }, status: 'authenticated' })
    render(<BlockListCacheSync />)

    expect(window.localStorage.getItem(KEY_A)).toBeNull()
    expect(window.localStorage.getItem(KEY_B)).toBe(LIST)
  })

  it('removes the copy when the session ends while the page is open', () => {
    session.mockReturnValue({ data: { user: { id: 'user-a' } }, status: 'authenticated' })
    const { rerender } = render(<BlockListCacheSync />)
    expect(window.localStorage.getItem(KEY_A)).toBe(LIST)

    session.mockReturnValue({ data: null, status: 'unauthenticated' })
    rerender(<BlockListCacheSync />)
    expect(window.localStorage.getItem(KEY_A)).toBeNull()
  })

  it('touches nothing while the session is still loading', () => {
    session.mockReturnValue({ data: null, status: 'loading' })
    render(<BlockListCacheSync />)

    expect(window.localStorage.getItem(KEY_A)).toBe(LIST)
    expect(window.localStorage.getItem(KEY_B)).toBe(LIST)
  })
})
