'use client'

import AdminWatchModal from '@/components/AdminWatchModal'
import { AuthGateModal } from '@/components/AuthGateModal'
import ConfirmModal from '@/components/ConfirmModal'
import FriendsListModal from '@/components/FriendsListModal'
import GameResultsModal from '@/components/GameResultsModal'
import QuickPlayButton from '@/components/HomePage/QuickPlayButton'
import PlayerProfileCard from '@/components/PlayerProfileCard'
import ReportDialog from '@/components/ReportDialog'
import GameInterruptedOverlay from '@/app/(site)/lobby/[code]/components/GameInterruptedOverlay'
import SketchCustomWords from '@/app/(site)/lobby/[code]/components/SketchCustomWords'

const noop = () => {}

function Dialog({ dialog }: { dialog: string }) {
  switch (dialog) {
    case 'auth-gate':
      return <AuthGateModal dest="/games/yahtzee" onClose={noop} />
    case 'friends':
      return <FriendsListModal isOpen onClose={noop} lobbyCode="FIXTURE" />
    case 'interrupted':
      return <GameInterruptedOverlay reason="abandoned" onRedirect={noop} />
    case 'confirm':
      return (
        <ConfirmModal
          isOpen
          onClose={noop}
          onConfirm={noop}
          title="Leave the game?"
          message="Your seat goes to a bot and the game carries on without you."
          variant="danger"
        />
      )
    case 'report':
      return (
        <ReportDialog
          isOpen
          onClose={noop}
          quote="gg, that last roll was unreal"
          targets={[
            { targetType: 'chat_message', targetId: 'fixture-message', lobbyCode: 'FIXTURE', reportedUserId: 'fixture-user', quotedText: 'gg, that last roll was unreal' },
          ]}
        />
      )
    case 'admin-watch':
      return <AdminWatchModal isOpen onClose={noop} onWatchAsSpectator={noop} onWatchAsAdmin={noop} />
    case 'results':
      return <GameResultsModal gameId="fixture" onClose={noop} />
    case 'profile':
      return <PlayerProfileCard userId="fixture" onClose={noop} />
    case 'custom-words':
      return <SketchCustomWords />
    case 'quick-play':
      return <QuickPlayButton autoOpen />
    default:
      return null
  }
}

export default function DialogsFixture({ dialog }: { dialog: string }) {
  return (
    <div className="mx-auto max-w-xl p-6">
      <Dialog dialog={dialog} />
    </div>
  )
}
