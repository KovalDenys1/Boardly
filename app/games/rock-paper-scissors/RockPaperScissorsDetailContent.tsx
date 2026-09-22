'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

/**
 * The copy lives under `games.rock_paper_scissors.*`, not `games.rps.*`: the
 * catalog entry for `rps` already points its `nameKey` and its SEO question at
 * that namespace, so the detail copy sits beside them rather than in the
 * lobby-only `games.rps` block.
 */
export default function RockPaperScissorsDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.rock_paper_scissors.name')}
      title={t('games.rock_paper_scissors.detail.title')}
      description={t('games.rock_paper_scissors.detail.heroDesc')}
      iconLabel={t('games.rock_paper_scissors.name')}
      gameId="rps"
      accentColor="var(--bd-lav)"
      accent="var(--bd-lav)"
      lobbiesHref="/games/rock-paper-scissors/lobbies"
      primaryCtaLabel={t('games.playNow')}
      playVsBotGameType="rock_paper_scissors"
      facts={[
        { label: t('games.detail.labels.players'), value: '1–2' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.gameType'), value: t('games.detail.values.casual') },
      ]}
      introTitle={t('games.rock_paper_scissors.detail.introTitle')}
      intro={[
        t('games.rock_paper_scissors.detail.intro0'),
        t('games.rock_paper_scissors.detail.intro1'),
      ]}
      steps={[
        { title: t('games.rock_paper_scissors.detail.step1Title'), desc: t('games.rock_paper_scissors.detail.step1Desc') },
        { title: t('games.rock_paper_scissors.detail.step2Title'), desc: t('games.rock_paper_scissors.detail.step2Desc') },
        { title: t('games.rock_paper_scissors.detail.step3Title'), desc: t('games.rock_paper_scissors.detail.step3Desc') },
        { title: t('games.rock_paper_scissors.detail.step4Title'), desc: t('games.rock_paper_scissors.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.rock_paper_scissors.detail.benefitsTitle')}
      benefits={[
        t('games.rock_paper_scissors.detail.benefit1'),
        t('games.rock_paper_scissors.detail.benefit2'),
        t('games.rock_paper_scissors.detail.benefit3'),
        t('games.rock_paper_scissors.detail.benefit4'),
      ]}
    />
  )
}
