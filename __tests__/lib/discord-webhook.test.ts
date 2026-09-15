import { sendDiscordEmbed } from '@/lib/discord-webhook'

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
