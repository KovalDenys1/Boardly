import {
  clearLastAccount,
  getLastAccount,
  pruneUnrememberedLastAccount,
  rememberLastAccount,
  saveLastAccount,
} from '@/lib/last-account'

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

  it('clears a stored account', () => {
    saveLastAccount({ email: 'user@test.com', name: null, image: null })
    clearLastAccount()
    expect(localStorage.getItem('boardly_last_account')).toBeNull()
  })

  describe('only with "Remember me" (#1133, ekomloven § 3-15)', () => {
    it('stores the address when the box is ticked', () => {
      rememberLastAccount(true, { email: 'user@test.com', name: null, image: null })
      expect(getLastAccount()?.email).toBe('user@test.com')
    })

    it('stores nothing when the box is unticked', () => {
      rememberLastAccount(false, { email: 'user@test.com', name: null, image: null })
      expect(localStorage.getItem('boardly_last_account')).toBeNull()
    })

    it('removes an address an earlier sign-in stored when the box is unticked', () => {
      rememberLastAccount(true, { email: 'old@test.com', name: null, image: null })
      rememberLastAccount(false, { email: 'new@test.com', name: null, image: null })
      expect(localStorage.getItem('boardly_last_account')).toBeNull()
    })

    it('marks what it stores as remembered', () => {
      rememberLastAccount(true, { email: 'user@test.com', name: null, image: null })
      expect(JSON.parse(localStorage.getItem('boardly_last_account')!)).toMatchObject({ rememberMe: true })
    })
  })

  describe('entries written before the rule (#1133)', () => {
    const legacy = JSON.stringify({ email: 'legacy@test.com', name: null, image: null })

    it('removes an unmarked entry on app start', () => {
      localStorage.setItem('boardly_last_account', legacy)
      pruneUnrememberedLastAccount()
      expect(localStorage.getItem('boardly_last_account')).toBeNull()
    })

    it('keeps a marked entry on app start', () => {
      saveLastAccount({ email: 'user@test.com', name: null, image: null })
      pruneUnrememberedLastAccount()
      expect(getLastAccount()?.email).toBe('user@test.com')
    })

    it('never offers an unmarked entry on the login page, and removes it', () => {
      localStorage.setItem('boardly_last_account', legacy)
      expect(getLastAccount()).toBeNull()
      expect(localStorage.getItem('boardly_last_account')).toBeNull()
    })
  })
})
