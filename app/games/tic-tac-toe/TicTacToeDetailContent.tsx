'use client'

import { useTranslation } from '@/lib/i18n-helpers'
import GameDetailPage from '../components/GameDetailPage'

export default function TicTacToeDetailContent() {
  const { t } = useTranslation()

  return (
    <GameDetailPage
      gameName={t('games.tictactoe.name')}
      title={t('games.tictactoe.detail.title')}
      description={t('games.tictactoe.detail.heroDesc')}
      icon="X"
      iconLabel="Tic Tac Toe board"
      iconVariant="tic-tac-toe"
      gameId="tic-tac-toe"
      accentColor="var(--bd-coral)"
      accent="var(--bd-sun)"
      lobbiesHref="/games/tic-tac-toe/lobbies"
      facts={[
        { label: t('games.detail.labels.players'), value: '2' },
        { label: t('games.detail.labels.price'), value: t('games.detail.values.free') },
        { label: t('games.detail.labels.download'), value: t('games.detail.values.none') },
        { label: t('games.detail.labels.botSupport'), value: t('games.detail.values.yes') },
      ]}
      introTitle={t('games.tictactoe.detail.introTitle')}
      intro={[
        t('games.tictactoe.detail.intro0'),
        t('games.tictactoe.detail.intro1'),
      ]}
      steps={[
        { title: t('games.tictactoe.detail.step1Title'), desc: t('games.tictactoe.detail.step1Desc') },
        { title: t('games.tictactoe.detail.step2Title'), desc: t('games.tictactoe.detail.step2Desc') },
        { title: t('games.tictactoe.detail.step3Title'), desc: t('games.tictactoe.detail.step3Desc') },
        { title: t('games.tictactoe.detail.step4Title'), desc: t('games.tictactoe.detail.step4Desc') },
      ]}
      benefitsTitle={t('games.tictactoe.detail.benefitsTitle')}
      benefits={[
        t('games.tictactoe.detail.benefit1'),
        t('games.tictactoe.detail.benefit2'),
        t('games.tictactoe.detail.benefit3'),
        t('games.tictactoe.detail.benefit4'),
      ]}
      guideHref="/guides/how-to-play-tic-tac-toe-online"
    />
  )
}
