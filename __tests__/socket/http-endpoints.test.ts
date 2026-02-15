import { createServer } from 'http'
import request from 'supertest'
import { registerSocketHttpEndpoints } from '@/lib/socket/http-endpoints'
import { SocketEvents, SocketRooms } from '@/types/socket-events'

describe('registerSocketHttpEndpoints', () => {
  function createHarness() {
    const server = createServer()
    const emits: Array<{ room: string; event: string; payload: unknown }> = []
    const io = {
      to: (room: string) => ({
        emit: (event: string, payload?: unknown) => {
          emits.push({ room, event, payload })
        },
      }),
    }

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }

    registerSocketHttpEndpoints({
      server,
      io,
      logger,
      socketMonitor: {
        getMetrics: jest.fn().mockReturnValue({}),
        isHealthy: jest.fn().mockReturnValue(true),
        getLobbies: jest.fn().mockReturnValue([]),
      },
      dbMonitor: {
        getMetrics: jest.fn().mockReturnValue({}),
      },
      isInternalEndpointAuthorized: jest.fn().mockReturnValue(true),
      getNextSequenceId: jest.fn().mockReturnValue(42),
    })

    return { server, emits, logger }
  }

  afterEach((done) => {
    done()
  })

  it('broadcasts /api/notify payload with metadata', async () => {
    const { server, emits } = createHarness()

    const response = await request(server)
      .post('/api/notify')
      .send({
        room: SocketRooms.lobby('ABCD'),
        event: SocketEvents.GAME_UPDATE,
        data: {
          action: 'state-change',
          payload: {
            state: {
              currentPlayerIndex: 0,
              lastMoveAt: 100,
              data: { rollsLeft: 2 },
              updatedAt: 101,
            },
          },
        },
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.sequenceId).toBe(42)
    expect(emits.some((entry) => entry.room === SocketRooms.lobby('ABCD'))).toBe(true)
    expect(
      emits.some(
        (entry) =>
          entry.room === SocketRooms.lobbyList() && entry.event === SocketEvents.LOBBY_LIST_UPDATE
      )
    ).toBe(true)
  })

  it('deduplicates duplicate state-change notifications', async () => {
    const { server, emits, logger } = createHarness()
    const payload = {
      room: SocketRooms.lobby('DEDUP'),
      event: SocketEvents.GAME_UPDATE,
      data: {
        action: 'state-change',
        payload: {
          state: {
            currentPlayerIndex: 3,
            lastMoveAt: 200,
            data: { rollsLeft: 1 },
            updatedAt: 201,
          },
        },
      },
    }

    const first = await request(server).post('/api/notify').send(payload)
    const second = await request(server).post('/api/notify').send(payload)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body).toEqual({ success: true, deduped: true })
    expect(
      emits.filter(
        (entry) => entry.room === SocketRooms.lobby('DEDUP') && entry.event === SocketEvents.GAME_UPDATE
      )
    ).toHaveLength(1)
    expect(logger.info).toHaveBeenCalledWith(
      'Duplicate state-change notification ignored',
      expect.objectContaining({ room: SocketRooms.lobby('DEDUP') })
    )
  })
})
