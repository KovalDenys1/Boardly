import { prisma } from '@/lib/db'
import { deleteDiscordWebhookMessage } from '@/lib/discord-webhook'
import { deleteFeedbackDiscordCopies } from '@/lib/feedback-discord'

jest.mock('@/lib/db', () => ({
  prisma: { feedback: { findMany: jest.fn(), updateMany: jest.fn() } },
}))

jest.mock('@/lib/discord-webhook', () => ({ deleteDiscordWebhookMessage: jest.fn() }))

jest.mock('@/lib/logger', () => ({
  apiLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const findMany = prisma.feedback.findMany as jest.Mock
const updateMany = prisma.feedback.updateMany as jest.Mock
const deleteMessage = deleteDiscordWebhookMessage as jest.Mock
const WEBHOOK = 'https://discord.com/api/webhooks/1/abc'

describe('deleteFeedbackDiscordCopies', () => {
  const originalUrl = process.env.FEEDBACK_DISCORD_WEBHOOK_URL

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = WEBHOOK
  })

  afterAll(() => {
    process.env.FEEDBACK_DISCORD_WEBHOOK_URL = originalUrl
  })

  it('only looks at rows that have a Discord copy', async () => {
    findMany.mockResolvedValue([])

    await expect(deleteFeedbackDiscordCopies({ userId: { in: ['u1'] } })).resolves.toEqual({ cleared: [], failed: [] })
    expect(findMany).toHaveBeenCalledWith({
      where: { AND: [{ userId: { in: ['u1'] } }, { discordMessageId: { not: null } }] },
      select: { id: true, discordMessageId: true },
    })
    expect(deleteMessage).not.toHaveBeenCalled()
  })

  it('deletes each copy, clears the ids it deleted and reports the ones Discord refused', async () => {
    findMany.mockResolvedValue([
      { id: 'f1', discordMessageId: 'm1' },
      { id: 'f2', discordMessageId: 'm2' },
    ])
    deleteMessage.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('HTTP 500'))

    await expect(deleteFeedbackDiscordCopies({})).resolves.toEqual({ cleared: ['f1'], failed: ['f2'] })
    expect(deleteMessage).toHaveBeenCalledWith(WEBHOOK, 'm1')
    expect(deleteMessage).toHaveBeenCalledWith(WEBHOOK, 'm2')
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ['f1'] } }, data: { discordMessageId: null } })
  })

  it('keeps every id when the webhook URL is not configured', async () => {
    delete process.env.FEEDBACK_DISCORD_WEBHOOK_URL
    findMany.mockResolvedValue([{ id: 'f1', discordMessageId: 'm1' }])

    await expect(deleteFeedbackDiscordCopies({})).resolves.toEqual({ cleared: [], failed: ['f1'] })
    expect(deleteMessage).not.toHaveBeenCalled()
    expect(updateMany).not.toHaveBeenCalled()
  })
})
