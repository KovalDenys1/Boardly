import { createSocketErrorHandler } from '../../../lib/socket/handlers/socket-error'

describe('createSocketErrorHandler', () => {
  it('logs socket error with socket id context', () => {
    const logger = {
      error: jest.fn(),
    }
    const handler = createSocketErrorHandler({ logger })
    const error = new Error('boom')
    const socket = { id: 'socket-1' }

    handler(socket, error)

    expect(logger.error).toHaveBeenCalledWith('Socket error', error, { socketId: 'socket-1' })
  })
})
