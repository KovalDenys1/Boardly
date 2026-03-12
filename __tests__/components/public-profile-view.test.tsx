import { render, screen } from '@testing-library/react'
import PublicProfileView from '@/components/PublicProfileView'

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    errorFrom: jest.fn(),
  },
}))

jest.mock('@/lib/i18n-helpers', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => {
      const dictionary: Record<string, string> = {
        'profile.publicProfile.eyebrow': 'Boardly Profile',
        'profile.publicProfile.friendsOnlyTitle': 'This profile is visible to friends only',
        'profile.publicProfile.friendsOnlySubtitle': 'Send a friend request to connect first. Once the request is accepted, you can open this profile again.',
        'profile.publicProfile.friendsOnlyHint': 'This player only shares their profile with accepted friends.',
        'profile.publicProfile.privateTitle': 'This profile is private',
        'profile.publicProfile.privateSubtitle': 'This player is not sharing their public profile right now.',
        'profile.publicProfile.addFriend': 'Add Friend',
        'profile.publicProfile.signInToAdd': 'Sign In to Add',
        'profile.publicProfile.reviewRequest': 'Review Request',
        'profile.settings.privacy.friendsOnly': 'Friends Only',
        'common.back': 'Back',
        'common.home': 'Home',
      }

      return dictionary[key] ?? key
    },
  }),
}))

const profile = {
  publicProfileId: 'AbC123xYz890',
  username: 'Player One',
  image: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  friendsCount: 4,
  gamesPlayed: 12,
}

describe('PublicProfileView', () => {
  it('shows a friends-only gate with a request action', () => {
    render(
      <PublicProfileView
        profile={profile}
        initialRelation="can_send"
        accessState="friends_only"
      />
    )

    expect(screen.getByText('This profile is visible to friends only')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add Friend' })).toBeTruthy()
  })

  it('shows a private gate without friend request actions', () => {
    render(
      <PublicProfileView
        profile={profile}
        initialRelation="can_send"
        accessState="private"
      />
    )

    expect(screen.getByText('This profile is private')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add Friend' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Home' })).toBeTruthy()
  })
})
