'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function AliasDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.alias.name')}
      title={t('games.alias.detail.title')}
      description={t('games.alias.detail.heroDesc')}
      iconLabel={t('games.alias.name')}
      gameId="alias"
      accentColor="var(--bd-coral)"
      accent="var(--bd-coral)"
      lobbiesHref="/games/alias/lobbies"
      primaryCtaLabel={t('games.playNow')}
      // minPlayers is 3 (#847) and supportsBots is false, so a visitor arriving
      // alone cannot start anything (#780).
      groupNotice={t('games.alias.detail.groupNotice')}
      facts={[
        { label: t('games.detail.labels.players'), value: '3–16' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.gameType'), value: t('games.detail.values.team') },
      ]}
      introTitle={t('games.alias.detail.introTitle')}
      intro={[
        t('games.alias.detail.intro0'),
        t('games.alias.detail.intro1'),
      ]}
      steps={[
        { title: t('games.alias.detail.step1Title'), desc: t('games.alias.detail.step1Desc') },
        { title: t('games.alias.detail.step2Title'), desc: t('games.alias.detail.step2Desc') },
        { title: t('games.alias.detail.step3Title'), desc: t('games.alias.detail.step3Desc') },
        { title: t('games.alias.detail.step4Title'), desc: t('games.alias.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.alias.detail.benefitsTitle')}
      benefits={[
        t('games.alias.detail.benefit1'),
        t('games.alias.detail.benefit2'),
        t('games.alias.detail.benefit3'),
        t('games.alias.detail.benefit4'),
      ]}
      rules={[
        t('games.alias.detail.rules.teamsFromFour'),
        t('games.alias.detail.rules.threeAreSolo'),
        t('games.alias.detail.rules.tenWordCard'),
        t('games.alias.detail.rules.markEveryWord'),
        t('games.alias.detail.rules.howATurnEnds'),
      ]}
      scoring={[
        {
          title: t('games.alias.detail.scoring.title'),
          note: t('games.alias.detail.scoring.note'),
          rows: [
            { name: t('games.alias.detail.scoring.rows.guessedWord.name'), value: t('games.alias.detail.scoring.rows.guessedWord.value'), rule: t('games.alias.detail.scoring.rows.guessedWord.rule') },
            { name: t('games.alias.detail.scoring.rows.skippedWord.name'), value: t('games.alias.detail.scoring.rows.skippedWord.value'), rule: t('games.alias.detail.scoring.rows.skippedWord.rule') },
            { name: t('games.alias.detail.scoring.rows.wordLeftAtZero.name'), value: t('games.alias.detail.scoring.rows.wordLeftAtZero.value'), rule: t('games.alias.detail.scoring.rows.wordLeftAtZero.rule') },
            { name: t('games.alias.detail.scoring.rows.wordLeftAfterEndTurn.name'), value: t('games.alias.detail.scoring.rows.wordLeftAfterEndTurn.value'), rule: t('games.alias.detail.scoring.rows.wordLeftAfterEndTurn.rule') },
            { name: t('games.alias.detail.scoring.rows.levelAtTheTop.name'), value: t('games.alias.detail.scoring.rows.levelAtTheTop.value'), rule: t('games.alias.detail.scoring.rows.levelAtTheTop.rule') },
          ],
        },
      ]}
      modes={[
        { title: t('games.alias.detail.modes.tableSize.title'), desc: t('games.alias.detail.modes.tableSize.desc') },
        { title: t('games.alias.detail.modes.turnLength.title'), desc: t('games.alias.detail.modes.turnLength.desc') },
      ]}
      strategy={[
        { title: t('games.alias.detail.strategy.skipEarlyOrNot.title'), desc: t('games.alias.detail.strategy.skipEarlyOrNot.desc') },
        { title: t('games.alias.detail.strategy.beatTheZero.title'), desc: t('games.alias.detail.strategy.beatTheZero.desc') },
        { title: t('games.alias.detail.strategy.sayWhatItDoes.title'), desc: t('games.alias.detail.strategy.sayWhatItDoes.desc') },
        { title: t('games.alias.detail.strategy.leaveAGap.title'), desc: t('games.alias.detail.strategy.leaveAGap.desc') },
        { title: t('games.alias.detail.strategy.buildCompoundsInHalves.title'), desc: t('games.alias.detail.strategy.buildCompoundsInHalves.desc') },
        { title: t('games.alias.detail.strategy.guessInSingleWords.title'), desc: t('games.alias.detail.strategy.guessInSingleWords.desc') },
        { title: t('games.alias.detail.strategy.tryThePlainForm.title'), desc: t('games.alias.detail.strategy.tryThePlainForm.desc') },
        { title: t('games.alias.detail.strategy.readTheResults.title'), desc: t('games.alias.detail.strategy.readTheResults.desc') },
      ]}
      mistakes={[
        { title: t('games.alias.detail.mistakes.lettingTheClockHitZero.title'), desc: t('games.alias.detail.mistakes.lettingTheClockHitZero.desc') },
        { title: t('games.alias.detail.mistakes.skippingOnReflex.title'), desc: t('games.alias.detail.mistakes.skippingOnReflex.desc') },
        { title: t('games.alias.detail.mistakes.guessingInParagraphs.title'), desc: t('games.alias.detail.mistakes.guessingInParagraphs.desc') },
      ]}
      multiplayer={[
        { title: t('games.alias.detail.multiplayer.withFriends.title'), desc: t('games.alias.detail.multiplayer.withFriends.desc') },
        { title: t('games.alias.detail.multiplayer.botsAndSolo.title'), desc: t('games.alias.detail.multiplayer.botsAndSolo.desc') },
        { title: t('games.alias.detail.multiplayer.turnTimer.title'), desc: t('games.alias.detail.multiplayer.turnTimer.desc') },
        { title: t('games.alias.detail.multiplayer.guestNoDownload.title'), desc: t('games.alias.detail.multiplayer.guestNoDownload.desc') },
      ]}
      audience={[
        t('games.alias.detail.audience.whoItSuits'),
      ]}
      history={[
        t('games.alias.detail.history.origin'),
      ]}
    />
  )
}
