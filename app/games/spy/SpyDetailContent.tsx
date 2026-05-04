'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function SpyDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.spy.name')}
      title={t('games.spy.detail.title')}
      description={t('games.spy.detail.heroDesc')}
      icon="🕵️"
      iconLabel="Spy"
      gameId="spy"
      accentColor="var(--bd-lav)"
      accent="var(--bd-coral)"
      lobbiesHref="/games/spy/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '3–10' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.gameType'), value: t('games.detail.values.party') },
      ]}
      introTitle={t('games.spy.detail.introTitle')}
      intro={[
        t('games.spy.detail.intro0'),
        t('games.spy.detail.intro1'),
      ]}
      steps={[
        { title: t('games.spy.detail.step1Title'), desc: t('games.spy.detail.step1Desc') },
        { title: t('games.spy.detail.step2Title'), desc: t('games.spy.detail.step2Desc') },
        { title: t('games.spy.detail.step3Title'), desc: t('games.spy.detail.step3Desc') },
        { title: t('games.spy.detail.step4Title'), desc: t('games.spy.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.spy.detail.benefitsTitle')}
      benefits={[
        t('games.spy.detail.benefit1'),
        t('games.spy.detail.benefit2'),
        t('games.spy.detail.benefit3'),
        t('games.spy.detail.benefit4'),
      ]}
    />
  )
}
