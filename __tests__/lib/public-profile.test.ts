import {
  buildPublicProfilePath,
  canViewProfile,
  extractPublicProfileId,
  isValidPublicProfileId,
  presentProfileParty,
} from '@/lib/public-profile'

describe('public profile helpers', () => {
  it('validates public profile IDs', () => {
    expect(isValidPublicProfileId('AbC123xYz890')).toBe(true)
    expect(isValidPublicProfileId('too-short')).toBe(false)
    expect(isValidPublicProfileId('contains-dash')).toBe(false)
  })

  it('builds canonical public profile paths', () => {
    expect(buildPublicProfilePath('AbC123xYz890')).toBe('/u/AbC123xYz890')
  })

  it('extracts a public profile ID from raw IDs, relative paths, and absolute URLs', () => {
    expect(extractPublicProfileId('AbC123xYz890')).toBe('AbC123xYz890')
    expect(extractPublicProfileId('/u/AbC123xYz890')).toBe('AbC123xYz890')
    expect(extractPublicProfileId('https://boardly.online/u/AbC123xYz890?from=share')).toBe('AbC123xYz890')
    expect(extractPublicProfileId('https://boardly.online/profile')).toBeNull()
  })

  // #1226: the one visibility rule every surface applies.
  it('lets the owner always, everyone for public, friends for friends-only, and nobody else for private', () => {
    const table = [
      ['public', { self: true, friend: true, other: true }],
      [null, { self: true, friend: true, other: true }],
      ['friends', { self: true, friend: true, other: false }],
      ['private', { self: true, friend: false, other: false }],
    ] as const
    for (const [visibility, expected] of table) {
      expect({
        visibility,
        self: canViewProfile(visibility, 'self'),
        friend: canViewProfile(visibility, 'friend'),
        other: canViewProfile(visibility, 'other'),
      }).toEqual({ visibility, ...expected })
    }
  })

  it('presents a visible party in full and a hidden one as the username alone', () => {
    const party = (profileVisibility: 'public' | 'private') => ({
      id: 'cuid_1',
      username: 'Ann',
      image: null,
      avatarUrl: 'https://cdn.example/ann.png',
      accountPreferences: { profileVisibility },
    })

    expect(presentProfileParty(party('public'), 'other')).toEqual({
      visible: true,
      party: { id: 'cuid_1', username: 'Ann', image: null, avatarUrl: 'https://cdn.example/ann.png', avatar: 'https://cdn.example/ann.png' },
    })
    expect(presentProfileParty(party('private'), 'other')).toEqual({
      visible: false,
      party: { username: 'Ann', avatar: null },
    })
  })
})
