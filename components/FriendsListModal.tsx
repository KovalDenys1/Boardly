'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from '@/lib/i18n-helpers'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import LoadingSpinner from './LoadingSpinner'

type FriendPresence = 'offline' | 'online' | 'in_lobby' | 'in_game'

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
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    loadFriends()
    setSelectedFriends(new Set(initialSelectedFriendIds))
    // initialSelectedFriendIds intentionally omitted: default [] creates a new reference
    // on every render and would cause an infinite loop. We only need this on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const loadFriends = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/friends')
      if (!res.ok) throw new Error('Failed to load friends')

      const data = await res.json()
      setFriends(data.friends || [])
      clientLogger.log('Friends loaded for invite', { count: data.friends?.length })
    } catch (error) {
      clientLogger.error('Error loading friends:', error)
      showToast.error('profile.friends.errors.loadFailed')
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

  const resolvePresence = (friend: Friend): FriendPresence => friend.presence || 'offline'

  const presencePriority: Record<FriendPresence, number> = {
    in_game: 0,
    in_lobby: 1,
    online: 2,
    offline: 3,
  }

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

  if (!isOpen) return null

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
              {[...friends]
                .sort((a, b) => {
                  const priorityDiff =
                    presencePriority[resolvePresence(a)] - presencePriority[resolvePresence(b)]
                  if (priorityDiff !== 0) return priorityDiff

                  const aName = a.username ?? ''
                  const bName = b.username ?? ''
                  return aName.localeCompare(bName)
                })
                .map((friend) => {
                  const presence = resolvePresence(friend)
                  const isOnline = presence !== 'offline'
                  const presenceLabel =
                    presence === 'in_game'
                      ? 'In game'
                      : presence === 'in_lobby'
                        ? 'In lobby'
                        : presence === 'online'
                          ? 'Online'
                          : null

                  const isSelected = selectedFriends.has(friend.id)

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
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-medium" style={{ color: 'var(--bd-ink)' }}>
                            {friend.username || 'Unknown'}
                          </span>
                          {presenceLabel && (
                            <span className="text-xs font-medium" style={{ color: '#22C55E' }}>
                              {presenceLabel}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <span style={{ color: 'var(--bd-ink)' }}>✓</span>
                      )}
                    </button>
                  )
                })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleInvite}
                disabled={inviting || selectedFriends.size === 0}
                className="flex-1 btn btn-primary disabled:opacity-50"
              >
                {inviting
                  ? t('common.loading')
                  : confirmLabel || (onSelect ? t('common.save') : t('lobby.invite.send', { count: selectedFriends.size }))}
              </button>
              <button
                onClick={onClose}
                className="flex-1 btn btn-secondary"
              >
                {t('common.cancel')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
