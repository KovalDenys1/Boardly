// Learn more: https://github.com/testing-library/jest-dom
require('@testing-library/jest-dom')

// Polyfill for TextEncoder/TextDecoder
const { TextEncoder, TextDecoder } = require('util')
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock localStorage for Jest environment
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value)
    },
    removeItem: (key) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index) => {
      const keys = Object.keys(store)
      return keys[index] || null
    },
  }
})()

// Set localStorage on both global and window (for jsdom environment)
global.localStorage = localStorageMock
global.sessionStorage = localStorageMock

// Configure window object in jsdom environment
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  })
  Object.defineProperty(window, 'sessionStorage', {
    value: localStorageMock,
    writable: true,
  })
}

// Mock matchMedia for components using media queries in tests
if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

if (typeof global.ResizeObserver === 'undefined') {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  global.ResizeObserver = ResizeObserverMock
  if (typeof window !== 'undefined') {
    window.ResizeObserver = ResizeObserverMock
  }
}

// Polyfill for fetch API (using whatwg-fetch for Jest compatibility)
require('whatwg-fetch')

// Mock nanoid for lobby code generation
jest.mock('nanoid', () => ({
  customAlphabet: (alphabet, size) => {
    let counter = 0
    return () => {
      // Deterministic generator that respects alphabet and requested size.
      // This keeps tests stable while matching runtime signature.
      const start = counter
      counter += 1

      let code = ''
      for (let i = 0; i < size; i += 1) {
        code += alphabet[(start + i) % alphabet.length]
      }

      return code
    }
  },
  nanoid: () => 'test-id-123',
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      pathname: '/',
      query: {},
      asPath: '/',
    }
  },
  useSearchParams() {
    return {
      get: jest.fn(),
    }
  },
  usePathname() {
    return '/'
  },
}))

// #1054: ENABLE_IN_DEVELOPMENT_GAMES promotes every in-development game to `available`,
// which is exactly what a developer wants in their own .env.local while playing an
// unreleased game - and next/jest loads .env.local into the test run too. Left in place it
// would silently invert the expectations of every suite that asserts Liar's Party or
// Sketch & Guess is still gated, and the failures would point at the suites rather than at
// the env file. Suites that need the flag set it themselves.
delete process.env.ENABLE_IN_DEVELOPMENT_GAMES
delete process.env.NEXT_PUBLIC_ENABLE_IN_DEVELOPMENT_GAMES

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  useSession() {
    return {
      data: null,
      status: 'unauthenticated',
    }
  },
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})
