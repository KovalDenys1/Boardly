'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function ConnectFourDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.connect_four.name')}
      title={t('games.connect_four.detail.title')}
      description={t('games.connect_four.detail.heroDesc')}
      icon="🔴"
      iconLabel="Connect Four board"
      iconVariant={undefined}
      gameId="connect-four"
      accentColor="var(--bd-coral)"
      accent="var(--bd-sun)"
      lobbiesHref="/games/connect-four/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '2' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.connect_four.detail.introTitle')}
      intro={[
        t('games.connect_four.detail.intro0'),
        t('games.connect_four.detail.intro1'),
      ]}
      steps={[
        { title: t('games.connect_four.detail.step1Title'), desc: t('games.connect_four.detail.step1Desc') },
        { title: t('games.connect_four.detail.step2Title'), desc: t('games.connect_four.detail.step2Desc') },
        { title: t('games.connect_four.detail.step3Title'), desc: t('games.connect_four.detail.step3Desc') },
        { title: t('games.connect_four.detail.step4Title'), desc: t('games.connect_four.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.connect_four.detail.benefitsTitle')}
      benefits={[
        t('games.connect_four.detail.benefit1'),
        t('games.connect_four.detail.benefit2'),
        t('games.connect_four.detail.benefit3'),
        t('games.connect_four.detail.benefit4'),
      ]}
      playVsBotGameType="connect_four"
    />
  )
}
