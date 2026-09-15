import {
  buildInviteLink,
  parseInviteAttribution,
  stripInviteMarker,
} from '@/lib/invite-attribution'

describe('invite attribution (#920)', () => {
  it('builds a lobby link that carries the share marker', () => {
    expect(buildInviteLink('AB12', 'https://boardly.online')).toBe('https://boardly.online/lobby/AB12?via=invite')
    expect(buildInviteLink('AB12', 'http://localhost:3000/')).toBe('http://localhost:3000/lobby/AB12?via=invite')
  })

  it('reads the share marker as a share link, whatever the referrer', () => {
    expect(
      parseInviteAttribution({ search: '?via=invite', referrer: '', currentHostname: 'boardly.online' })
    ).toEqual({ via: 'share_link' })
    expect(
      parseInviteAttribution({ search: '?x=1&via=invite', referrer: 'https://boardly.online/', currentHostname: 'boardly.online' })
    ).toEqual({ via: 'share_link' })
  })

  it('falls back to an external referrer', () => {
    expect(
      parseInviteAttribution({ search: '', referrer: 'https://www.discord.com/channels/1', currentHostname: 'boardly.online' })
    ).toEqual({ via: 'external_referrer', referrerHost: 'discord.com' })
  })

  it('is null for a typed code, own navigation or a malformed referrer', () => {
    expect(parseInviteAttribution({ search: '', referrer: '', currentHostname: 'boardly.online' })).toBeNull()
    expect(
      parseInviteAttribution({ search: '?via=other', referrer: 'https://www.boardly.online/games', currentHostname: 'boardly.online' })
    ).toBeNull()
    expect(parseInviteAttribution({ search: null, referrer: 'not a url', currentHostname: 'boardly.online' })).toBeNull()
  })

  it('strips only the share marker, so a refresh is not a second open', () => {
    expect(stripInviteMarker('https://boardly.online/lobby/AB12?via=invite')).toBe('https://boardly.online/lobby/AB12')
    expect(stripInviteMarker('https://boardly.online/lobby/AB12?tab=chat&via=invite')).toBe('https://boardly.online/lobby/AB12?tab=chat')
    expect(stripInviteMarker('https://boardly.online/lobby/AB12?via=other')).toBe('https://boardly.online/lobby/AB12?via=other')
  })
})
