import { deleteDiscordWebhookMessage, postDiscordWebhookMessage, sendDiscordEmbed } from '@/lib/discord-webhook'

describe('postDiscordWebhookMessage / deleteDiscordWebhookMessage', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts with wait=true, keeps existing query parameters and returns the message id', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '123' }) })

    await expect(postDiscordWebhookMessage('https://discord.com/api/webhooks/1/abc?thread_id=9', {})).resolves.toBe('123')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://discord.com/api/webhooks/1/abc?thread_id=9&wait=true')
  })

  it('returns null when Discord sends no message back', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('no body') } })

    await expect(postDiscordWebhookMessage('https://discord.com/api/webhooks/1/abc', {})).resolves.toBeNull()
  })

  it('deletes the message under the webhook path and treats 404 as already gone', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' })

    await expect(deleteDiscordWebhookMessage('https://discord.com/api/webhooks/1/abc', '123')).resolves.toBeUndefined()
    expect(global.fetch).toHaveBeenCalledWith('https://discord.com/api/webhooks/1/abc/messages/123', { method: 'DELETE' })
  })

  it('throws on any other failed delete', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'slow down' })

    await expect(deleteDiscordWebhookMessage('https://discord.com/api/webhooks/1/abc', '123')).rejects.toThrow('HTTP 429')
  })
})

describe('sendDiscordEmbed', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('posts the payload as JSON to the webhook URL', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true })

    await sendDiscordEmbed('https://discord.com/api/webhooks/1/abc', { embeds: [{ title: 'hi' }] })

    expect(global.fetch).toHaveBeenCalledWith('https://discord.com/api/webhooks/1/abc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [{ title: 'hi' }] }),
    })
  })

  it('throws with the status and body on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"retry_after":1.2}',
    })

    await expect(sendDiscordEmbed('https://discord.com/api/webhooks/1/abc', {})).rejects.toThrow(
      'Discord webhook failed with HTTP 429: {"retry_after":1.2}'
    )
  })
})
