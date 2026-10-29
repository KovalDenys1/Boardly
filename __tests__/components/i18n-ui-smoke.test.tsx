import { act, fireEvent, render, screen, within } from '@testing-library/react'
import i18n, { changeLanguageLazy } from '@/i18n'
import YahtzeeResults from '@/components/YahtzeeResults'
import SpyResults from '@/components/SpyResults'

jest.mock('@vercel/analytics', () => ({ track: jest.fn() }))

describe('i18n UI smoke checks', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it.each(['uk', 'no', 'ru', 'de', 'es'] as const)(
    'renders Yahtzee results actions in %s without English fallback text',
    async (locale) => {
      await act(async () => {
        await changeLanguageLazy(locale)
      })

      render(
        <YahtzeeResults
          results={[
            {
              playerId: 'u1',
              playerName: 'Alpha',
              totalScore: 120,
              upperSectionScore: 70,
              lowerSectionScore: 50,
              bonusAchieved: true,
              bonusPoints: 35,
              achievements: [],
              rank: 0,
            },
            {
              playerId: 'u2',
              playerName: 'Bravo',
              totalScore: 95,
              upperSectionScore: 45,
              lowerSectionScore: 50,
              bonusAchieved: false,
              bonusPoints: 0,
              achievements: [],
              rank: 1,
            },
          ]}
          currentUserId="u1"
          canStartGame={false}
          canRequestRematch
          onPlayAgain={() => {}}
          onBackToLobby={() => {}}
          faceCounts={[11, 9, 12, 10, 8, 10]}
        />
      )

      // The actions are the shared result dialog's (#1564): the host's wait, View board, More.
      const dialog = await screen.findByRole('dialog', {}, { timeout: 2000 })
      expect(within(dialog).queryByText('Waiting for host to start...')).toBeNull()
      expect(within(dialog).queryByText('View Board')).toBeNull()
      expect(within(dialog).queryByText(i18n.t('game.ui.waitingForHost'))).not.toBeNull()
      expect(within(dialog).queryByText(i18n.t('game.ui.viewBoard'))).not.toBeNull()
      fireEvent.click(within(dialog).getByTestId('game-result-more-button'))
      expect(within(dialog).queryByText('Leave')).toBeNull()
      expect(within(dialog).queryByText(i18n.t('game.ui.leave'))).not.toBeNull()

      // #1085: the face tally, translated, with every face's count from the server.
      expect(screen.queryByText(i18n.t('yahtzee.results.diceTally'))).not.toBeNull()
      expect(screen.queryByText(i18n.t('yahtzee.results.diceRolled', { count: 60 }))).not.toBeNull()
      expect(screen.queryByText('Dice tally')).toBeNull()
      expect(screen.getByLabelText(i18n.t('yahtzee.results.faceCount', { face: 3, count: 12 }))).toBeTruthy()

      // The after-game block renders here with no SessionProvider in the tree, which is
      // why it takes `isRegistered` as a prop instead of calling useSession() (#982).
      expect(within(dialog).queryByText(i18n.t('game.ui.discordAfterGame'))).not.toBeNull()
    }
  )

  it.each(['uk', 'no', 'ru', 'de', 'es'] as const)(
    'renders Spy results counters in %s without English hardcoded labels',
    async (locale) => {
      await act(async () => {
        await changeLanguageLazy(locale)
      })

      render(
        <SpyResults
          players={[
            { id: 'p1', name: 'Player 1' },
            { id: 'p2', name: 'Player 2' },
          ]}
          votes={{ p1: 'p2', p2: 'p2' }}
          eliminatedId="p2"
          spyId="p1"
          location="Test Location"
          scores={{ p1: 10, p2: 3 }}
          currentRound={3}
          totalRounds={3}
          onPlayAgain={() => {}}
          onRequestRematch={() => {}}
          onBackToLobby={() => {}}
        />
      )

      expect(screen.queryByText('votes')).toBeNull()
      expect(screen.queryByText('vote')).toBeNull()
      expect(screen.queryByText('pts')).toBeNull()
      expect(screen.queryByText('Request rematch')).toBeNull()

      expect(screen.queryByText(i18n.t('spy.requestRematch'))).not.toBeNull()
      expect(
        screen.getByText((content) => content.includes(i18n.t('spy.votedOutShort')))
      ).toBeTruthy()
      expect(
        screen.getByText(new RegExp(`2\\s+${i18n.t('spy.votesLabel')}`))
      ).toBeTruthy()
      expect(
        screen.getAllByText(new RegExp(i18n.t('profile.gameResults.points'))).length
      ).toBeGreaterThan(0)

      expect(screen.queryByText(i18n.t('game.ui.discordAfterGame'))).not.toBeNull()
    }
  )
})
