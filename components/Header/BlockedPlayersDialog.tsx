'use client'

import { useState } from 'react'
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from '@headlessui/react'
import BlockedPlayersList from '@/components/BlockedPlayersList'
import { useTranslation } from '@/lib/i18n-helpers'

interface BlockedPlayersDialogProps {
  open: boolean
  onClose: () => void
}

/** A guest's block list (#1466), from the guest menu and the mobile drawer; an account has it in its settings. */
export function BlockedPlayersDialog({ open, onClose }: BlockedPlayersDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onClose={onClose} transition className="relative z-60">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-[rgba(31,27,22,0.45)] backdrop-blur-[4px] transition duration-200 ease-out data-closed:opacity-0 motion-reduce:transition-none"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="flex max-h-full w-full max-w-sm flex-col rounded-[1.5rem] border-[1.5px] border-bd-line bg-bd-card-warm p-5 shadow-[0_18px_36px_-18px_rgba(31,27,22,0.35)] transition duration-200 ease-out data-closed:scale-[0.98] data-closed:opacity-0 motion-reduce:transition-none"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
            <DialogTitle className="text-lg font-bold text-bd-ink">{t('blockedPlayers.title')}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="flex rounded-lg p-1.5 text-bd-ink-muted transition-colors hover:bg-bd-bg2 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-bd-lav-deep"
              aria-label={t('common.close')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <BlockedPlayersList className="min-h-0 flex-1" />
        </DialogPanel>
      </div>
    </Dialog>
  )
}

/** Opens the dialog; it closes with whatever renders the button, as the mobile drawer does. */
export function BlockedPlayersButton({ className }: { className?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {t('blockedPlayers.title')}
      </button>
      <BlockedPlayersDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}
