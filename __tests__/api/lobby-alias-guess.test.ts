/**
 * @jest-environment @edge-runtime/jest-environment
 */

/**
 * POST /api/lobby/[code]/alias-guess (GHSA-g868-9224-wr3p).
 *
 * Alias guesses used to be sent client to client on the lobby topic with the
 * sender's name in the payload, so anyone holding the topic could guess as
 * somebody else. Receivers now ignore every lobby frame the server did not
 * sign, and guesses come through here: the server checks who is guessing and
 * broadcasts the guess under the session's own name.
 */

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lobby/[code]/alias-guess/route'
import { prisma } from '@/lib/db'
import { getRequestAuthUser } from '@/lib/request-auth'
import { broadcastToLobby } from '@/lib/supabase-server'
import { canPostAliasGuess } from '@/lib/games/alias-guess'

jest.mock('@/lib/db', () => ({
  prisma: { lobbies: { findUnique: jest.fn() } },
}))
jest.mock('@/lib/request-auth', () => ({ getRequestAuthUser: jest.fn() }))
jest.mock('@/lib/supabase-server', () => ({ broadcastToLobby: jest.fn() }))

const DESCRIBER = 'user-describer'
const GUESSER = 'user-guesser'
const OTHER_TEAM = 'user-other-team'

const mockAuth = getRequestAuthUser as jest.MockedFunction<typeof getRequestAuthUser>
const mockBroadcast = broadcastToLobby as jest.MockedFunction<typeof broadcastToLobby>
const mockFindLobby = prisma.lobbies.findUnique as jest.Mock

function aliasState(phase = 'turn_active') {
  return {
    status: 'playing',
    data: {
      phase,
      currentTeamIndex: 0,
      teams: [
        { id: 'team-1', name: 'Team 1', playerIds: [DESCRIBER, GUESSER], score: 0, describerIndex: 0 },
        { id: 'team-2', name: 'Team 2', playerIds: [OTHER_TEAM], score: 0, describerIndex: 0 },
      ],
    },
  }
}

function seed({ gameType = 'alias', state = aliasState(), seated = true } = {}) {
  mockFindLobby.mockResolvedValue({
    games: [{ id: 'game-1', gameType, state: JSON.stringify(state), players: seated ? [{ id: 'p-1' }] : [] }],
  })
}

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost:3000/api/lobby/ABCD/alias-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code: 'ABCD' }) }
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  mockBroadcast.mockResolvedValue(true)
  mockAuth.mockResolvedValue({ id: GUESSER, username: 'Bea', isGuest: true })
})

describe('POST /api/lobby/[code]/alias-guess', () => {
  it('broadcasts the guess under the name the session carries, not one from the request', async () => {
    seed()

    const res = await post({ message: '  banana ', username: 'Somebody Else', userId: DESCRIBER })

    expect(res.status).toBe(200)
    expect(mockBroadcast).toHaveBeenCalledTimes(1)
    const [code, event, payload] = mockBroadcast.mock.calls[0]
    expect(code).toBe('ABCD')
    expect(event).toBe('chat-message')
    expect(payload).toMatchObject({ userId: GUESSER, username: 'Bea', message: 'banana', type: 'alias-guess', gameId: 'game-1' })
  })

  it('refuses a caller who is not signed in', async () => {
    mockAuth.mockResolvedValue(null)
    seed()
    expect((await post({ message: 'banana' })).status).toBe(401)
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('refuses an empty guess and one longer than the guess box allows', async () => {
    seed()
    expect((await post({ message: '   ' })).status).toBe(400)
    expect((await post({ message: 'x'.repeat(81) })).status).toBe(400)
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('refuses someone who is not seated in the game', async () => {
    seed({ seated: false })
    expect((await post({ message: 'banana' })).status).toBe(403)
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('refuses when the lobby is not running an Alias game', async () => {
    seed({ gameType: 'tic_tac_toe' })
    expect((await post({ message: 'banana' })).status).toBe(409)
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('refuses the describer and anyone guessing between turns, as the page does', async () => {
    mockAuth.mockResolvedValue({ id: DESCRIBER, username: 'Dee', isGuest: false })
    seed()
    expect((await post({ message: 'banana' })).status).toBe(409)

    mockAuth.mockResolvedValue({ id: GUESSER, username: 'Bea', isGuest: true })
    seed({ state: aliasState('turn_results') })
    expect((await post({ message: 'banana' })).status).toBe(409)
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('says so when the broadcast could not be sent', async () => {
    seed()
    mockBroadcast.mockResolvedValue(false)
    expect((await post({ message: 'banana' })).status).toBe(502)
  })
})

describe('canPostAliasGuess', () => {
  it('lets every seated non-describer guess during a turn, the other team included', () => {
    expect(canPostAliasGuess(aliasState(), GUESSER)).toBe(true)
    expect(canPostAliasGuess(aliasState(), OTHER_TEAM)).toBe(true)
    expect(canPostAliasGuess(aliasState(), DESCRIBER)).toBe(false)
    expect(canPostAliasGuess(null, GUESSER)).toBe(false)
  })
})
