import { isCurrentUsernameValue } from '@/components/UsernameInput'

describe('UsernameInput helpers', () => {
  it('treats the unchanged username as the current username value', () => {
    expect(isCurrentUsernameValue('PlayerOne', 'PlayerOne')).toBe(true)
    expect(isCurrentUsernameValue('PlayerTwo', 'PlayerOne')).toBe(false)
    expect(isCurrentUsernameValue('PlayerOne')).toBe(false)
  })
})
