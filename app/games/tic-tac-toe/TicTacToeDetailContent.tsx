'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function TicTacToeDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.tictactoe.name')}
      title={t('games.tictactoe.detail.title')}
      description={t('games.tictactoe.detail.heroDesc')}
      iconLabel="Tic Tac Toe board"
      gameId="tic-tac-toe"
      accentColor="var(--bd-coral)"
      accent="var(--bd-sun)"
      lobbiesHref="/games/tic-tac-toe/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–2' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.tictactoe.detail.introTitle')}
      intro={[
        t('games.tictactoe.detail.intro0'),
        t('games.tictactoe.detail.intro1'),
      ]}
      steps={[
        { title: t('games.tictactoe.detail.step1Title'), desc: t('games.tictactoe.detail.step1Desc') },
        { title: t('games.tictactoe.detail.step2Title'), desc: t('games.tictactoe.detail.step2Desc') },
        { title: t('games.tictactoe.detail.step3Title'), desc: t('games.tictactoe.detail.step3Desc') },
        { title: t('games.tictactoe.detail.step4Title'), desc: t('games.tictactoe.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.tictactoe.detail.benefitsTitle')}
      benefits={[
        t('games.tictactoe.detail.benefit1'),
        t('games.tictactoe.detail.benefit2'),
        t('games.tictactoe.detail.benefit3'),
        t('games.tictactoe.detail.benefit4'),
      ]}
      rules={[
        t('games.tictactoe.detail.rules.twoMarks'),
        t('games.tictactoe.detail.rules.xOpensFirstRound'),
        t('games.tictactoe.detail.rules.threeInALine'),
        t('games.tictactoe.detail.rules.fullGridDraw'),
        t('games.tictactoe.detail.rules.timeoutLoses'),
        t('games.tictactoe.detail.rules.undoByConsent'),
        t('games.tictactoe.detail.rules.drawByAgreement'),
        t('games.tictactoe.detail.rules.hostStartsNextRound'),
      ]}
      modes={[
        { title: t('games.tictactoe.detail.modes.seriesLength.title'), desc: t('games.tictactoe.detail.modes.seriesLength.desc') },
        { title: t('games.tictactoe.detail.modes.moveClock.title'), desc: t('games.tictactoe.detail.modes.moveClock.desc') },
        { title: t('games.tictactoe.detail.modes.botLevels.title'), desc: t('games.tictactoe.detail.modes.botLevels.desc') },
        { title: t('games.tictactoe.detail.modes.requests.title'), desc: t('games.tictactoe.detail.modes.requests.desc') },
      ]}
      playVsBotGameType="tic_tac_toe"
    />
  )
}
