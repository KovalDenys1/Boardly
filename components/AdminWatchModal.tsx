'use client'

import Modal from './Modal'
import { useTranslation } from '@/lib/i18n-helpers'

interface AdminWatchModalProps {
  isOpen: boolean
  onClose: () => void
  onWatchAsSpectator: () => void
  onWatchAsAdmin: () => void
  spectatorsDisabled?: boolean
}

export default function AdminWatchModal({
  isOpen,
  onClose,
  onWatchAsSpectator,
  onWatchAsAdmin,
  spectatorsDisabled = false,
}: AdminWatchModalProps) {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="sm" title={t('admin.watchModal.title')}>
      <div className="flex flex-col gap-3">
        {!spectatorsDisabled && (
          <button
            onClick={() => { onWatchAsSpectator(); onClose() }}
            className="flex items-center gap-3 rounded-xl border-1.5 p-4 text-left transition-colors"
            style={{ borderColor: 'var(--bd-line)', background: 'var(--bd-card-warm)' }}
          >
            <span className="text-2xl">👁️</span>
            <span>
              <span className="block font-bold" style={{ color: 'var(--bd-ink)' }}>{t('admin.watchModal.spectatorTitle')}</span>
              <span className="block text-sm" style={{ color: 'var(--bd-ink-muted)' }}>{t('admin.watchModal.spectatorDesc')}</span>
            </span>
          </button>
        )}
        <button
          onClick={() => { onWatchAsAdmin(); onClose() }}
          className="flex items-center gap-3 rounded-xl border-1.5 p-4 text-left transition-colors"
          style={{ borderColor: 'rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.08)' }}
        >
          <span className="text-2xl">🛡️</span>
          <span>
            <span className="block font-bold" style={{ color: 'var(--bd-ink)' }}>{t('admin.watchModal.adminTitle')}</span>
            <span className="block text-sm" style={{ color: 'var(--bd-ink-muted)' }}>{t('admin.watchModal.adminDesc')}</span>
          </span>
        </button>
      </div>
    </Modal>
  )
}
