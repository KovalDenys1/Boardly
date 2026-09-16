const afterMock = jest.fn()
jest.mock('next/server', () => ({ after: (...args: unknown[]) => afterMock(...args) }))

import { runAfterResponse } from '@/lib/after-response'

describe('runAfterResponse (#985)', () => {
  beforeEach(() => afterMock.mockReset())

  it('hands the work to after() so the instance is not frozen before it settles', async () => {
    const work = Promise.resolve('done')
    runAfterResponse(work)
    expect(afterMock).toHaveBeenCalledTimes(1)
    expect(afterMock).toHaveBeenCalledWith(work)
    await work
  })

  it('still runs the work when there is no request scope for after() to use', async () => {
    afterMock.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope')
    })
    let ran = false
    const work = Promise.resolve().then(() => {
      ran = true
    })
    expect(() => runAfterResponse(work)).not.toThrow()
    await work
    expect(ran).toBe(true)
  })
})
