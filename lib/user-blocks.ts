export const MAX_BLOCKS_PER_ACCOUNT = 500

export const BLOCKED_PLAYERS_STORAGE_KEY = 'boardly_blocked_players'

/** Followed by the account id: the last list read for a signed-in account, kept until it signs out. */
export const BLOCKED_PLAYERS_ACCOUNT_CACHE_PREFIX = 'boardly_blocked_players_account:'

export const BLOCKED_PLAYERS_CHANGED_EVENT = 'boardly:blocked-players-changed'
