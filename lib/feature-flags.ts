function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isTelephoneDoodleEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.ENABLE_TELEPHONE_DOODLE) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_TELEPHONE_DOODLE)
  )
}

export function isSketchAndGuessEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.ENABLE_SKETCH_AND_GUESS) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_SKETCH_AND_GUESS)
  )
}

export function isLiarsPartyEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.ENABLE_LIARS_PARTY) ||
    parseBooleanFlag(process.env.NEXT_PUBLIC_ENABLE_LIARS_PARTY)
  )
}
