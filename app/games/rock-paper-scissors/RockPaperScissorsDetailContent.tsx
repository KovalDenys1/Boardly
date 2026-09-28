'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

/**
 * The copy lives under `games.rock_paper_scissors.*`, not `games.rps.*`: the
 * catalog entry for `rps` already points its `nameKey` and its SEO question at
 * that namespace, so the detail copy sits beside them rather than in the
 * lobby-only `games.rps` block.
 */
export default function RockPaperScissorsDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.rock_paper_scissors.name')}
      title={t('games.rock_paper_scissors.detail.title')}
      description={t('games.rock_paper_scissors.detail.heroDesc')}
      iconLabel={t('games.rock_paper_scissors.name')}
      gameId="rps"
      accentColor="var(--bd-lav)"
      accent="var(--bd-lav)"
      lobbiesHref="/games/rock-paper-scissors/lobbies"
      primaryCtaLabel={t('games.playNow')}
      playVsBotGameType="rock_paper_scissors"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–2' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.gameType'), value: t('games.detail.values.casual') },
      ]}
      introTitle={t('games.rock_paper_scissors.detail.introTitle')}
      intro={[
        t('games.rock_paper_scissors.detail.intro0'),
        t('games.rock_paper_scissors.detail.intro1'),
      ]}
      steps={[
        { title: t('games.rock_paper_scissors.detail.step1Title'), desc: t('games.rock_paper_scissors.detail.step1Desc') },
        { title: t('games.rock_paper_scissors.detail.step2Title'), desc: t('games.rock_paper_scissors.detail.step2Desc') },
        { title: t('games.rock_paper_scissors.detail.step3Title'), desc: t('games.rock_paper_scissors.detail.step3Desc') },
        { title: t('games.rock_paper_scissors.detail.step4Title'), desc: t('games.rock_paper_scissors.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.rock_paper_scissors.detail.benefitsTitle')}
      benefits={[
        t('games.rock_paper_scissors.detail.benefit1'),
        t('games.rock_paper_scissors.detail.benefit2'),
        t('games.rock_paper_scissors.detail.benefit3'),
        t('games.rock_paper_scissors.detail.benefit4'),
      ]}
      rules={[
        t('games.rock_paper_scissors.detail.rules.noTurns'),
        t('games.rock_paper_scissors.detail.rules.pickStaysHidden'),
        t('games.rock_paper_scissors.detail.rules.revealOrder'),
        t('games.rock_paper_scissors.detail.rules.timeoutRandomPick'),
      ]}
      modes={[
        { title: t('games.rock_paper_scissors.detail.modes.matchLength.title'), desc: t('games.rock_paper_scissors.detail.modes.matchLength.desc') },
        { title: t('games.rock_paper_scissors.detail.modes.roundClock.title'), desc: t('games.rock_paper_scissors.detail.modes.roundClock.desc') },
        { title: t('games.rock_paper_scissors.detail.modes.botLevels.title'), desc: t('games.rock_paper_scissors.detail.modes.botLevels.desc') },
      ]}
      strategy={[
        { title: t('games.rock_paper_scissors.detail.strategy.readTheRoundList.title'), desc: t('games.rock_paper_scissors.detail.strategy.readTheRoundList.desc') },
        { title: t('games.rock_paper_scissors.detail.strategy.answerARepeat.title'), desc: t('games.rock_paper_scissors.detail.strategy.answerARepeat.desc') },
        { title: t('games.rock_paper_scissors.detail.strategy.spotACycle.title'), desc: t('games.rock_paper_scissors.detail.strategy.spotACycle.desc') },
        { title: t('games.rock_paper_scissors.detail.strategy.thinkOneStepFurther.title'), desc: t('games.rock_paper_scissors.detail.strategy.thinkOneStepFurther.desc') },
        { title: t('games.rock_paper_scissors.detail.strategy.watchYourOwnCount.title'), desc: t('games.rock_paper_scissors.detail.strategy.watchYourOwnCount.desc') },
        { title: t('games.rock_paper_scissors.detail.strategy.exploitMindGambit.title'), desc: t('games.rock_paper_scissors.detail.strategy.exploitMindGambit.desc') },
        { title: t('games.rock_paper_scissors.detail.strategy.stayEvenAgainstPatternReader.title'), desc: t('games.rock_paper_scissors.detail.strategy.stayEvenAgainstPatternReader.desc') },
        { title: t('games.rock_paper_scissors.detail.strategy.climbTheLevels.title'), desc: t('games.rock_paper_scissors.detail.strategy.climbTheLevels.desc') },
      ]}
      mistakes={[
        { title: t('games.rock_paper_scissors.detail.mistakes.readingTempoRookie.title'), desc: t('games.rock_paper_scissors.detail.mistakes.readingTempoRookie.desc') },
        { title: t('games.rock_paper_scissors.detail.mistakes.waitingForTheirLockIn.title'), desc: t('games.rock_paper_scissors.detail.mistakes.waitingForTheirLockIn.desc') },
        { title: t('games.rock_paper_scissors.detail.mistakes.countingDraws.title'), desc: t('games.rock_paper_scissors.detail.mistakes.countingDraws.desc') },
      ]}
      multiplayer={[
        { title: t('games.rock_paper_scissors.detail.multiplayer.withFriends.title'), desc: t('games.rock_paper_scissors.detail.multiplayer.withFriends.desc') },
        { title: t('games.rock_paper_scissors.detail.multiplayer.botsAndSolo.title'), desc: t('games.rock_paper_scissors.detail.multiplayer.botsAndSolo.desc') },
        { title: t('games.rock_paper_scissors.detail.multiplayer.turnTimer.title'), desc: t('games.rock_paper_scissors.detail.multiplayer.turnTimer.desc') },
        { title: t('games.rock_paper_scissors.detail.multiplayer.guestNoDownload.title'), desc: t('games.rock_paper_scissors.detail.multiplayer.guestNoDownload.desc') },
      ]}
      audience={[
        t('games.rock_paper_scissors.detail.audience.whoItSuits'),
      ]}
      history={[
        t('games.rock_paper_scissors.detail.history.origin'),
      ]}
    />
  )
}
