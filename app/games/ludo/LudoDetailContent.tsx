'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function LudoDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.ludo.name')}
      title={t('games.ludo.detail.title')}
      description={t('games.ludo.detail.heroDesc')}
      iconLabel={t('games.ludo.name')}
      gameId="ludo"
      accentColor="var(--bd-sun)"
      accent="var(--bd-coral)"
      lobbiesHref="/games/ludo/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–4' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.ludo.detail.introTitle')}
      intro={[
        t('games.ludo.detail.intro0'),
        t('games.ludo.detail.intro1'),
      ]}
      steps={[
        { title: t('games.ludo.detail.step1Title'), desc: t('games.ludo.detail.step1Desc') },
        { title: t('games.ludo.detail.step2Title'), desc: t('games.ludo.detail.step2Desc') },
        { title: t('games.ludo.detail.step3Title'), desc: t('games.ludo.detail.step3Desc') },
        { title: t('games.ludo.detail.step4Title'), desc: t('games.ludo.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.ludo.detail.benefitsTitle')}
      benefits={[
        t('games.ludo.detail.benefit1'),
        t('games.ludo.detail.benefit2'),
        t('games.ludo.detail.benefit3'),
        t('games.ludo.detail.benefit4'),
      ]}
      rules={[
        t('games.ludo.rules.serverRolls'),
        t('games.ludo.rules.sixToLeave'),
        t('games.ludo.rules.sixRollsAgain'),
        t('games.ludo.rules.capture'),
        t('games.ludo.rules.safeSquares'),
        t('games.ludo.rules.exactHome'),
        t('games.ludo.rules.winner'),
        t('games.ludo.rules.modes'),
        t('games.ludo.rules.timer'),
      ]}
      playVsBotGameType="ludo"
    />
  )
}
