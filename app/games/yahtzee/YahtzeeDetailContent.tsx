'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function YahtzeeDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.yahtzee.name')}
      title={t('games.yahtzee.detail.title')}
      description={t('games.yahtzee.detail.heroDesc')}
      iconLabel={t('games.yahtzee.name')}
      gameId="yahtzee"
      accentColor="var(--bd-sky)"
      accent="var(--bd-lav)"
      lobbiesHref="/games/yahtzee/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–4' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.yahtzee.detail.introTitle')}
      intro={[
        t('games.yahtzee.detail.intro0'),
        t('games.yahtzee.detail.intro1'),
      ]}
      steps={[
        { title: t('games.yahtzee.detail.step1Title'), desc: t('games.yahtzee.detail.step1Desc') },
        { title: t('games.yahtzee.detail.step2Title'), desc: t('games.yahtzee.detail.step2Desc') },
        { title: t('games.yahtzee.detail.step3Title'), desc: t('games.yahtzee.detail.step3Desc') },
        { title: t('games.yahtzee.detail.step4Title'), desc: t('games.yahtzee.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.yahtzee.detail.benefitsTitle')}
      benefits={[
        t('games.yahtzee.detail.benefit1'),
        t('games.yahtzee.detail.benefit2'),
        t('games.yahtzee.detail.benefit3'),
        t('games.yahtzee.detail.benefit4'),
      ]}
      originNote={t('games.yahtzee.detail.originNote')}
      rules={[
        t('games.yahtzee.detail.rules.rollThreeTimes'),
        t('games.yahtzee.detail.rules.rollBeforeScoring'),
        t('games.yahtzee.detail.rules.mustScore'),
        t('games.yahtzee.detail.rules.oneUsePerRow'),
        t('games.yahtzee.detail.rules.yahtzeeOnce'),
        t('games.yahtzee.detail.rules.upperBonus'),
        t('games.yahtzee.detail.rules.gameEnd'),
        t('games.yahtzee.detail.rules.timerExpiry'),
      ]}
      scoring={[
        {
          title: t('yahtzee.categories.upperSection'),
          note: t('games.yahtzee.detail.scoring.upperNote'),
          rows: [
            { name: t('yahtzee.categories.ones'), value: t('games.yahtzee.detail.scoring.rows.ones.value'), rule: t('games.yahtzee.detail.scoring.rows.ones.rule') },
            { name: t('yahtzee.categories.twos'), value: t('games.yahtzee.detail.scoring.rows.twos.value'), rule: t('games.yahtzee.detail.scoring.rows.twos.rule') },
            { name: t('yahtzee.categories.threes'), value: t('games.yahtzee.detail.scoring.rows.threes.value'), rule: t('games.yahtzee.detail.scoring.rows.threes.rule') },
            { name: t('yahtzee.categories.fours'), value: t('games.yahtzee.detail.scoring.rows.fours.value'), rule: t('games.yahtzee.detail.scoring.rows.fours.rule') },
            { name: t('yahtzee.categories.fives'), value: t('games.yahtzee.detail.scoring.rows.fives.value'), rule: t('games.yahtzee.detail.scoring.rows.fives.rule') },
            { name: t('yahtzee.categories.sixes'), value: t('games.yahtzee.detail.scoring.rows.sixes.value'), rule: t('games.yahtzee.detail.scoring.rows.sixes.rule') },
          ],
        },
        {
          title: t('yahtzee.categories.lowerSection'),
          note: t('games.yahtzee.detail.scoring.lowerNote'),
          rows: [
            { name: t('yahtzee.categories.onePair'), value: t('games.yahtzee.detail.scoring.rows.onePair.value'), rule: t('games.yahtzee.detail.scoring.rows.onePair.rule') },
            { name: t('yahtzee.categories.twoPairs'), value: t('games.yahtzee.detail.scoring.rows.twoPairs.value'), rule: t('games.yahtzee.detail.scoring.rows.twoPairs.rule') },
            { name: t('yahtzee.categories.threeOfKind'), value: t('games.yahtzee.detail.scoring.rows.threeOfKind.value'), rule: t('games.yahtzee.detail.scoring.rows.threeOfKind.rule') },
            { name: t('yahtzee.categories.fourOfKind'), value: t('games.yahtzee.detail.scoring.rows.fourOfKind.value'), rule: t('games.yahtzee.detail.scoring.rows.fourOfKind.rule') },
            { name: t('yahtzee.categories.fullHouse'), value: t('games.yahtzee.detail.scoring.rows.fullHouse.value'), rule: t('games.yahtzee.detail.scoring.rows.fullHouse.rule') },
            { name: t('yahtzee.categories.smallStraight'), value: t('games.yahtzee.detail.scoring.rows.smallStraight.value'), rule: t('games.yahtzee.detail.scoring.rows.smallStraight.rule') },
            { name: t('yahtzee.categories.largeStraight'), value: t('games.yahtzee.detail.scoring.rows.largeStraight.value'), rule: t('games.yahtzee.detail.scoring.rows.largeStraight.rule') },
            { name: t('yahtzee.categories.yahtzee'), value: t('games.yahtzee.detail.scoring.rows.yahtzee.value'), rule: t('games.yahtzee.detail.scoring.rows.yahtzee.rule') },
            { name: t('yahtzee.categories.chance'), value: t('games.yahtzee.detail.scoring.rows.chance.value'), rule: t('games.yahtzee.detail.scoring.rows.chance.rule') },
          ],
        },
      ]}
      modes={[
        { title: t('games.yahtzee.detail.modes.short.title'), desc: t('games.yahtzee.detail.modes.short.desc') },
        { title: t('games.yahtzee.detail.modes.classic.title'), desc: t('games.yahtzee.detail.modes.classic.desc') },
        { title: t('games.yahtzee.detail.modes.timer.title'), desc: t('games.yahtzee.detail.modes.timer.desc') },
        { title: t('games.yahtzee.detail.modes.bots.title'), desc: t('games.yahtzee.detail.modes.bots.desc') },
      ]}
      playVsBotGameType="yahtzee"
    />
  )
}
