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
      rules={[
        t('games.guess_my_drawing.detail.rules.drawOrder'),
        t('games.guess_my_drawing.detail.rules.wordChoice'),
        t('games.guess_my_drawing.detail.rules.matching'),
        t('games.guess_my_drawing.detail.rules.wordHint'),
        t('games.guess_my_drawing.detail.rules.chatLock'),
      ]}
      scoring={[
        {
          title: t('games.guess_my_drawing.detail.scoring.guessing.title'),
          rows: [
            { name: t('games.guess_my_drawing.detail.scoring.guessing.rightGuess.name'), value: '50', rule: t('games.guess_my_drawing.detail.scoring.guessing.rightGuess.rule') },
            { name: t('games.guess_my_drawing.detail.scoring.guessing.speedBonus.name'), value: t('games.guess_my_drawing.detail.scoring.guessing.speedBonus.value'), rule: t('games.guess_my_drawing.detail.scoring.guessing.speedBonus.rule') },
            { name: t('games.guess_my_drawing.detail.scoring.guessing.firstIn.name'), value: '+20', rule: t('games.guess_my_drawing.detail.scoring.guessing.firstIn.rule') },
          ],
        },
        {
          title: t('games.guess_my_drawing.detail.scoring.drawing.title'),
          note: t('games.guess_my_drawing.detail.scoring.drawing.note'),
          rows: [
            { name: t('games.guess_my_drawing.detail.scoring.drawing.perCorrectGuesser.name'), value: '+40', rule: t('games.guess_my_drawing.detail.scoring.drawing.perCorrectGuesser.rule') },
            { name: t('games.guess_my_drawing.detail.scoring.drawing.ownRuling.name'), value: '0', rule: t('games.guess_my_drawing.detail.scoring.drawing.ownRuling.rule') },
            { name: t('games.guess_my_drawing.detail.scoring.drawing.blankCanvas.name'), value: '−20', rule: t('games.guess_my_drawing.detail.scoring.drawing.blankCanvas.rule') },
          ],
        },
      ]}
      modes={[
        { title: t('games.guess_my_drawing.detail.modes.threeRounds.title'), desc: t('games.guess_my_drawing.detail.modes.threeRounds.desc') },
        { title: t('games.guess_my_drawing.detail.modes.phaseClocks.title'), desc: t('games.guess_my_drawing.detail.modes.phaseClocks.desc') },
        { title: t('games.guess_my_drawing.detail.modes.roomSize.title'), desc: t('games.guess_my_drawing.detail.modes.roomSize.desc') },
      ]}
      strategy={[
        { title: t('games.guess_my_drawing.detail.strategy.pickTheDrawableWord.title'), desc: t('games.guess_my_drawing.detail.strategy.pickTheDrawableWord.desc') },
        { title: t('games.guess_my_drawing.detail.strategy.shapeFirst.title'), desc: t('games.guess_my_drawing.detail.strategy.shapeFirst.desc') },
        { title: t('games.guess_my_drawing.detail.strategy.letColourTalk.title'), desc: t('games.guess_my_drawing.detail.strategy.letColourTalk.desc') },
        { title: t('games.guess_my_drawing.detail.strategy.drawTheScene.title'), desc: t('games.guess_my_drawing.detail.strategy.drawTheScene.desc') },
        { title: t('games.guess_my_drawing.detail.strategy.guessEarly.title'), desc: t('games.guess_my_drawing.detail.strategy.guessEarly.desc') },
        { title: t('games.guess_my_drawing.detail.strategy.readTheMisses.title'), desc: t('games.guess_my_drawing.detail.strategy.readTheMisses.desc') },
        { title: t('games.guess_my_drawing.detail.strategy.countTheBlanks.title'), desc: t('games.guess_my_drawing.detail.strategy.countTheBlanks.desc') },
        { title: t('games.guess_my_drawing.detail.strategy.trustSoClose.title'), desc: t('games.guess_my_drawing.detail.strategy.trustSoClose.desc') },
      ]}
      mistakes={[
        { title: t('games.guess_my_drawing.detail.mistakes.leavingTheCanvasEmpty.title'), desc: t('games.guess_my_drawing.detail.mistakes.leavingTheCanvasEmpty.desc') },
        { title: t('games.guess_my_drawing.detail.mistakes.clearingForOneLine.title'), desc: t('games.guess_my_drawing.detail.mistakes.clearingForOneLine.desc') },
        { title: t('games.guess_my_drawing.detail.mistakes.waitingToBeSure.title'), desc: t('games.guess_my_drawing.detail.mistakes.waitingToBeSure.desc') },
      ]}
      multiplayer={[
        { title: t('games.guess_my_drawing.detail.multiplayer.withFriends.title'), desc: t('games.guess_my_drawing.detail.multiplayer.withFriends.desc') },
        { title: t('games.guess_my_drawing.detail.multiplayer.botsAndSolo.title'), desc: t('games.guess_my_drawing.detail.multiplayer.botsAndSolo.desc') },
        { title: t('games.guess_my_drawing.detail.multiplayer.turnTimer.title'), desc: t('games.guess_my_drawing.detail.multiplayer.turnTimer.desc') },
        { title: t('games.guess_my_drawing.detail.multiplayer.guestNoDownload.title'), desc: t('games.guess_my_drawing.detail.multiplayer.guestNoDownload.desc') },
      ]}
      audience={[
        t('games.guess_my_drawing.detail.audience.whoItSuits'),
      ]}
    />
  )
}
