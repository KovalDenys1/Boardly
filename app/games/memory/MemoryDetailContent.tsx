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
      icon="🧠"
      iconLabel="Brain"
      gameId="memory"
      accentColor="var(--bd-mint)"
      accent="var(--bd-mint)"
      lobbiesHref="/games/memory/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '2–4' },
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
    />
  )
}
