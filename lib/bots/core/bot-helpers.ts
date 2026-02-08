/**
 * Bot Helper Functions - shared utilities for bot system
 */

/**
 * Type guard to check if a player is a bot
 * Checks for bot relation in user object (after Feb 2026 migration)
 * 
 * @param player - Any player object with user relation
 * @returns true if player has bot relation
 */
export function isBot(player: unknown): player is { user: { bot: unknown } } {
    return (
        typeof player === 'object' &&
        player !== null &&
        'user' in player &&
        typeof player.user === 'object' &&
        player.user !== null &&
        'bot' in player.user &&
        player.user.bot !== null &&
        player.user.bot !== undefined
    )
}

/**
 * Extract bot difficulty from player
 */
export function getBotDifficulty(player: { user: { bot: { difficulty?: string } | null } }): 'easy' | 'medium' | 'hard' {
    const difficulty = player.user?.bot?.difficulty
    if (difficulty === 'easy' || difficulty === 'medium' || difficulty === 'hard') {
        return difficulty
    }
    return 'medium' // Default
}

/**
 * Extract bot type from player
 */
export function getBotType(player: { user: { bot: { botType?: string } | null } }): string | null {
    return player.user?.bot?.botType ?? null
}

/**
 * Check if bot supports a specific game type
 */
export function botSupportsGame(botType: string | null, gameType: string): boolean {
    if (!botType) return false

    // Map bot types to supported games
    const supportMap: Record<string, string[]> = {
        'yahtzee': ['yahtzee'],
        'spy': ['guess_the_spy'],
        'uno': ['uno'],
        'chess': ['chess'],
        'generic': ['yahtzee', 'guess_the_spy', 'uno', 'chess'] // Generic bots support all games
    }

    return supportMap[botType]?.includes(gameType) ?? false
}
