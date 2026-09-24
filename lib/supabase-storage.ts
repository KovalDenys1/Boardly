import { createClient } from '@supabase/supabase-js'

const BUCKET = 'avatars'
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

/**
 * The single source of truth for what an avatar may be. Deriving the storage
 * key's extension from this map — rather than from the client-supplied
 * `file.name` — keeps keys inside a known, closed set, which is what lets
 * deleteAvatar reliably find and remove them (#719).
 */
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const KNOWN_AVATAR_EXTENSIONS = Array.from(new Set(Object.values(EXTENSION_BY_MIME_TYPE)))

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Must be the service role key: uploads write to another user's prefix-scoped
  // path under RLS, and silently falling back to the anon key would change the
  // access model without any signal (#719).
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase storage not configured: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export function validateAvatarFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) return 'File too large (max 2MB)'
  if (!EXTENSION_BY_MIME_TYPE[file.type]) return 'Invalid file type (JPEG, PNG, WebP, GIF only)'
  return null
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = EXTENSION_BY_MIME_TYPE[file.type]
  if (!ext) {
    throw new Error('Unsupported avatar file type')
  }

  // Safe to pass through: the lookup above only succeeds for a MIME type in our
  // own allowlist, so this is never arbitrary client-declared content.
  const contentType = file.type
  const path = `${userId}/avatar.${ext}`

  const supabase = getSupabaseAdmin()

  // A user switching formats (png -> jpg) would otherwise leave the previous
  // object behind at its own key, still publicly served after being "replaced".
  await removeStoredAvatars(supabase, userId, [path])

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // Bust cache with timestamp so the browser shows the new image
  return `${data.publicUrl}?t=${Date.now()}`
}

type StorageClient = ReturnType<typeof getSupabaseAdmin>

/**
 * Removes every stored avatar object for a user, optionally keeping one path.
 * Lists the user's prefix rather than guessing extensions so nothing is left
 * behind — a leftover object stays publicly readable after the user believes
 * they deleted it.
 */
async function removeStoredAvatars(
  supabase: StorageClient,
  userId: string,
  keepPaths: string[] = []
): Promise<Error | null> {
  const keep = new Set(keepPaths)
  const { data: listed, error } = await supabase.storage.from(BUCKET).list(userId)

  const paths = error || !listed
    ? // Listing failed — fall back to the known extension set rather than
      // silently removing nothing.
      KNOWN_AVATAR_EXTENSIONS.map((ext) => `${userId}/avatar.${ext}`)
    : listed.map((entry) => `${userId}/${entry.name}`)

  const removable = paths.filter((path) => !keep.has(path))
  if (removable.length === 0) return null

  const { error: removeError } = await supabase.storage.from(BUCKET).remove(removable)
  return removeError ? new Error(`Avatar removal failed: ${removeError.message}`) : null
}

/** Whether avatars can have been stored at all; without it there is nothing to remove. */
export function isAvatarStorageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Removes every stored avatar for a user. Throws when storage answers with an
 * error, because account deletion relies on it: a leftover object stays
 * publicly served under the deleted user's id (#1128).
 */
export async function deleteAvatar(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const error = await removeStoredAvatars(supabase, userId)
  if (error) throw error
}
