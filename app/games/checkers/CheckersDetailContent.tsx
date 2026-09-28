'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function CheckersDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.checkers.name')}
      title={t('games.checkers.detail.title')}
      description={t('games.checkers.detail.heroDesc')}
      iconLabel="Checkers board"
      gameId="checkers"
      accentColor="var(--bd-coral)"
      accent="var(--bd-sun)"
      lobbiesHref="/games/checkers/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–2' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.checkers.detail.introTitle')}
      intro={[
        t('games.checkers.detail.intro0'),
        t('games.checkers.detail.intro1'),
      ]}
      steps={[
        { title: t('games.checkers.detail.step1Title'), desc: t('games.checkers.detail.step1Desc') },
        { title: t('games.checkers.detail.step2Title'), desc: t('games.checkers.detail.step2Desc') },
        { title: t('games.checkers.detail.step3Title'), desc: t('games.checkers.detail.step3Desc') },
        { title: t('games.checkers.detail.step4Title'), desc: t('games.checkers.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.checkers.detail.benefitsTitle')}
      benefits={[
        t('games.checkers.detail.benefit1'),
        t('games.checkers.detail.benefit2'),
        t('games.checkers.detail.benefit3'),
        t('games.checkers.detail.benefit4'),
      ]}
      rules={[
        t('games.checkers.detail.rules.board'),
        t('games.checkers.detail.rules.menMove'),
        t('games.checkers.detail.rules.forcedCapture'),
        t('games.checkers.detail.rules.multiJump'),
        t('games.checkers.detail.rules.crowning'),
        t('games.checkers.detail.rules.kings'),
        t('games.checkers.detail.rules.endAndDraw'),
      ]}
      modes={[
        { title: t('games.checkers.detail.modes.moveClock.title'), desc: t('games.checkers.detail.modes.moveClock.desc') },
        { title: t('games.checkers.detail.modes.botLevels.title'), desc: t('games.checkers.detail.modes.botLevels.desc') },
        { title: t('games.checkers.detail.modes.rematches.title'), desc: t('games.checkers.detail.modes.rematches.desc') },
      ]}
      strategy={[
        { title: t('games.checkers.detail.strategy.guardBackRow.title'), desc: t('games.checkers.detail.strategy.guardBackRow.desc') },
        { title: t('games.checkers.detail.strategy.holdTheCentre.title'), desc: t('games.checkers.detail.strategy.holdTheCentre.desc') },
        { title: t('games.checkers.detail.strategy.moveInPairs.title'), desc: t('games.checkers.detail.strategy.moveInPairs.desc') },
        { title: t('games.checkers.detail.strategy.baitTheForcedCapture.title'), desc: t('games.checkers.detail.strategy.baitTheForcedCapture.desc') },
        { title: t('games.checkers.detail.strategy.readTheChain.title'), desc: t('games.checkers.detail.strategy.readTheChain.desc') },
        { title: t('games.checkers.detail.strategy.raceForAKing.title'), desc: t('games.checkers.detail.strategy.raceForAKing.desc') },
        { title: t('games.checkers.detail.strategy.tradeWhenAhead.title'), desc: t('games.checkers.detail.strategy.tradeWhenAhead.desc') },
        { title: t('games.checkers.detail.strategy.crowningStopsTheChain.title'), desc: t('games.checkers.detail.strategy.crowningStopsTheChain.desc') },
      ]}
      mistakes={[
        { title: t('games.checkers.detail.mistakes.ignoringTheLanding.title'), desc: t('games.checkers.detail.mistakes.ignoringTheLanding.desc') },
        { title: t('games.checkers.detail.mistakes.emptyingBackRow.title'), desc: t('games.checkers.detail.mistakes.emptyingBackRow.desc') },
        { title: t('games.checkers.detail.mistakes.thinkingPastTheClock.title'), desc: t('games.checkers.detail.mistakes.thinkingPastTheClock.desc') },
      ]}
      playVsBotGameType="checkers"
    />
  )
}
