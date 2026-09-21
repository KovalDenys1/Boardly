'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function SketchAndGuessDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.guess_my_drawing.name')}
      title={t('games.guess_my_drawing.detail.title')}
      description={t('games.guess_my_drawing.detail.heroDesc')}
      iconLabel={t('games.guess_my_drawing.name')}
      gameId="guess-my-drawing"
      accentColor="var(--bd-mint)"
      accent="var(--bd-sky)"
      lobbiesHref="/games/sketch-and-guess/lobbies"
      primaryCtaLabel={t('games.playNow')}
      // minPlayers is 3 and supportsBots is false, so a visitor arriving alone
      // cannot start anything – the same notice Alias carries for the same
      // reason.
      groupNotice={t('games.guess_my_drawing.detail.groupNotice')}
      facts={[
        { label: t('games.detail.labels.players'), value: '3–10' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.gameType'), value: t('games.detail.values.party') },
      ]}
      introTitle={t('games.guess_my_drawing.detail.introTitle')}
      intro={[
        t('games.guess_my_drawing.detail.intro0'),
        t('games.guess_my_drawing.detail.intro1'),
      ]}
      steps={[
        { title: t('games.guess_my_drawing.detail.step1Title'), desc: t('games.guess_my_drawing.detail.step1Desc') },
        { title: t('games.guess_my_drawing.detail.step2Title'), desc: t('games.guess_my_drawing.detail.step2Desc') },
        { title: t('games.guess_my_drawing.detail.step3Title'), desc: t('games.guess_my_drawing.detail.step3Desc') },
        { title: t('games.guess_my_drawing.detail.step4Title'), desc: t('games.guess_my_drawing.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.guess_my_drawing.detail.benefitsTitle')}
      benefits={[
        t('games.guess_my_drawing.detail.benefit1'),
        t('games.guess_my_drawing.detail.benefit2'),
        t('games.guess_my_drawing.detail.benefit3'),
        t('games.guess_my_drawing.detail.benefit4'),
      ]}
    />
  )
}
