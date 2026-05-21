interface RawLobbyUserLike {
  id?: unknown
  username?: unknown
  isGuest?: unknown
  isBot?: unknown
  image?: unknown
  avatarUrl?: unknown
  premiumUntil?: unknown
  bot?: {
    difficulty?: unknown
  } | null
}

interface RawLobbyCreatorLike {
  id?: unknown
  username?: unknown
}

export interface LobbyApiUserIdentity {
  id: string
  username: string
  isGuest: boolean
  isBot: boolean
  isPremium: boolean
  image: string | null
  avatarUrl: string | null
  bot: { difficulty?: string } | null
}

export interface LobbyApiCreatorIdentity {
  id: string | null
  username: string
}

export function sanitizeLobbyUserIdentity(user: unknown): LobbyApiUserIdentity | null {
  if (!user || typeof user !== 'object') {
    return null
  }

  const rawUser = user as RawLobbyUserLike
  const hasBotRelation = !!rawUser.bot
  const isBot = hasBotRelation || rawUser.isBot === true
  const botDifficulty =
    rawUser.bot && typeof rawUser.bot.difficulty === 'string' ? rawUser.bot.difficulty : undefined

  const isPremium =
    rawUser.premiumUntil instanceof Date
      ? rawUser.premiumUntil > new Date()
      : typeof rawUser.premiumUntil === 'string'
        ? new Date(rawUser.premiumUntil) > new Date()
        : false

  return {
    id: typeof rawUser.id === 'string' ? rawUser.id : '',
    username: typeof rawUser.username === 'string' && rawUser.username.trim().length > 0 ? rawUser.username : 'Player',
    isGuest: rawUser.isGuest === true,
    isBot,
    isPremium,
    image: typeof rawUser.image === 'string' ? rawUser.image : null,
    avatarUrl: typeof rawUser.avatarUrl === 'string' ? rawUser.avatarUrl : null,
    bot: isBot ? (botDifficulty ? { difficulty: botDifficulty } : {}) : null,
  }
}

export function sanitizeLobbyCreatorIdentity(creator: unknown): LobbyApiCreatorIdentity | null {
  if (!creator || typeof creator !== 'object') {
    return null
  }

  const rawCreator = creator as RawLobbyCreatorLike
  return {
    id: typeof rawCreator.id === 'string' ? rawCreator.id : null,
    username:
      typeof rawCreator.username === 'string' && rawCreator.username.trim().length > 0
        ? rawCreator.username
        : 'Player',
  }
}
