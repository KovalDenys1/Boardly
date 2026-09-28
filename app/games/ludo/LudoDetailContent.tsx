'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function LudoDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.ludo.name')}
      title={t('games.ludo.detail.title')}
      description={t('games.ludo.detail.heroDesc')}
      iconLabel={t('games.ludo.name')}
      gameId="ludo"
      accentColor="var(--bd-sun)"
      accent="var(--bd-coral)"
      lobbiesHref="/games/ludo/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–4' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.ludo.detail.introTitle')}
      intro={[
        t('games.ludo.detail.intro0'),
        t('games.ludo.detail.intro1'),
      ]}
      steps={[
        { title: t('games.ludo.detail.step1Title'), desc: t('games.ludo.detail.step1Desc') },
        { title: t('games.ludo.detail.step2Title'), desc: t('games.ludo.detail.step2Desc') },
        { title: t('games.ludo.detail.step3Title'), desc: t('games.ludo.detail.step3Desc') },
        { title: t('games.ludo.detail.step4Title'), desc: t('games.ludo.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.ludo.detail.benefitsTitle')}
      benefits={[
        t('games.ludo.detail.benefit1'),
        t('games.ludo.detail.benefit2'),
        t('games.ludo.detail.benefit3'),
        t('games.ludo.detail.benefit4'),
      ]}
      rules={[
        t('games.ludo.rules.serverRolls'),
        t('games.ludo.rules.sixToLeave'),
        t('games.ludo.rules.sixRollsAgain'),
        t('games.ludo.detail.rules.extraRollOnlyOnSix'),
        t('games.ludo.rules.capture'),
        t('games.ludo.rules.safeSquares'),
        t('games.ludo.detail.rules.noBlocks'),
        t('games.ludo.detail.rules.homeColumn'),
        t('games.ludo.rules.exactHome'),
        t('games.ludo.rules.winner'),
        t('games.ludo.rules.modes'),
        t('games.ludo.rules.timer'),
      ]}
      modes={[
        { title: t('games.ludo.detail.modes.quickOrClassic.title'), desc: t('games.ludo.detail.modes.quickOrClassic.desc') },
        { title: t('games.ludo.detail.modes.turnClock.title'), desc: t('games.ludo.detail.modes.turnClock.desc') },
        { title: t('games.ludo.detail.modes.botLevels.title'), desc: t('games.ludo.detail.modes.botLevels.desc') },
      ]}
      strategy={[
        { title: t('games.ludo.detail.strategy.bringTokensOut.title'), desc: t('games.ludo.detail.strategy.bringTokensOut.desc') },
        { title: t('games.ludo.detail.strategy.restOnStars.title'), desc: t('games.ludo.detail.strategy.restOnStars.desc') },
        { title: t('games.ludo.detail.strategy.countTheGapBehind.title'), desc: t('games.ludo.detail.strategy.countTheGapBehind.desc') },
        { title: t('games.ludo.detail.strategy.trailDoNotLead.title'), desc: t('games.ludo.detail.strategy.trailDoNotLead.desc') },
        { title: t('games.ludo.detail.strategy.captureTheCostlyToken.title'), desc: t('games.ludo.detail.strategy.captureTheCostlyToken.desc') },
        { title: t('games.ludo.detail.strategy.bankYourLeader.title'), desc: t('games.ludo.detail.strategy.bankYourLeader.desc') },
        { title: t('games.ludo.detail.strategy.planTheExactFinish.title'), desc: t('games.ludo.detail.strategy.planTheExactFinish.desc') },
        { title: t('games.ludo.detail.strategy.mindRivalStartSquares.title'), desc: t('games.ludo.detail.strategy.mindRivalStartSquares.desc') },
      ]}
      mistakes={[
        { title: t('games.ludo.detail.mistakes.stoppingJustAheadOfRival.title'), desc: t('games.ludo.detail.mistakes.stoppingJustAheadOfRival.desc') },
        { title: t('games.ludo.detail.mistakes.trustingAPairToBlock.title'), desc: t('games.ludo.detail.mistakes.trustingAPairToBlock.desc') },
        { title: t('games.ludo.detail.mistakes.racingOneTokenAlone.title'), desc: t('games.ludo.detail.mistakes.racingOneTokenAlone.desc') },
      ]}
      multiplayer={[
        { title: t('games.ludo.detail.multiplayer.withFriends.title'), desc: t('games.ludo.detail.multiplayer.withFriends.desc') },
        { title: t('games.ludo.detail.multiplayer.botsAndSolo.title'), desc: t('games.ludo.detail.multiplayer.botsAndSolo.desc') },
        { title: t('games.ludo.detail.multiplayer.turnTimer.title'), desc: t('games.ludo.detail.multiplayer.turnTimer.desc') },
        { title: t('games.ludo.detail.multiplayer.guestNoDownload.title'), desc: t('games.ludo.detail.multiplayer.guestNoDownload.desc') },
      ]}
      audience={[
        t('games.ludo.detail.audience.whoItSuits'),
      ]}
      history={[
        t('games.ludo.detail.history.origin'),
        t('games.ludo.detail.history.relatives'),
      ]}
      playVsBotGameType="ludo"
    />
  )
}
