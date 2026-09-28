'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function MemoryDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.memory.name')}
      title={t('games.memory.detail.title')}
      description={t('games.memory.detail.heroDesc')}
      iconLabel="Memory"
      gameId="memory"
      accentColor="var(--bd-mint)"
      accent="var(--bd-mint)"
      lobbiesHref="/games/memory/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–4' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.difficulty'), value: t('games.detail.values.threeLevels') },
      ]}
      introTitle={t('games.memory.detail.introTitle')}
      intro={[
        t('games.memory.detail.intro0'),
        t('games.memory.detail.intro1'),
      ]}
      steps={[
        { title: t('games.memory.detail.step1Title'), desc: t('games.memory.detail.step1Desc') },
        { title: t('games.memory.detail.step2Title'), desc: t('games.memory.detail.step2Desc') },
        { title: t('games.memory.detail.step3Title'), desc: t('games.memory.detail.step3Desc') },
        { title: t('games.memory.detail.step4Title'), desc: t('games.memory.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.memory.detail.benefitsTitle')}
      benefits={[
        t('games.memory.detail.benefit1'),
        t('games.memory.detail.benefit2'),
        t('games.memory.detail.benefit3'),
        t('games.memory.detail.benefit4'),
      ]}
      rules={[
        t('games.memory.detail.rules.flipTwo'),
        t('games.memory.detail.rules.matchKeepsTurn'),
        t('games.memory.detail.rules.missPassesTurn'),
        t('games.memory.detail.rules.clockRunsOut'),
        t('games.memory.detail.rules.lastPair'),
      ]}
      scoring={[
        {
          title: t('games.memory.detail.scoring.title'),
          note: t('games.memory.detail.scoring.note'),
          rows: [
            { name: t('games.memory.detail.scoring.rows.matchedPair.name'), value: t('games.memory.detail.scoring.rows.matchedPair.value'), rule: t('games.memory.detail.scoring.rows.matchedPair.rule') },
            { name: t('games.memory.detail.scoring.rows.missedPair.name'), value: t('games.memory.detail.scoring.rows.missedPair.value'), rule: t('games.memory.detail.scoring.rows.missedPair.rule') },
            { name: t('games.memory.detail.scoring.rows.levelAtTop.name'), value: t('games.memory.detail.scoring.rows.levelAtTop.value'), rule: t('games.memory.detail.scoring.rows.levelAtTop.rule') },
          ],
        },
      ]}
      modes={[
        { title: t('games.memory.detail.modes.boardSize.title'), desc: t('games.memory.detail.modes.boardSize.desc') },
        { title: t('games.memory.detail.modes.turnClock.title'), desc: t('games.memory.detail.modes.turnClock.desc') },
        { title: t('games.memory.detail.modes.botLevels.title'), desc: t('games.memory.detail.modes.botLevels.desc') },
      ]}
      strategy={[
        { title: t('games.memory.detail.strategy.flipUnknownFirst.title'), desc: t('games.memory.detail.strategy.flipUnknownFirst.desc') },
        { title: t('games.memory.detail.strategy.safeSecondFlip.title'), desc: t('games.memory.detail.strategy.safeSecondFlip.desc') },
        { title: t('games.memory.detail.strategy.nameAndPlace.title'), desc: t('games.memory.detail.strategy.nameAndPlace.desc') },
        { title: t('games.memory.detail.strategy.coordinatesOnHard.title'), desc: t('games.memory.detail.strategy.coordinatesOnHard.desc') },
        { title: t('games.memory.detail.strategy.anchorOnCorners.title'), desc: t('games.memory.detail.strategy.anchorOnCorners.desc') },
        { title: t('games.memory.detail.strategy.rehearseBetweenTurns.title'), desc: t('games.memory.detail.strategy.rehearseBetweenTurns.desc') },
        { title: t('games.memory.detail.strategy.guessLate.title'), desc: t('games.memory.detail.strategy.guessLate.desc') },
        { title: t('games.memory.detail.strategy.climbTheBots.title'), desc: t('games.memory.detail.strategy.climbTheBots.desc') },
      ]}
      mistakes={[
        { title: t('games.memory.detail.mistakes.gamblingTheSecondFlip.title'), desc: t('games.memory.detail.mistakes.gamblingTheSecondFlip.desc') },
        { title: t('games.memory.detail.mistakes.lookingAway.title'), desc: t('games.memory.detail.mistakes.lookingAway.desc') },
        { title: t('games.memory.detail.mistakes.lettingTheClockRun.title'), desc: t('games.memory.detail.mistakes.lettingTheClockRun.desc') },
      ]}
      multiplayer={[
        { title: t('games.memory.detail.multiplayer.withFriends.title'), desc: t('games.memory.detail.multiplayer.withFriends.desc') },
        { title: t('games.memory.detail.multiplayer.botsAndSolo.title'), desc: t('games.memory.detail.multiplayer.botsAndSolo.desc') },
        { title: t('games.memory.detail.multiplayer.turnTimer.title'), desc: t('games.memory.detail.multiplayer.turnTimer.desc') },
        { title: t('games.memory.detail.multiplayer.guestNoDownload.title'), desc: t('games.memory.detail.multiplayer.guestNoDownload.desc') },
      ]}
      audience={[
        t('games.memory.detail.audience.whoItSuits'),
      ]}
      history={[
        t('games.memory.detail.history.origin'),
      ]}
      playVsBotGameType="memory"
    />
  )
}
