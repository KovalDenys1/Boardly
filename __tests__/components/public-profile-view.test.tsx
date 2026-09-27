import { fireEvent, render, screen } from '@testing-library/react'
import PublicProfileView from '@/components/PublicProfileView'
import { fetchWithGuest } from '@/lib/client/fetch-with-guest'

jest.mock('@/lib/client/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

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
    t: (key: string, options?: Record<string, unknown>) => {
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
        'common.goHome': 'Go to Home',
        'profile.achievements.title': 'Achievements',
        'achievements.first_win.name': 'First Win',
        'achievements.first_win.description': 'Win your first game',
        'profile.publicProfile.levelBadge': 'Lvl. {{level}}',
      }

      const template = dictionary[key] ?? key
      if (!options) return template
      return template.replace(/{{(\w+)}}/g, (_match, name: string) => String(options[name] ?? ''))
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
  completedGamesCount: 12,
}

describe('PublicProfileView', () => {
  it('uses the shared game-h viewport token in page mode', () => {
    const { container } = render(
      <PublicProfileView
        profile={profile}
        initialRelation="can_send"
      />
    )

    const root = container.firstElementChild as HTMLElement

    expect(root.className).toContain('min-h-[var(--game-h)]')
    expect(root.className).not.toContain('mobile-vh-100')
    expect(root.getAttribute('style')).toContain('min-height: var(--game-h);')
  })

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
    expect(screen.getByRole('link', { name: 'Go to Home' })).toBeTruthy()
  })

  it('keeps the public profile as return url for sign in', () => {
    render(
      <PublicProfileView
        profile={profile}
        initialRelation="login_required"
      />
    )

    expect(screen.getByRole('link', { name: 'Sign In to Add' }).getAttribute('href')).toBe(
      '/auth/login?returnUrl=%2Fu%2FAbC123xYz890'
    )
  })

  it('uses completed games count for the level badge', () => {
    render(
      <PublicProfileView
        profile={{
          ...profile,
          gamesPlayed: 42,
          completedGamesCount: 0,
        }}
        initialRelation="can_send"
      />
    )

    expect(screen.getByText('Lvl. 1')).toBeTruthy()
  })

  it('shows an achievement as unlocked only when it appears in unlockedAchievements', () => {
    render(
      <PublicProfileView
        profile={{
          ...profile,
          unlockedAchievements: [{ key: 'first_win', unlockedAt: '2026-03-05T00:00:00.000Z' }],
        }}
        initialRelation="can_send"
      />
    )

    const firstWinLabel = screen.getByText('First Win')
    const firstWinCard = firstWinLabel.closest('div')
    expect(firstWinCard?.className).not.toContain('grayscale')
    expect(firstWinCard?.textContent).not.toContain('🔒')
  })

  it('shows every achievement locked when none are unlocked', () => {
    render(
      <PublicProfileView
        profile={{ ...profile, unlockedAchievements: [] }}
        initialRelation="can_send"
      />
    )

    const firstWinLabel = screen.getByText('First Win')
    const firstWinCard = firstWinLabel.closest('div')
    expect(firstWinCard?.className).toContain('grayscale')
    expect(firstWinCard?.querySelector('[data-icon="lock"]')).toBeTruthy()
  })

  // #1172: a visitor can report what the profile shows, by public profile id only.
  describe('report action (#1172)', () => {
    it('offers Report profile, with the username and the bio the page shows as targets', async () => {
      render(
        <PublicProfileView
          profile={{ ...profile, bio: 'a bio worth reporting' }}
          initialRelation="can_send"
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'report.reportProfile' }))

      expect(await screen.findByLabelText('report.targets.username')).toBeTruthy()
      expect(screen.getByLabelText('report.targets.bio')).toBeTruthy()
      // No picture on this profile, so no avatar to report.
      expect(screen.queryByLabelText('report.targets.avatar')).toBeNull()
    })

    it('sends the public profile id, never a user id', async () => {
      ;(fetchWithGuest as jest.Mock).mockResolvedValue(
        new Response(JSON.stringify({ ok: true, duplicate: false }), { status: 201 })
      )
      render(<PublicProfileView profile={profile} initialRelation="login_required" />)

      fireEvent.click(screen.getByRole('button', { name: 'report.reportProfile' }))
      fireEvent.click(await screen.findByLabelText('report.reasons.hate'))
      fireEvent.click(screen.getByRole('button', { name: 'report.submit' }))
      await screen.findByText('report.successTitle')

      const [, init] = (fetchWithGuest as jest.Mock).mock.calls[0]
      expect(JSON.parse(init.body)).toEqual({ targetType: 'username', publicProfileId: 'AbC123xYz890', reason: 'hate' })
    })

    it('offers no Report on your own profile', () => {
      render(<PublicProfileView profile={profile} initialRelation="self" />)
      expect(screen.queryByRole('button', { name: 'report.reportProfile' })).toBeNull()
    })
  })
})
