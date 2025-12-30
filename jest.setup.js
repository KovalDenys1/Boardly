// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'

// Polyfill for TextEncoder/TextDecoder
import { TextEncoder, TextDecoder } from 'util'
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock nanoid for lobby code generation
jest.mock('nanoid', () => ({
  customAlphabet: () => () => 'AB12',
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

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  })),
}))

// Suppress console errors in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
}
