'use client'

import { useRef, useState } from 'react'
import { UserAvatar } from '@/components/Header/UserAvatar'
import { showToast } from '@/lib/i18n-toast'

const DEFAULT_AVATARS = [1, 2, 3, 4, 5, 6, 7, 8] as const

type AvatarPickerProps = {
  currentAvatarUrl: string | null
  currentImage: string | null
  username: string | null
  email: string | null
  onSaved: (avatarUrl: string | null) => void
}

export default function AvatarPicker({
  currentAvatarUrl,
  currentImage,
  username,
  email,
  onSaved,
}: AvatarPickerProps) {
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayAvatar = currentAvatarUrl || currentImage

  async function selectDefault(avatarId: number) {
    setSaving(true)
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast.error('errors.generic', data.error ?? 'Failed to save avatar')
        return
      }
      onSaved(data.avatarUrl)
      showToast.success('toast.success', 'Avatar updated')
    } catch {
      showToast.error('errors.generic', 'Failed to save avatar')
    } finally {
      setSaving(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      showToast.error('errors.generic', 'File too large (max 2 MB)')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/user/avatar', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) {
        showToast.error('errors.generic', data.error ?? 'Upload failed')
        return
      }
      onSaved(data.avatarUrl)
      showToast.success('toast.success', 'Avatar uploaded')
    } catch {
      showToast.error('errors.generic', 'Upload failed. Check your connection.')
    } finally {
      setSaving(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function removeAvatar() {
    setSaving(true)
    try {
      await fetch('/api/user/avatar', { method: 'DELETE' })
      onSaved(null)
      showToast.success('toast.success', 'Avatar removed')
    } catch {
      showToast.error('errors.generic', 'Failed to remove avatar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Current avatar preview */}
      <div className="flex items-center gap-4">
        <UserAvatar
          image={displayAvatar}
          userName={username}
          userEmail={email}
          className="h-16 w-16 shrink-0 bg-bd-lav text-white"
          textClassName="text-2xl font-bold"
        />
        <div>
          <p className="text-sm font-semibold text-bd-ink dark:text-white">Profile photo</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {currentImage && !currentAvatarUrl
              ? 'Using your connected account photo — pick one below to override'
              : 'Pick a default or upload your own (max 2 MB)'}
          </p>
        </div>
      </div>

      {/* Default avatar grid */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Default avatars
        </p>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_AVATARS.map((id) => {
            const url = `/avatars/defaults/avatar-${id}.svg`
            const isSelected = currentAvatarUrl === url
            return (
              <button
                key={id}
                onClick={() => selectDefault(id)}
                disabled={saving}
                className={`h-12 w-12 overflow-hidden rounded-full border-2 transition-all hover:scale-105 disabled:opacity-50 ${
                  isSelected
                    ? 'border-indigo-500 shadow-[0_0_0_2px_#6366f1]'
                    : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600'
                }`}
                aria-label={`Default avatar ${id}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Avatar ${id}`} className="h-full w-full" />
              </button>
            )
          })}
        </div>
      </div>

      {/* Upload + remove actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={saving}
          className="rounded-xl border border-bd-line bg-white px-4 py-2 text-sm font-medium text-bd-ink shadow-sm transition hover:bg-bd-card-warm disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600"
        >
          {saving ? 'Saving…' : 'Upload photo'}
        </button>
        {currentAvatarUrl && (
          <button
            type="button"
            onClick={removeAvatar}
            disabled={saving}
            className="rounded-xl border border-bd-line px-4 py-2 text-sm font-medium text-slate-500 transition hover:text-bd-ink disabled:opacity-50 dark:border-slate-600 dark:text-slate-400 dark:hover:text-white"
          >
            Remove
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  )
}
