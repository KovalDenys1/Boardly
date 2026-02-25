type JsonObject = Record<string, unknown>

function parseGameState(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function scrubSpyIdentity(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubSpyIdentity(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const source = value as JsonObject
  const result: JsonObject = {}

  for (const [key, rawChild] of Object.entries(source)) {
    const lowerKey = key.toLowerCase()
    if (
      lowerKey === 'isspy' ||
      lowerKey === 'spyid' ||
      lowerKey === 'spyuserid' ||
      lowerKey === 'spyplayerid' ||
      lowerKey === 'spyindex'
    ) {
      continue
    }

    result[key] = scrubSpyIdentity(rawChild)
  }

  return result
}

export function sanitizeGameStateForSpectator(gameType: string, rawState: unknown): unknown {
  const parsed = parseGameState(rawState)
  if (!parsed) {
    return parsed
  }

  if (gameType === 'guess_the_spy') {
    return scrubSpyIdentity(parsed)
  }

  return parsed
}
