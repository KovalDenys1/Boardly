import { getLastAccount, saveLastAccount } from '@/lib/last-account'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

beforeEach(() => localStorageMock.clear())

describe('last-account', () => {
  it('returns null when nothing is stored', () => {
    expect(getLastAccount()).toBeNull()
  })

  it('saves and retrieves an account', () => {
    saveLastAccount({ email: 'user@test.com', name: 'Alice', image: null })
    expect(getLastAccount()).toEqual({ email: 'user@test.com', name: 'Alice', image: null })
  })

  it('overwrites a previously saved account', () => {
    saveLastAccount({ email: 'old@test.com', name: 'Old', image: null })
    saveLastAccount({ email: 'new@test.com', name: 'New', image: 'https://img' })
    expect(getLastAccount()?.email).toBe('new@test.com')
  })

  it('returns null when stored JSON is malformed', () => {
    localStorage.setItem('boardly_last_account', 'not-json')
    expect(getLastAccount()).toBeNull()
  })
})
