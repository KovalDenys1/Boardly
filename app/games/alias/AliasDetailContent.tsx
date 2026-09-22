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
      // minPlayers is 4 and supportsBots is false, so a visitor arriving alone
      // cannot start anything (#780).
      groupNotice={t('games.alias.detail.groupNotice')}
      facts={[
        { label: t('games.detail.labels.players'), value: '4–16' },
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
    />
  )
}
