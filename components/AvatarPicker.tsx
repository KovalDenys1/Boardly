'use client'

import { useRef, useState } from 'react'
import { UserAvatar } from '@/components/Header/UserAvatar'

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
  const [error, setError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const displayAvatar = currentAvatarUrl || currentImage

  async function selectDefault(avatarId: number) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save avatar')
        return
      }
      const { avatarUrl } = await res.json()
      onSaved(avatarUrl)
    } finally {
      setSaving(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/user/avatar', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        setUploadError(data.error ?? 'Upload failed')
        return
      }
      const { avatarUrl } = await res.json()
      onSaved(avatarUrl)
    } finally {
      setSaving(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function removeAvatar() {
    setSaving(true)
    setError(null)
    try {
      await fetch('/api/user/avatar', { method: 'DELETE' })
      onSaved(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Current avatar preview */}
      <div className="flex items-center gap-4">
        <UserAvatar
          image={displayAvatar}
          userName={username}
          userEmail={email}
          className="h-16 w-16 bg-white/10 text-2xl font-bold text-white"
          textClassName="text-2xl font-bold"
        />
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">Profile photo</p>
          <p className="text-xs text-slate-400">Pick a default or upload your own (max 2MB)</p>
        </div>
      </div>

      {/* Default avatar grid */}
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Default avatars</p>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_AVATARS.map((id) => {
            const url = `/avatars/defaults/avatar-${id}.svg`
            const isSelected = currentAvatarUrl === url
            return (
              <button
                key={id}
                onClick={() => selectDefault(id)}
                disabled={saving}
                className={`h-12 w-12 overflow-hidden rounded-full ring-2 ring-offset-2 ring-offset-slate-900 transition-all hover:scale-105 disabled:opacity-50 ${
                  isSelected ? 'ring-indigo-400' : 'ring-transparent hover:ring-white/30'
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

      {/* Upload + remove */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={saving}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
        >
          Upload photo
        </button>
        {currentAvatarUrl && (
          <button
            onClick={removeAvatar}
            disabled={saving}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-400 transition hover:text-white disabled:opacity-50"
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

      {(error || uploadError) && (
        <p className="text-sm text-red-400">{error || uploadError}</p>
      )}
    </div>
  )
}
