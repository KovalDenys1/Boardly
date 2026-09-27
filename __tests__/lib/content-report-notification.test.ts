/**
 * #1172: the staff notification for a report, and which seats open a player card.
 */
import {
  buildContentReportDiscordPayload,
  contentReportPreview,
  escapeDiscordMarkdown,
} from '@/lib/content-report-notification'
import { FEEDBACK_PREVIEW_CHARS } from '@/lib/feedback-notification'
import { reportablePlayerId } from '@/lib/reportable-player'

describe('content report notification (#1172)', () => {
  it('shows a hostile masked link as the characters it is', () => {
    const escaped = escapeDiscordMarkdown('[free nitro](https://evil.example) **now**')
    expect(escaped).toBe('\\[free nitro\\]\\(https://evil.example\\) \\*\\*now\\*\\*')
  })

  it('keeps a text preview short', () => {
    const preview = contentReportPreview({ targetType: 'chat_message', contentSnapshot: 'a'.repeat(900), round: null })
    expect(Array.from(preview).length).toBeLessThanOrEqual(FEEDBACK_PREVIEW_CHARS)
  })

  it('describes an avatar and a drawing instead of showing them', () => {
    expect(
      contentReportPreview({ targetType: 'avatar', contentSnapshot: 'https://cdn.example/avatars/u1.png', round: null })
    ).not.toContain('cdn.example')
    expect(contentReportPreview({ targetType: 'drawing', contentSnapshot: '{"strokes":[]}', round: 4 })).toContain('round 4')
  })

  it('pings nobody and names the evidence it rests on', () => {
    const payload = buildContentReportDiscordPayload({
      reportId: 'report_1',
      targetType: 'bio',
      reason: 'hate',
      contentSnapshot: '@everyone look',
      snapshotSource: 'reporter',
      round: null,
    })
    expect(payload.allowed_mentions).toEqual({ parse: [] })
    const fields = payload.embeds[0].fields
    expect(fields.map((field) => field.name)).toEqual(['Target', 'Reason', 'Report id', 'Evidence'])
    expect(fields[3].value).toContain("reporter's copy")
  })
})

describe('reportablePlayerId (#1172)', () => {
  const players = [
    { userId: 'human_1', user: { bot: null } },
    { userId: 'bot_new', user: { bot: { difficulty: 'easy' } } },
    { userId: 'bot_old', bot: { id: 'b' }, user: null },
  ]

  it('passes a human through', () => {
    expect(reportablePlayerId(players, 'human_1')).toBe('human_1')
  })

  it('holds back a bot in either shape', () => {
    expect(reportablePlayerId(players, 'bot_new')).toBeNull()
    expect(reportablePlayerId(players, 'bot_old')).toBeNull()
  })

  it('holds back an empty seat', () => {
    expect(reportablePlayerId(players, undefined)).toBeNull()
    expect(reportablePlayerId(players, '')).toBeNull()
  })
})
