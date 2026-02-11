/**
 * @jest-environment @edge-runtime/jest-environment
 */
// @ts-nocheck - Jest mocks for Prisma are complex to type

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/lobby/route'
import { POST as JOIN_LOBBY } from '@/app/api/lobby/[code]/route'
import { POST as ADD_BOT } from '@/app/api/lobby/[code]/add-bot/route'
import { POST as LEAVE_LOBBY } from '@/app/api/lobby/[code]/leave/route'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'

// Mock dependencies
jest.mock('@/lib/db', () => ({
    prisma: {
        lobbies: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        games: {
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        players: {
            create: jest.fn(),
            findFirst: jest.fn(),
            findUnique: jest.fn(),
            delete: jest.fn(),
            count: jest.fn(),
        },
        users: {
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
    },
}))

jest.mock('next-auth', () => ({
    getServerSession: jest.fn(),
}))

jest.mock('@/lib/next-auth', () => ({
    authOptions: {},
}))

jest.mock('@/lib/socket-url', () => ({
    notifySocket: jest.fn(),
    getServerSocketUrl: jest.fn(() => 'http://localhost:3001'),
}))

jest.mock('@/lib/logger', () => ({
    apiLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}))

jest.mock('@/lib/lobby', () => ({
    generateLobbyCode: jest.fn(() => 'TEST123'),
}))

jest.mock('@/lib/rate-limit', () => ({
    rateLimit: jest.fn(() => jest.fn(() => Promise.resolve(null))),
    rateLimitPresets: {
        lobbyCreation: {},
    },
}))

jest.mock('@/lib/bot-helpers', () => ({
    createBot: jest.fn(() => ({
        id: 'bot_123',
        username: 'Bot Player',
        email: 'bot@boardly.bot',
        isGuest: false,
    })),
}))

describe.skip('Guest Mode API Endpoints', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('POST /api/lobby - Create Lobby as Guest', () => {
        it('should create lobby with guest user', async () => {
            const guestId = 'guest_123'
            const guestName = 'Test Guest'

                // Mock no session (guest mode)
                ; (getServerSession as jest.Mock).mockResolvedValue(null)

                // Mock guest user creation (getOrCreateGuestUser uses findFirst)
                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(null)
                ; (prisma.users.create as jest.Mock).mockResolvedValue({
                    id: guestId,
                    username: guestName,
                    email: `${guestId}@guest.boardly.online`,
                    isGuest: true,
                })

                // Mock lobby creation
                ; (prisma.lobbies.create as jest.Mock).mockResolvedValue({
                    id: 'lobby_123',
                    code: 'TEST123',
                    name: 'Guest Lobby',
                    creatorId: guestId,
                    maxPlayers: 4,
                })

            const req = new NextRequest('http://localhost:3000/api/lobby', {
                method: 'POST',
                headers: {
                    'X-Guest-Id': guestId,
                    'X-Guest-Name': guestName,
                },
                body: JSON.stringify({
                    name: 'Guest Lobby',
                    maxPlayers: 4,
                    gameType: 'yahtzee',
                }),
            })

            const response = await POST(req)
            const data = await response.json()

            expect(response.status).toBe(200)
            expect(data.lobby.code).toBe('TEST123')
            expect(prisma.users.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    id: guestId,
                    username: guestName,
                    isGuest: true,
                }),
            })
        })

        it('should return 401 without guest headers', async () => {
            ; (getServerSession as jest.Mock).mockResolvedValue(null)

            const req = new NextRequest('http://localhost:3000/api/lobby', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'Test Lobby',
                    maxPlayers: 4,
                }),
            })

            const response = await POST(req)

            expect(response.status).toBe(401)
        })
    })

    describe('POST /api/lobby/[code] - Join Lobby as Guest', () => {
        it('should allow guest to join lobby', async () => {
            const guestId = 'guest_456'
            const guestName = 'Guest Player'

                ; (getServerSession as jest.Mock).mockResolvedValue(null)

                // Mock guest user (getOrCreateGuestUser uses findFirst then update)
                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue({
                    id: guestId,
                    username: guestName,
                    email: `${guestId}@guest.boardly.online`,
                    isGuest: true,
                })
                ; (prisma.users.update as jest.Mock).mockResolvedValue({
                    id: guestId,
                    username: guestName,
                    email: `${guestId}@guest.boardly.online`,
                    isGuest: true,
                })

                // Mock lobby (route uses lobbies.findUnique with include: { games })
                ; (prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
                    id: 'lobby_123',
                    code: 'TEST123',
                    name: 'Test Lobby',
                    maxPlayers: 4,
                    password: null,
                    games: [
                        {
                            id: 'game_123',
                            status: 'waiting',
                            state: JSON.stringify({ scores: [] }),
                        },
                    ],
                })

                // Mock player not already in game
                ; (prisma.players.findUnique as jest.Mock).mockResolvedValue(null)

                // Mock player count
                ; (prisma.players.count as jest.Mock).mockResolvedValue(1)

                // Mock player creation
                ; (prisma.players.create as jest.Mock).mockResolvedValue({
                    id: 'player_123',
                    userId: guestId,
                    gameId: 'game_123',
                    user: {
                        id: guestId,
                        username: guestName,
                        isGuest: true,
                    },
                })

                // Mock game state update
                ; (prisma.games.update as jest.Mock).mockResolvedValue({})

            const req = new NextRequest('http://localhost:3000/api/lobby/TEST123', {
                method: 'POST',
                headers: {
                    'X-Guest-Id': guestId,
                    'X-Guest-Name': guestName,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({}),
            })

            const response = await JOIN_LOBBY(req, { params: Promise.resolve({ code: 'TEST123' }) })
            const data = await response.json()

            expect(response.status).toBe(200)
            expect(data.player).toBeDefined()
            expect(data.player.userId).toBe(guestId)
        })
    })

    describe('POST /api/lobby/[code]/add-bot - Guest can add bot', () => {
        it('should allow guest lobby creator to add bot', async () => {
            const guestId = 'guest_789'

                ; (getServerSession as jest.Mock).mockResolvedValue(null)

                // Mock lobby with guest as creator
                ; (prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
                    id: 'lobby_123',
                    code: 'TEST123',
                    creatorId: guestId,
                    maxPlayers: 4,
                    gameType: 'yahtzee',
                    games: [
                        {
                            id: 'game_123',
                            status: 'waiting',
                            players: [
                                {
                                    id: 'player_1',
                                    userId: guestId,
                                    user: {
                                        id: guestId,
                                        username: 'Guest',
                                        bot: null,
                                    },
                                },
                            ],
                        },
                    ],
                })

                // Mock bot user lookup (findFirst returns null → triggers createBot)
                ; (prisma.users.findFirst as jest.Mock).mockResolvedValue(null)

                // Mock bot creation
                ; (prisma.players.create as jest.Mock).mockResolvedValue({
                    id: 'bot_player_123',
                    userId: 'bot_123',
                    gameId: 'game_123',
                })

                // Mock updated game fetch
                ; (prisma.games.findUnique as jest.Mock).mockResolvedValue({
                    id: 'game_123',
                    status: 'waiting',
                    players: [
                        {
                            id: 'player_1',
                            userId: guestId,
                            user: { id: guestId, username: 'Guest', bot: null },
                        },
                        {
                            id: 'bot_player_123',
                            userId: 'bot_123',
                            user: { id: 'bot_123', username: 'AI Bot', bot: { id: 'b1', botType: 'yahtzee', difficulty: 'medium' } },
                        },
                    ],
                })

            const req = new NextRequest('http://localhost:3000/api/lobby/TEST123/add-bot', {
                method: 'POST',
                headers: {
                    'X-Guest-Id': guestId,
                },
            })

            const response = await ADD_BOT(req, { params: Promise.resolve({ code: 'TEST123' }) })

            expect(response.status).toBe(200)
        })

        it('should return 403 if guest is not lobby creator', async () => {
            const guestId = 'guest_not_creator'

                ; (getServerSession as jest.Mock).mockResolvedValue(null)

                // Mock lobby with different creator
                ; (prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
                    id: 'lobby_123',
                    code: 'TEST123',
                    creatorId: 'other_user',
                    maxPlayers: 4,
                    games: [
                        {
                            id: 'game_123',
                            status: 'waiting',
                            players: [],
                        },
                    ],
                })

            const req = new NextRequest('http://localhost:3000/api/lobby/TEST123/add-bot', {
                method: 'POST',
                headers: {
                    'X-Guest-Id': guestId,
                },
            })

            const response = await ADD_BOT(req, { params: Promise.resolve({ code: 'TEST123' }) })

            expect(response.status).toBe(403)
        })
    })

    describe('POST /api/lobby/[code]/leave - Guest can leave lobby', () => {
        it('should allow guest to leave lobby', async () => {
            const guestId = 'guest_leave'

                ; (getServerSession as jest.Mock).mockResolvedValue(null)

                // Mock lobby with guest player
                ; (prisma.lobbies.findUnique as jest.Mock).mockResolvedValue({
                    id: 'lobby_123',
                    code: 'TEST123',
                    games: [
                        {
                            id: 'game_123',
                            status: 'waiting',
                            players: [
                                {
                                    id: 'player_guest',
                                    userId: guestId,
                                    user: {
                                        id: guestId,
                                        username: 'Guest Player',
                                    },
                                },
                            ],
                        },
                    ],
                })

                ; (prisma.players.delete as jest.Mock).mockResolvedValue({})
                ; (prisma.players.count as jest.Mock).mockResolvedValue(0)

            const req = new NextRequest('http://localhost:3000/api/lobby/TEST123/leave', {
                method: 'POST',
                headers: {
                    'X-Guest-Id': guestId,
                },
            })

            const response = await LEAVE_LOBBY(req, { params: Promise.resolve({ code: 'TEST123' }) })

            expect(response.status).toBe(200)
            expect(prisma.players.delete).toHaveBeenCalled()
        })
    })
})
