import {
  buildInviteLink,
  documentLoadedAtLobby,
  parseInviteAttribution,
  readDocumentNavigation,
  stripInviteMarker,
} from '@/lib/invite-attribution'

const HOST = 'boardly.online'
const CODE = 'AB12'
const loadedAtLobby = { url: `https://${HOST}/lobby/${CODE}`, type: 'navigate' }

describe('invite attribution (#920)', () => {
  it('builds a lobby link that carries the share marker', () => {
    expect(buildInviteLink('AB12', 'https://boardly.online')).toBe('https://boardly.online/lobby/AB12?via=invite')
    expect(buildInviteLink('AB12', 'http://localhost:3000/')).toBe('http://localhost:3000/lobby/AB12?via=invite')
  })

  it('reads the share marker as a share link, whatever the referrer or navigation', () => {
    expect(
      parseInviteAttribution({ code: CODE, search: '?via=invite', referrer: '', currentHostname: HOST, navigation: null })
    ).toEqual({ via: 'share_link' })
    expect(
      parseInviteAttribution({
        code: CODE,
        search: '?x=1&via=invite',
        referrer: 'https://boardly.online/',
        currentHostname: HOST,
        navigation: { url: `https://${HOST}/`, type: 'reload' },
      })
    ).toEqual({ via: 'share_link' })
  })

  it('falls back to an external referrer when the document was loaded at the lobby URL', () => {
    expect(
      parseInviteAttribution({
        code: CODE,
        search: '',
        referrer: 'https://www.discord.com/channels/1',
        currentHostname: HOST,
        navigation: loadedAtLobby,
      })
    ).toEqual({ via: 'external_referrer', referrerHost: 'discord.com' })
    // the marker-stripped URL and a trailing slash still describe the same lobby
    expect(
      parseInviteAttribution({
        code: CODE,
        search: '',
        referrer: 'https://t.me/share',
        currentHostname: HOST,
        navigation: { url: `https://${HOST}/lobby/${CODE}/?tab=chat`, type: 'navigate' },
      })
    ).toEqual({ via: 'external_referrer', referrerHost: 't.me' })
  })

  it('ignores the referrer after a soft navigation from another page', () => {
    // landed on / from Google, then Quick Play did router.push('/lobby/AB12') – same document
    expect(
      parseInviteAttribution({
        code: CODE,
        search: '',
        referrer: 'https://www.google.com/',
        currentHostname: HOST,
        navigation: { url: `https://${HOST}/`, type: 'navigate' },
      })
    ).toBeNull()
    // a different lobby's document is not this lobby either
    expect(
      parseInviteAttribution({
        code: CODE,
        search: '',
        referrer: 'https://www.google.com/',
        currentHostname: HOST,
        navigation: { url: `https://${HOST}/lobby/ZZ99`, type: 'navigate' },
      })
    ).toBeNull()
  })

  it('ignores the referrer on a reload or history traversal', () => {
    for (const type of ['reload', 'back_forward', 'prerender']) {
      expect(
        parseInviteAttribution({
          code: CODE,
          search: '',
          referrer: 'https://www.discord.com/channels/1',
          currentHostname: HOST,
          navigation: { url: loadedAtLobby.url, type },
        })
      ).toBeNull()
    }
  })

  it('ignores the referrer when the navigation entry is unavailable', () => {
    for (const navigation of [null, undefined, {}, { url: loadedAtLobby.url }, { type: 'navigate' }]) {
      expect(
        parseInviteAttribution({
          code: CODE,
          search: '',
          referrer: 'https://www.discord.com/channels/1',
          currentHostname: HOST,
          navigation,
        })
      ).toBeNull()
    }
  })

  it('is null for a typed code, own navigation or a malformed referrer', () => {
    expect(
      parseInviteAttribution({ code: CODE, search: '', referrer: '', currentHostname: HOST, navigation: loadedAtLobby })
    ).toBeNull()
    expect(
      parseInviteAttribution({
        code: CODE,
        search: '?via=other',
        referrer: 'https://www.boardly.online/games',
        currentHostname: HOST,
        navigation: loadedAtLobby,
      })
    ).toBeNull()
    expect(
      parseInviteAttribution({ code: CODE, search: null, referrer: 'not a url', currentHostname: HOST, navigation: loadedAtLobby })
    ).toBeNull()
  })

  it('matches the lobby path case-insensitively and rejects other paths', () => {
    expect(documentLoadedAtLobby({ url: `https://${HOST}/lobby/ab12`, type: 'navigate' }, 'AB12')).toBe(true)
    expect(documentLoadedAtLobby({ url: `https://${HOST}/lobby/AB123`, type: 'navigate' }, 'AB12')).toBe(false)
    expect(documentLoadedAtLobby({ url: `https://${HOST}/games/lobby/AB12`, type: 'navigate' }, 'AB12')).toBe(false)
    expect(documentLoadedAtLobby({ url: 'not a url', type: 'navigate' }, 'AB12')).toBe(false)
  })

  it('reads the Navigation Timing entry and is null without one', () => {
    const original = performance.getEntriesByType
    try {
      performance.getEntriesByType = jest.fn(() => [{ name: loadedAtLobby.url, type: 'navigate' }]) as never
      expect(readDocumentNavigation()).toEqual({ url: loadedAtLobby.url, type: 'navigate' })
      performance.getEntriesByType = jest.fn(() => []) as never
      expect(readDocumentNavigation()).toBeNull()
      performance.getEntriesByType = jest.fn(() => {
        throw new Error('no timing')
      }) as never
      expect(readDocumentNavigation()).toBeNull()
    } finally {
      performance.getEntriesByType = original
    }
  })

  it('strips only the share marker, so a refresh is not a second open', () => {
    expect(stripInviteMarker('https://boardly.online/lobby/AB12?via=invite')).toBe('https://boardly.online/lobby/AB12')
    expect(stripInviteMarker('https://boardly.online/lobby/AB12?tab=chat&via=invite')).toBe('https://boardly.online/lobby/AB12?tab=chat')
    expect(stripInviteMarker('https://boardly.online/lobby/AB12?via=other')).toBe('https://boardly.online/lobby/AB12?via=other')
  })
})
