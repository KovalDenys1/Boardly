'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function LiarsPartyDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.liars_party.name')}
      title={t('games.liars_party.detail.title')}
      description={t('games.liars_party.detail.heroDesc')}
      iconLabel={t('games.liars_party.name')}
      gameId="liars-party"
      accentColor="var(--bd-lav)"
      accent="var(--bd-lav)"
      lobbiesHref="/games/liars-party/lobbies"
      primaryCtaLabel={t('games.playNow')}
      facts={[
        { label: t('games.detail.labels.players'), value: '4–12' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.gameType'), value: t('games.detail.values.social') },
      ]}
      introTitle={t('games.liars_party.detail.introTitle')}
      intro={[
        t('games.liars_party.detail.intro0'),
        t('games.liars_party.detail.intro1'),
      ]}
      steps={[
        { title: t('games.liars_party.detail.step1Title'), desc: t('games.liars_party.detail.step1Desc') },
        { title: t('games.liars_party.detail.step2Title'), desc: t('games.liars_party.detail.step2Desc') },
        { title: t('games.liars_party.detail.step3Title'), desc: t('games.liars_party.detail.step3Desc') },
        { title: t('games.liars_party.detail.step4Title'), desc: t('games.liars_party.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.liars_party.detail.benefitsTitle')}
      benefits={[
        t('games.liars_party.detail.benefit1'),
        t('games.liars_party.detail.benefit2'),
        t('games.liars_party.detail.benefit3'),
        t('games.liars_party.detail.benefit4'),
      ]}
    />
  )
}
