import { createOnlinePresence } from '@/lib/socket/online-presence'

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

  it('marks user online without broadcasting raw presence', () => {
    const { io, logger } = createDeps()
    const presence = createOnlinePresence(io, logger)

    presence.markUserOnline('user-1', 'socket-1')

    expect(io.emit).not.toHaveBeenCalled()
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

    expect(io.emit).not.toHaveBeenCalled()
    expect(presence.isUserOnline('user-1')).toBe(true)
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('marks user offline only after last socket disconnects', () => {
    const { io, logger } = createDeps()
    const presence = createOnlinePresence(io, logger)

    presence.markUserOnline('user-1', 'socket-1')
    presence.markUserOffline('user-1', 'socket-1')

    expect(io.emit).not.toHaveBeenCalled()
    expect(presence.isUserOnline('user-1')).toBe(false)
    expect(presence.getOnlineUserIds()).toEqual([])
    expect(logger.info).toHaveBeenCalledTimes(2)
  })
})
