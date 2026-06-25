'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import {
  useOnlinePresence,
  mergeFriendPresence,
  sortFriendsByPresence,
  type FriendPresence,
} from '@/hooks/useFriendPresence'
import LoadingSpinner from './LoadingSpinner'

interface Friend {
  id: string
  username: string | null
  avatar: string | null
  email: string
  presence?: FriendPresence
}

interface FriendsListModalProps {
  isOpen: boolean
  onClose: () => void
  onInvite?: (friendIds: string[]) => Promise<{ invitedCount: number; skippedCount: number }>
  onSelect?: (friendIds: string[]) => Promise<void> | void
  initialSelectedFriendIds?: string[]
  confirmLabel?: string
  lobbyCode: string
}

export default function FriendsListModal({
  isOpen,
  onClose,
  onInvite,
  onSelect,
  initialSelectedFriendIds = [],
  confirmLabel,
  lobbyCode,
}: FriendsListModalProps) {
  const { t } = useTranslation()
  const [friends, setFriends] = useState<Friend[]>([])
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [invitingFriendId, setInvitingFriendId] = useState<string | null>(null)
  const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set())
  const onlineUserIds = useOnlinePresence()

  // Only one of onInvite/onSelect is ever passed by callers; onSelect (the
  // create-lobby party pre-select flow, no lobby exists yet) keeps the
  // original select-many + confirm-button behavior untouched. onInvite (an
  // already-existing lobby) gets a dedicated Invite button per friend.
  const mode: 'select-multi' | 'invite-single' = onSelect ? 'select-multi' : 'invite-single'

  useEffect(() => {
    if (!isOpen) return
    loadFriends()
    setSelectedFriends(new Set(initialSelectedFriendIds))
    setInvitedFriendIds(new Set())
    // initialSelectedFriendIds intentionally omitted: default [] creates a new reference
    // on every render and would cause an infinite loop. We only need this on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const loadFriends = async () => {
    try {
      setLoading(true)
      setLoadError(false)
      const res = await fetch('/api/friends')
      if (!res.ok) throw new Error('Failed to load friends')

      const data = await res.json()
      setFriends(data.friends || [])
      clientLogger.log('Friends loaded for invite', { count: data.friends?.length })
    } catch (error) {
      clientLogger.error('Error loading friends:', error)
      showToast.error('profile.friends.errors.loadFailed')
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const toggleFriend = (friendId: string) => {
    const newSelected = new Set(selectedFriends)
    if (newSelected.has(friendId)) {
      newSelected.delete(friendId)
    } else {
      newSelected.add(friendId)
    }
    setSelectedFriends(newSelected)
  }

  const resolvePresence = (friend: Friend): FriendPresence =>
    mergeFriendPresence(friend.presence, onlineUserIds.has(friend.id))

  const handleInvite = async () => {
    if (selectedFriends.size === 0) {
      showToast.error('lobby.invite.selectFriends')
      return
    }

    setInviting(true)
    try {
      const selectedIds = Array.from(selectedFriends)

      if (onSelect) {
        await onSelect(selectedIds)
        setSelectedFriends(new Set())
        onClose()
        return
      }

      if (!onInvite) {
        throw new Error('Invite handler is not configured')
      }

      const result = await onInvite(Array.from(selectedFriends))
      if (result.skippedCount > 0) {
        showToast.info('toast.inviteSkippedUsers', undefined, { count: result.skippedCount })
      }
      if (result.invitedCount > 0) {
        showToast.success('lobby.invite.sent', undefined, { count: result.invitedCount })
      }
      setSelectedFriends(new Set())
      onClose()
    } catch (error) {
      clientLogger.error('Error inviting friends:', error)
      const translationKey =
        typeof (error as { translationKey?: unknown })?.translationKey === 'string'
          ? ((error as { translationKey?: string }).translationKey as string)
          : null

      if (translationKey) {
        showToast.error(translationKey)
      } else {
        showToast.errorFrom(error, 'lobby.invite.failed')
      }
    } finally {
      setInviting(false)
    }
  }

  const handleInviteSingle = async (friend: Friend) => {
    if (!onInvite || invitingFriendId || invitedFriendIds.has(friend.id)) return

    setInvitingFriendId(friend.id)
    try {
      const result = await onInvite([friend.id])
      if (result.invitedCount > 0) {
        setInvitedFriendIds((prev) => new Set(prev).add(friend.id))
        showToast.success('lobby.invite.sentToFriend', undefined, { name: friend.username || 'Unknown' })
      } else {
        showToast.info('toast.inviteSkippedUsers', undefined, { count: 1 })
      }
    } catch (error) {
      clientLogger.error('Error inviting friend:', error)
      const translationKey =
        typeof (error as { translationKey?: unknown })?.translationKey === 'string'
          ? ((error as { translationKey?: string }).translationKey as string)
          : null

      if (translationKey) {
        showToast.error(translationKey)
      } else {
        showToast.errorFrom(error, 'lobby.invite.failed')
      }
    } finally {
      setInvitingFriendId(null)
    }
  }

  if (!isOpen) return null

  const presenceLabel = (presence: FriendPresence): string | null => {
    if (presence === 'in_game') return t('profile.friends.presence.inGame')
    if (presence === 'in_lobby') return t('profile.friends.presence.inLobby')
    if (presence === 'online') return t('profile.friends.presence.online')
    return null
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="rounded-2xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
        style={{ background: 'var(--bd-card-warm)', border: '1.5px solid var(--bd-line)' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold" style={{ color: 'var(--bd-ink)' }}>
            {t('lobby.invite.title')}
          </h3>
          <button
            onClick={onClose}
            className="transition-opacity hover:opacity-60"
            style={{ color: 'var(--bd-ink-muted)' }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="text-3xl">⚠️</span>
            <p className="text-sm" style={{ color: 'var(--bd-ink-soft)' }}>{t('profile.friends.errors.loadFailed')}</p>
            <button onClick={loadFriends} className="bd-btn bd-btn-soft text-xs">
              {t('common.retry')}
            </button>
          </div>
        ) : friends.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-lg mb-2">👥</p>
            <p style={{ color: 'var(--bd-ink-soft)' }}>{t('lobby.invite.noFriends')}</p>
            <p className="text-sm mt-2" style={{ color: 'var(--bd-ink-muted)' }}>{t('lobby.invite.addFriendsFirst')}</p>
          </div>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--bd-ink-soft)' }}>
              {t('lobby.invite.description')}
            </p>

            <div className="space-y-2 mb-6">
              {sortFriendsByPresence(
                friends,
                resolvePresence,
                (friend) => friend.username ?? ''
              ).map((friend) => {
                const presence = resolvePresence(friend)
                const isOnline = presence !== 'offline'
                const label = presenceLabel(presence)
                const isSelected = selectedFriends.has(friend.id)

                const avatarBlock = (
                  <div className="relative">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                      style={{ background: 'var(--bd-ink)' }}
                    >
                      {friend.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    {isOnline && (
                      <div
                        className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
                        style={{ background: '#22C55E', border: '2px solid var(--bd-card-warm)' }}
                      />
                    )}
                  </div>
                )

                const nameBlock = (
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: 'var(--bd-ink)' }}>
                        {friend.username || 'Unknown'}
                      </span>
                      {label && (
                        <span className="text-xs font-medium" style={{ color: '#22C55E' }}>
                          {label}
                        </span>
                      )}
                    </div>
                  </div>
                )

                if (mode === 'select-multi') {
                  return (
                    <button
                      key={friend.id}
                      onClick={() => toggleFriend(friend.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl transition-all"
                      style={{
                        border: isSelected ? '2px solid var(--bd-sun)' : '1.5px solid var(--bd-line)',
                        background: isSelected ? '#FFC44D18' : 'var(--bd-bg)',
                      }}
                    >
                      {avatarBlock}
                      {nameBlock}
                      {isSelected && (
                        <span style={{ color: 'var(--bd-ink)' }}>✓</span>
                      )}
                    </button>
                  )
                }

                const isInvited = invitedFriendIds.has(friend.id)
                const isInvitingThisRow = invitingFriendId === friend.id

                return (
                  <div
                    key={friend.id}
                    className="w-full flex items-center gap-3 p-3 rounded-xl"
                    style={{ border: '1.5px solid var(--bd-line)', background: 'var(--bd-bg)' }}
                  >
                    {avatarBlock}
                    {nameBlock}
                    <button
                      type="button"
                      onClick={() => handleInviteSingle(friend)}
                      disabled={isInvited || isInvitingThisRow || invitingFriendId !== null}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition-opacity disabled:cursor-not-allowed"
                      style={{
                        background: isInvited ? 'var(--bd-bg2)' : 'var(--bd-sun)',
                        color: isInvited ? 'var(--bd-ink-muted)' : 'var(--bd-ink)',
                        opacity: isInvitingThisRow ? 0.65 : 1,
                      }}
                    >
                      {isInvited
                        ? `✓ ${t('lobby.invite.invited')}`
                        : isInvitingThisRow
                          ? '…'
                          : t('lobby.invite.inviteButton')}
                    </button>
                  </div>
                )
              })}
            </div>

            {mode === 'select-multi' ? (
              <div className="flex gap-2">
                <button
                  onClick={handleInvite}
                  disabled={inviting || selectedFriends.size === 0}
                  className="flex-1 btn btn-primary disabled:opacity-50"
                >
                  {inviting
                    ? t('common.loading')
                    : confirmLabel || t('common.save')}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 btn btn-secondary"
                >
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button onClick={onClose} className="w-full btn btn-secondary">
                {t('common.cancel')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
