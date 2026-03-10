const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeProfileEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidProfileEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeProfileEmail(email))
}
