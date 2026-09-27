/**
 * Guards the read path. persistChatMessage stores a JSON string, but the Upstash
 * REST client deserializes JSON on the way out, so lrange hands back objects.
 * The old code called JSON.parse on them, threw, dropped every entry and
 * returned an empty list — chat history never worked, even with Redis connected
 * (#854). And #801 had made that empty list the only way a message could reach
 * anyone, which is #852.
 */

const lrange = jest.fn()
const lrem = jest.fn()

jest.mock('@upstash/redis', () => ({
  Redis: class {
    lpush = jest.fn()
    ltrim = jest.fn()
    expire = jest.fn()
    lrange = lrange
    lrem = lrem
  },
}))

jest.mock('@/lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }))

const message = (text: string) => ({
  id: `id-${text}`,
  userId: 'u1',
  username: 'Ann',
  message: text,
  lobbyCode: '1234',
  timestamp: 1,
})

describe('getChatHistory', () => {
  beforeEach(() => {
    jest.resetModules()
    lrange.mockReset()
    process.env.KV_REST_API_URL = 'https://example.upstash.io'
    process.env.KV_REST_API_TOKEN = 'token'
  })

  it('reads entries the client already deserialized into objects', async () => {
    lrange.mockResolvedValue([message('second'), message('first')])
    const { getChatHistory } = await import('@/lib/chat-history')

    const history = await getChatHistory('1234')

    // Stored newest-first, returned chronologically.
    expect(history.map((m) => m.message)).toEqual(['first', 'second'])
  })

  it('still reads entries that come back as JSON strings', async () => {
    lrange.mockResolvedValue([JSON.stringify(message('only'))])
    const { getChatHistory } = await import('@/lib/chat-history')

    expect((await getChatHistory('1234')).map((m) => m.message)).toEqual(['only'])
  })

  it('drops entries it cannot make sense of, without losing the rest', async () => {
    lrange.mockResolvedValue([message('good'), 'not json at all', null, 42])
    const { getChatHistory } = await import('@/lib/chat-history')

    expect((await getChatHistory('1234')).map((m) => m.message)).toEqual(['good'])
  })

  it('returns nothing when no Redis is configured', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    const { getChatHistory } = await import('@/lib/chat-history')

    expect(await getChatHistory('1234')).toEqual([])
  })
})

/**
 * Staff removal for the Control Panel (#1231). The list holds the exact strings
 * persistChatMessage pushed; lrange hands them back parsed, as the Upstash client does,
 * and LREM matches by exact string, as Redis does. So a removal only works if the string
 * rebuilt from the parsed entry is the stored one.
 */
describe('removeChatMessage', () => {
  let stored: string[]

  beforeEach(() => {
    jest.resetModules()
    lrange.mockReset()
    lrem.mockReset()
    process.env.KV_REST_API_URL = 'https://example.upstash.io'
    process.env.KV_REST_API_TOKEN = 'token'
    stored = [
      JSON.stringify({ ...message('newest'), message: 'emoji ✓ and "quotes" \\ slash', timestamp: 1790000000123 }),
      JSON.stringify(message('bad')),
      JSON.stringify(message('oldest')),
    ]
    lrange.mockImplementation(async () => stored.map((entry) => JSON.parse(entry)))
    lrem.mockImplementation(async (_key: string, _count: number, value: string) => {
      const before = stored.length
      stored = stored.filter((entry) => entry !== value)
      return before - stored.length
    })
  })

  it('removes exactly the message with that id, by its stored string', async () => {
    const { removeChatMessage } = await import('@/lib/chat-history')

    await expect(removeChatMessage('1234', 'id-bad')).resolves.toBe('removed')

    expect(stored.map((entry) => JSON.parse(entry).id)).toEqual(['id-newest', 'id-oldest'])
    expect(lrem).toHaveBeenCalledWith('chat:lobby:1234', 0, JSON.stringify(message('bad')))
  })

  it('rebuilds a stored string with escapes and non-ASCII byte for byte', async () => {
    const { removeChatMessage } = await import('@/lib/chat-history')

    await expect(removeChatMessage('1234', 'id-newest')).resolves.toBe('removed')

    expect(stored).toHaveLength(2)
  })

  it('answers not_found for an id the history does not hold', async () => {
    const { removeChatMessage } = await import('@/lib/chat-history')

    await expect(removeChatMessage('1234', 'id-never-posted')).resolves.toBe('not_found')
    expect(lrem).not.toHaveBeenCalled()
    expect(stored).toHaveLength(3)
  })

  it('answers unavailable without Redis, and when Redis fails', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    let { removeChatMessage } = await import('@/lib/chat-history')
    await expect(removeChatMessage('1234', 'id-bad')).resolves.toBe('unavailable')

    jest.resetModules()
    process.env.KV_REST_API_URL = 'https://example.upstash.io'
    process.env.KV_REST_API_TOKEN = 'token'
    lrange.mockRejectedValueOnce(new Error('fetch failed'))
    ;({ removeChatMessage } = await import('@/lib/chat-history'))
    await expect(removeChatMessage('1234', 'id-bad')).resolves.toBe('unavailable')
  })
})
