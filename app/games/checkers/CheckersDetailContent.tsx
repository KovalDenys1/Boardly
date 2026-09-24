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
      playVsBotGameType="checkers"
    />
  )
}
