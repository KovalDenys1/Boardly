'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function ConnectFourDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.connect_four.name')}
      title={t('games.connect_four.detail.title')}
      description={t('games.connect_four.detail.heroDesc')}
      iconLabel="Connect Four board"
      gameId="connect-four"
      accentColor="var(--bd-coral)"
      accent="var(--bd-sun)"
      lobbiesHref="/games/connect-four/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–2' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.connect_four.detail.introTitle')}
      intro={[
        t('games.connect_four.detail.intro0'),
        t('games.connect_four.detail.intro1'),
      ]}
      steps={[
        { title: t('games.connect_four.detail.step1Title'), desc: t('games.connect_four.detail.step1Desc') },
        { title: t('games.connect_four.detail.step2Title'), desc: t('games.connect_four.detail.step2Desc') },
        { title: t('games.connect_four.detail.step3Title'), desc: t('games.connect_four.detail.step3Desc') },
        { title: t('games.connect_four.detail.step4Title'), desc: t('games.connect_four.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.connect_four.detail.benefitsTitle')}
      benefits={[
        t('games.connect_four.detail.benefit1'),
        t('games.connect_four.detail.benefit2'),
        t('games.connect_four.detail.benefit3'),
        t('games.connect_four.detail.benefit4'),
      ]}
      rules={[
        t('games.connect_four.detail.rules.alternateTurns'),
        t('games.connect_four.detail.rules.gravity'),
        t('games.connect_four.detail.rules.fourToWin'),
        t('games.connect_four.detail.rules.fullBoardDraw'),
        t('games.connect_four.detail.rules.seriesOpening'),
        t('games.connect_four.detail.rules.timerForfeit'),
        t('games.connect_four.detail.rules.undoConsent'),
      ]}
      modes={[
        { title: t('games.connect_four.detail.modes.turnClock.title'), desc: t('games.connect_four.detail.modes.turnClock.desc') },
        { title: t('games.connect_four.detail.modes.botLevels.title'), desc: t('games.connect_four.detail.modes.botLevels.desc') },
        { title: t('games.connect_four.detail.modes.series.title'), desc: t('games.connect_four.detail.modes.series.desc') },
      ]}
      strategy={[
        { title: t('games.connect_four.detail.strategy.openInTheMiddle.title'), desc: t('games.connect_four.detail.strategy.openInTheMiddle.desc') },
        { title: t('games.connect_four.detail.strategy.edgesLate.title'), desc: t('games.connect_four.detail.strategy.edgesLate.desc') },
        { title: t('games.connect_four.detail.strategy.twoThreats.title'), desc: t('games.connect_four.detail.strategy.twoThreats.desc') },
        { title: t('games.connect_four.detail.strategy.threatsInDifferentColumns.title'), desc: t('games.connect_four.detail.strategy.threatsInDifferentColumns.desc') },
        { title: t('games.connect_four.detail.strategy.blockThatBuilds.title'), desc: t('games.connect_four.detail.strategy.blockThatBuilds.desc') },
        { title: t('games.connect_four.detail.strategy.steerTheirDisc.title'), desc: t('games.connect_four.detail.strategy.steerTheirDisc.desc') },
        { title: t('games.connect_four.detail.strategy.oddAndEvenRows.title'), desc: t('games.connect_four.detail.strategy.oddAndEvenRows.desc') },
        { title: t('games.connect_four.detail.strategy.bothDiagonals.title'), desc: t('games.connect_four.detail.strategy.bothDiagonals.desc') },
        { title: t('games.connect_four.detail.strategy.beatTheHardBot.title'), desc: t('games.connect_four.detail.strategy.beatTheHardBot.desc') },
      ]}
      mistakes={[
        { title: t('games.connect_four.detail.mistakes.openingTheCellAbove.title'), desc: t('games.connect_four.detail.mistakes.openingTheCellAbove.desc') },
        { title: t('games.connect_four.detail.mistakes.onlyBlocking.title'), desc: t('games.connect_four.detail.mistakes.onlyBlocking.desc') },
        { title: t('games.connect_four.detail.mistakes.towerInOneColumn.title'), desc: t('games.connect_four.detail.mistakes.towerInOneColumn.desc') },
        { title: t('games.connect_four.detail.mistakes.forgettingTheClock.title'), desc: t('games.connect_four.detail.mistakes.forgettingTheClock.desc') },
      ]}
      multiplayer={[
        { title: t('games.connect_four.detail.multiplayer.withFriends.title'), desc: t('games.connect_four.detail.multiplayer.withFriends.desc') },
        { title: t('games.connect_four.detail.multiplayer.botsAndSolo.title'), desc: t('games.connect_four.detail.multiplayer.botsAndSolo.desc') },
        { title: t('games.connect_four.detail.multiplayer.turnTimer.title'), desc: t('games.connect_four.detail.multiplayer.turnTimer.desc') },
        { title: t('games.connect_four.detail.multiplayer.guestNoDownload.title'), desc: t('games.connect_four.detail.multiplayer.guestNoDownload.desc') },
      ]}
      audience={[
        t('games.connect_four.detail.audience.whoItSuits'),
      ]}
      history={[
        t('games.connect_four.detail.history.origin'),
        t('games.connect_four.detail.history.solved'),
      ]}
      playVsBotGameType="connect_four"
    />
  )
}
