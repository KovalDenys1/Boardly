import React, { useEffect } from 'react'
import { render, act } from '@testing-library/react'

const probe: { results: Record<string, boolean>; mounted: number } = { results: {}, mounted: 0 }

jest.mock('next/navigation', () => ({
  useParams: () => ({ code: 'ABCD' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/lobby/ABCD',
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { id: 'u1' } } }) }))
jest.mock('@/contexts/GuestContext', () => ({ useGuest: () => ({ isGuest: false, guestToken: null, guestId: null, guestName: null }) }))
jest.mock('@/app/lobby/[code]/hooks/useLobbyRouteState', () => ({
  useLobbyRouteState: () => ({ gameType: 'tic_tac_toe', gameStatus: 'playing', loading: false, handleGameStarted: jest.fn(), handleGameReset: jest.fn() }),
}))
jest.mock('@/lib/analytics', () => new Proxy({}, { get: (_t, k) => (k === '__esModule' ? true : jest.fn()) }))
jest.mock('@/lib/supabase-client', () => ({ getSupabaseClient: jest.fn(() => ({ channel: jest.fn(), removeChannel: jest.fn() })) }))
jest.mock('@/lib/lobby-realtime-topic-client', () => ({ fetchLobbyTopic: jest.fn(async () => 'x') }))
jest.mock('@/lib/client-logger', () => ({ clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() } }))
jest.mock('@/hooks/useSoundConsumer', () => {
  const actual = jest.requireActual('@/hooks/useSoundConsumer')
  return { useSoundConsumer: jest.fn(actual.useSoundConsumer) }
})
// Every dynamic() game page becomes a stub; the test then plays through the real engine as tic-tac-toe-page.tsx does.
jest.mock('next/dynamic', () => () => {
  const Stub = () => {
    useEffect(() => { probe.mounted += 1 }, [])
    return <div data-testid="dedicated-stub" />
  }
  return Stub
})

class MockNode { connect = jest.fn(); disconnect = jest.fn() }
class MockCtx {
  static instances: MockCtx[] = []
  state = 'suspended'; currentTime = 1; sampleRate = 48000; destination = new MockNode()
  constructor() { MockCtx.instances.push(this) }
  createGain() { return Object.assign(new MockNode(), { gain: { value: 1 } }) }
  createBufferSource() { return Object.assign(new MockNode(), { buffer: null, playbackRate: { value: 1 }, start: jest.fn(), stop: jest.fn(), onended: null }) }
  createBuffer() { return { length: 1, numberOfChannels: 1, sampleRate: 48000, getChannelData: () => new Float32Array(1) } }
  decodeAudioData = jest.fn(async () => ({ length: 10, numberOfChannels: 1, sampleRate: 48000, getChannelData: () => new Float32Array(10).fill(0.5) }))
  resume = jest.fn(async () => { this.state = 'running' })
  suspend = jest.fn(async () => { this.state = 'suspended' })
  close = jest.fn(async () => { this.state = 'closed' })
}

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  Object.assign(window, { AudioContext: MockCtx, OfflineAudioContext: class { decodeAudioData = jest.fn(async () => ({ length: 10, numberOfChannels: 1, sampleRate: 48000, getChannelData: () => new Float32Array(10).fill(0.5) })) } })
  global.fetch = jest.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch
})

it('LobbyPage holds the sound consumer while a dedicated game page renders in place of the shell', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getSoundEngine } = require('@/lib/sound-engine')
  await getSoundEngine().preload(['turn.mine', 'result.win'])
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const LobbyPage = require('@/app/lobby/[code]/LobbyPageClient').default
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSoundConsumer } = require('@/hooks/useSoundConsumer')
  await act(async () => { render(<LobbyPage />) })
  const tap = new Event('pointerup')
  Object.defineProperty(tap, 'pointerType', { value: 'touch' })
  window.dispatchEvent(tap)
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
  probe.results.turn = getSoundEngine().play('turn.mine')
  probe.results.win = getSoundEngine().play('result.win')
  expect(probe.mounted).toBe(1)
  expect(useSoundConsumer).toHaveBeenCalled()
  expect(MockCtx.instances.length).toBeGreaterThan(0)
  expect(probe.results).toEqual({ turn: true, win: true })
})
