import { act, render, screen } from '@testing-library/react'
import i18n from '@/i18n'
import YahtzeeResults from '@/components/YahtzeeResults'
import SpyResults from '@/components/SpyResults'

describe('i18n UI smoke checks', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en')
    })
  })

  it.each(['uk', 'no', 'ru'] as const)(
    'renders Yahtzee results actions in %s without English fallback text',
    async (locale) => {
      await act(async () => {
        await i18n.changeLanguage(locale)
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
          onRequestRematch={() => {}}
          onBackToLobby={() => {}}
        />
      )

      expect(screen.queryByText('Play Again')).toBeNull()
      expect(screen.queryByText('Request Rematch')).toBeNull()
      expect(screen.queryByText('Back to Lobbies')).toBeNull()
      expect(screen.queryByText('Only the lobby host can start the next round.')).toBeNull()

      expect(screen.queryByText(i18n.t('yahtzee.results.playAgain'))).not.toBeNull()
      expect(screen.queryByText(i18n.t('yahtzee.results.requestRematch'))).not.toBeNull()
      expect(screen.queryByText(i18n.t('yahtzee.results.backToLobbies'))).not.toBeNull()
      expect(screen.queryByText(i18n.t('yahtzee.results.hostCanStartNextRound'))).not.toBeNull()
    }
  )

  it.each(['uk', 'no', 'ru'] as const)(
    'renders Spy results counters in %s without English hardcoded labels',
    async (locale) => {
      await act(async () => {
        await i18n.changeLanguage(locale)
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
    }
  )
})
