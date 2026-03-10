import {
  buildPublicProfilePath,
  extractPublicProfileId,
  isValidPublicProfileId,
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
})
