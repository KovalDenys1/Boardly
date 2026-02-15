import { createOnlinePresence } from '@/lib/socket/online-presence'
import { SocketEvents } from '@/types/socket-events'

describe('createOnlinePresence', () => {
  function createDeps() {
    return {
      io: {
        emit: jest.fn(),
      },
      logger: {
        info: jest.fn(),
      },
    }
  }

  it('marks user online and broadcasts event', () => {
    const { io, logger } = createDeps()
    const presence = createOnlinePresence(io, logger)

    presence.markUserOnline('user-1', 'socket-1')

    expect(io.emit).toHaveBeenCalledWith(SocketEvents.USER_ONLINE, { userId: 'user-1' })
    expect(presence.isUserOnline('user-1')).toBe(true)
    expect(presence.getOnlineUserIds()).toEqual(['user-1'])
    expect(logger.info).toHaveBeenCalled()
  })

  it('keeps user online while at least one socket is connected', () => {
    const { io, logger } = createDeps()
    const presence = createOnlinePresence(io, logger)

    presence.markUserOnline('user-1', 'socket-1')
    presence.markUserOnline('user-1', 'socket-2')
    presence.markUserOffline('user-1', 'socket-1')

    expect(io.emit).toHaveBeenCalledTimes(2)
    expect(io.emit).not.toHaveBeenCalledWith(SocketEvents.USER_OFFLINE, { userId: 'user-1' })
    expect(presence.isUserOnline('user-1')).toBe(true)
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('marks user offline only after last socket disconnects', () => {
    const { io, logger } = createDeps()
    const presence = createOnlinePresence(io, logger)

    presence.markUserOnline('user-1', 'socket-1')
    presence.markUserOffline('user-1', 'socket-1')

    expect(io.emit).toHaveBeenNthCalledWith(2, SocketEvents.USER_OFFLINE, { userId: 'user-1' })
    expect(presence.isUserOnline('user-1')).toBe(false)
    expect(presence.getOnlineUserIds()).toEqual([])
    expect(logger.info).toHaveBeenCalledTimes(2)
  })
})
