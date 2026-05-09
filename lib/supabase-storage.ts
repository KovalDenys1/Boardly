import { createClient } from '@supabase/supabase-js'

const BUCKET = 'avatars'
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Prefer service role key (bypasses RLS); fall back to anon key for server-side uploads
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase storage not configured: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export function validateAvatarFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) return 'File too large (max 2MB)'
  if (!ALLOWED_MIME_TYPES.includes(file.type)) return 'Invalid file type (JPEG, PNG, WebP, GIF only)'
  return null
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `${userId}/avatar.${ext}`

  const supabase = getSupabaseAdmin()
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw new Error(`Upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // Bust cache with timestamp so the browser shows the new image
  return `${data.publicUrl}?t=${Date.now()}`
}

export async function deleteAvatar(userId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const extensions = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const paths = extensions.map((ext) => `${userId}/avatar.${ext}`)
  await supabase.storage.from(BUCKET).remove(paths)
}
