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
      rules={[
        t('games.liars_party.detail.rules.floorRotates'),
        t('games.liars_party.detail.rules.claimAndMark'),
        t('games.liars_party.detail.rules.everyoneElseVotes'),
        t('games.liars_party.detail.rules.caughtNeedsMore'),
        t('games.liars_party.detail.rules.strikesAndEnd'),
      ]}
      scoring={[
        {
          title: t('games.liars_party.detail.scoring.claimant.title'),
          note: t('games.liars_party.detail.scoring.claimant.note'),
          rows: [
            { name: t('games.liars_party.detail.scoring.claimant.rows.bluffGetsThrough.name'), value: t('games.liars_party.detail.scoring.claimant.rows.bluffGetsThrough.value'), rule: t('games.liars_party.detail.scoring.claimant.rows.bluffGetsThrough.rule') },
            { name: t('games.liars_party.detail.scoring.claimant.rows.bluffCaught.name'), value: t('games.liars_party.detail.scoring.claimant.rows.bluffCaught.value'), rule: t('games.liars_party.detail.scoring.claimant.rows.bluffCaught.rule') },
            { name: t('games.liars_party.detail.scoring.claimant.rows.truthBelieved.name'), value: t('games.liars_party.detail.scoring.claimant.rows.truthBelieved.value'), rule: t('games.liars_party.detail.scoring.claimant.rows.truthBelieved.rule') },
            { name: t('games.liars_party.detail.scoring.claimant.rows.truthChallenged.name'), value: t('games.liars_party.detail.scoring.claimant.rows.truthChallenged.value'), rule: t('games.liars_party.detail.scoring.claimant.rows.truthChallenged.rule') },
            { name: t('games.liars_party.detail.scoring.claimant.rows.noClaimInTime.name'), value: t('games.liars_party.detail.scoring.claimant.rows.noClaimInTime.value'), rule: t('games.liars_party.detail.scoring.claimant.rows.noClaimInTime.rule') },
          ],
        },
        {
          title: t('games.liars_party.detail.scoring.voters.title'),
          note: t('games.liars_party.detail.scoring.voters.note'),
          rows: [
            { name: t('games.liars_party.detail.scoring.voters.rows.challengeBluff.name'), value: t('games.liars_party.detail.scoring.voters.rows.challengeBluff.value'), rule: t('games.liars_party.detail.scoring.voters.rows.challengeBluff.rule') },
            { name: t('games.liars_party.detail.scoring.voters.rows.challengeTruth.name'), value: t('games.liars_party.detail.scoring.voters.rows.challengeTruth.value'), rule: t('games.liars_party.detail.scoring.voters.rows.challengeTruth.rule') },
            { name: t('games.liars_party.detail.scoring.voters.rows.believeTruth.name'), value: t('games.liars_party.detail.scoring.voters.rows.believeTruth.value'), rule: t('games.liars_party.detail.scoring.voters.rows.believeTruth.rule') },
            { name: t('games.liars_party.detail.scoring.voters.rows.believeBluff.name'), value: t('games.liars_party.detail.scoring.voters.rows.believeBluff.value'), rule: t('games.liars_party.detail.scoring.voters.rows.believeBluff.rule') },
            { name: t('games.liars_party.detail.scoring.voters.rows.noVoteInTime.name'), value: t('games.liars_party.detail.scoring.voters.rows.noVoteInTime.value'), rule: t('games.liars_party.detail.scoring.voters.rows.noVoteInTime.rule') },
          ],
        },
      ]}
      modes={[
        { title: t('games.liars_party.detail.modes.tableSize.title'), desc: t('games.liars_party.detail.modes.tableSize.desc') },
        { title: t('games.liars_party.detail.modes.phaseClock.title'), desc: t('games.liars_party.detail.modes.phaseClock.desc') },
        { title: t('games.liars_party.detail.modes.roundsAndStrikes.title'), desc: t('games.liars_party.detail.modes.roundsAndStrikes.desc') },
      ]}
      strategy={[
        { title: t('games.liars_party.detail.strategy.challengeAboveFortyTwo.title'), desc: t('games.liars_party.detail.strategy.challengeAboveFortyTwo.desc') },
        { title: t('games.liars_party.detail.strategy.yourReadScoresAlone.title'), desc: t('games.liars_party.detail.strategy.yourReadScoresAlone.desc') },
        { title: t('games.liars_party.detail.strategy.bluffForTheTable.title'), desc: t('games.liars_party.detail.strategy.bluffForTheTable.desc') },
        { title: t('games.liars_party.detail.strategy.countYourStrikes.title'), desc: t('games.liars_party.detail.strategy.countYourStrikes.desc') },
        { title: t('games.liars_party.detail.strategy.stayInToWin.title'), desc: t('games.liars_party.detail.strategy.stayInToWin.desc') },
        { title: t('games.liars_party.detail.strategy.strangeButTrue.title'), desc: t('games.liars_party.detail.strategy.strangeButTrue.desc') },
        { title: t('games.liars_party.detail.strategy.specificDetails.title'), desc: t('games.liars_party.detail.strategy.specificDetails.desc') },
        { title: t('games.liars_party.detail.strategy.readTheHistory.title'), desc: t('games.liars_party.detail.strategy.readTheHistory.desc') },
      ]}
    />
  )
}
