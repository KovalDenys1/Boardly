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
      icon="🎲"
      iconLabel="Dice"
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
      guideHref="/guides/how-to-play-yahtzee-online"
    />
  )
}
