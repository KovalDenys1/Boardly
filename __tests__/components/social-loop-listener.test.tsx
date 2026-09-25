/**
 * Invite and rematch toasts arrive on the user's own realtime topic. Before
 * GHSA-g868-9224-wr3p (audit S3-05) that was `user:{userId}`, user ids are
 * public, and a frame anyone sent there became a toast whose button navigated
 * to a lobby of the sender's choosing. These pin the advisory's acceptance
 * case: `lobby-invite` sent by a client produces no toast.
 */
import { render, waitFor } from '@testing-library/react'
import { setImmediate as realSetImmediate } from 'timers'
import { webcrypto } from 'crypto'
import SocialLoopListener from '@/components/SocialLoopListener'
import { __resetLobbyChannelsForTests } from '@/lib/lobby-channel-registry'
import { __resetRealtimeVerifierForTests } from '@/lib/client/realtime-verify'
import {
  __resetRealtimeSigningForTests,
  buildUserTopic,
  getRealtimeVerifyKey,
  sealRealtimeMessage,
} from '@/lib/server/realtime-signing'

const mockToast = jest.fn()
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign((...args: unknown[]) => mockToast(...args), { dismiss: jest.fn() }),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'victim-1' } }, status: 'authenticated' }),
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

let mockUserTopic: string | null = null
jest.mock('@/lib/user-realtime-topic-client', () => ({
  fetchUserTopic: jest.fn(async () => mockUserTopic),
}))

type Binding = { event: string; cb: (msg: { payload: unknown }) => void }
const mockChannels = new Map<string, { bindings: Binding[] }>()
jest.mock('@/lib/supabase-client', () => ({
  getSupabaseClient: () => ({
    channel: (topic: string) => {
      const bindings: Binding[] = []
      const channel = {
        on: (_type: string, filter: { event: string }, cb: Binding['cb']) => {
          bindings.push({ event: filter.event, cb })
          return channel
        },
        subscribe: (cb?: (status: string) => void) => {
          cb?.('SUBSCRIBED')
          return channel
        },
        send: jest.fn(),
      }
      mockChannels.set(topic, { bindings })
      return channel
    },
    removeChannel: jest.fn(async () => undefined),
  }),
}))

function emit(topic: string, event: string, payload: unknown) {
  mockChannels.get(topic)?.bindings.filter((b) => b.event === event).forEach((b) => b.cb({ payload }))
}

async function settle() {
  for (let i = 0; i < 60; i += 1) {
    await new Promise((resolve) => realSetImmediate(resolve))
  }
}

const invite = {
  lobbyCode: '6666',
  lobbyName: 'Totally real lobby',
  gameType: 'yahtzee',
  invitedById: 'friend-1',
  invitedByName: 'Friend',
  inviteUrl: 'https://boardly.online/lobby/6666',
}

const webCrypto = globalThis.crypto
const originalFetch = global.fetch

beforeAll(() => {
  // jsdom has no SubtleCrypto; Node's is the same API the browser has.
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true, writable: true })
})

afterAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webCrypto, configurable: true, writable: true })
  global.fetch = originalFetch
})

beforeEach(() => {
  mockToast.mockReset()
  mockChannels.clear()
  __resetLobbyChannelsForTests()
  __resetRealtimeVerifierForTests()
  process.env.NEXTAUTH_SECRET = 'test-realtime-signing-secret-social-loop-000'
  __resetRealtimeSigningForTests()
  mockUserTopic = buildUserTopic('victim-1')
  const key = getRealtimeVerifyKey()!
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ kid: key.kid, jwk: { kty: 'EC', crv: 'P-256', x: key.x, y: key.y }, serverTime: Date.now() }),
  })) as unknown as typeof fetch
})

describe('SocialLoopListener', () => {
  it('listens on the tagged user topic, not on user:{userId}', async () => {
    render(<SocialLoopListener />)
    await waitFor(() => expect(mockChannels.has(mockUserTopic!)).toBe(true))
    expect(mockChannels.has('user:victim-1')).toBe(false)
  })

  it('shows no toast for a lobby-invite a client sent', async () => {
    render(<SocialLoopListener />)
    await waitFor(() => expect(mockChannels.has(mockUserTopic!)).toBe(true))

    emit(mockUserTopic!, 'lobby-invite', invite)
    emit(mockUserTopic!, 'rematch-request', { ...invite, requestedById: 'x', requestedByName: 'X' })
    await settle()

    expect(mockToast).not.toHaveBeenCalled()
  })

  it('shows the toast for an invite the server signed', async () => {
    render(<SocialLoopListener />)
    await waitFor(() => expect(mockChannels.has(mockUserTopic!)).toBe(true))

    emit(mockUserTopic!, 'lobby-invite', JSON.parse(JSON.stringify(sealRealtimeMessage(mockUserTopic!, 'lobby-invite', invite))))
    await settle()

    expect(mockToast).toHaveBeenCalledTimes(1)
  })

  it('ignores a signed invite whose lobby code is not a lobby code', async () => {
    render(<SocialLoopListener />)
    await waitFor(() => expect(mockChannels.has(mockUserTopic!)).toBe(true))

    const odd = { ...invite, lobbyCode: '../../admin' }
    emit(mockUserTopic!, 'lobby-invite', JSON.parse(JSON.stringify(sealRealtimeMessage(mockUserTopic!, 'lobby-invite', odd))))
    await settle()

    expect(mockToast).not.toHaveBeenCalled()
  })
})
