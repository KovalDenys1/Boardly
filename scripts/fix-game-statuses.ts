/**
 * Fix Game Status Mismatches
 * 
 * This script finds and fixes games where the database status field
 * doesn't match the status in the JSON game state.
 * 
 * Common scenarios:
 * - Spy games finished but stuck in "playing" status
 * - State says "finished" but DB says "playing" or "waiting"
 * 
 * Usage:
 *   npm run fix-game-statuses        # Dry run (shows what would be fixed)
 *   npm run fix-game-statuses --fix  # Actually fix the games
 */

import { prisma } from '../lib/db'

interface GameStateMismatch {
    id: string
    dbStatus: string
    stateStatus: string
    gameType: string
    lobbyCode: string
    createdAt: Date
    updatedAt: Date
    hasWinner: boolean
    winner?: string
}

async function findStatusMismatches() {
    console.log('🔍 Searching for games with status mismatches...\n')

    // Fetch all games that are not in a final state
    const games = await prisma.games.findMany({
        where: {
            status: {
                in: ['waiting', 'playing'], // Only check non-final states
            },
        },
        include: {
            lobby: {
                select: {
                    code: true,
                },
            },
        },
        orderBy: {
            updatedAt: 'desc',
        },
    })

    console.log(`Found ${games.length} games in waiting/playing status\n`)

    const mismatches: GameStateMismatch[] = []

    for (const game of games) {
        try {
            // Parse game state JSON
            const state = JSON.parse(game.state)

            // Check if state has a status field and it differs from DB
            if (state.status && state.status !== game.status) {
                mismatches.push({
                    id: game.id,
                    dbStatus: game.status,
                    stateStatus: state.status,
                    gameType: game.gameType,
                    lobbyCode: game.lobby.code,
                    createdAt: game.createdAt,
                    updatedAt: game.updatedAt,
                    hasWinner: !!state.winner,
                    winner: state.winner,
                })
            }
        } catch (error) {
            console.error(`⚠️  Failed to parse state for game ${game.id}:`, error)
        }
    }

    return mismatches
}

async function fixStatusMismatches(mismatches: GameStateMismatch[], dryRun: boolean = true) {
    if (mismatches.length === 0) {
        console.log('✅ No status mismatches found! All games are in sync.\n')
        return
    }

    console.log(`⚠️  Found ${mismatches.length} games with status mismatches:\n`)

    // Group by mismatch type
    const byType: Record<string, GameStateMismatch[]> = {}
    for (const mismatch of mismatches) {
        const key = `${mismatch.dbStatus} → ${mismatch.stateStatus}`
        if (!byType[key]) byType[key] = []
        byType[key].push(mismatch)
    }

    // Print summary
    console.log('Summary by mismatch type:')
    for (const [type, games] of Object.entries(byType)) {
        console.log(`  ${type}: ${games.length} games`)
    }
    console.log()

    // Print details for each mismatch
    console.log('Detailed list:')
    mismatches.forEach((game, i) => {
        console.log(`${i + 1}. Game ${game.id}`)
        console.log(`   Lobby: ${game.lobbyCode} (${game.gameType})`)
        console.log(`   Created: ${game.createdAt.toLocaleString()}`)
        console.log(`   Updated: ${game.updatedAt.toLocaleString()}`)
        console.log(`   DB Status: ${game.dbStatus}`)
        console.log(`   State Status: ${game.stateStatus}`)
        if (game.hasWinner) {
            console.log(`   Winner: ${game.winner}`)
        }
        console.log()
    })

    if (dryRun) {
        console.log('🔧 To fix these games, run: npm run fix-game-statuses -- --fix\n')
        return
    }

    // Actually fix the games
    console.log('🔧 Fixing games...\n')

    let fixedCount = 0
    let errorCount = 0

    for (const mismatch of mismatches) {
        try {
            await prisma.games.update({
                where: { id: mismatch.id },
                data: {
                    status: mismatch.stateStatus as any, // Cast to avoid TypeScript issues
                    updatedAt: new Date(),
                },
            })
            fixedCount++
            console.log(`✅ Fixed game ${mismatch.id}: ${mismatch.dbStatus} → ${mismatch.stateStatus}`)
        } catch (error) {
            errorCount++
            console.error(`❌ Failed to fix game ${mismatch.id}:`, error)
        }
    }

    console.log(`\n✅ Fixed ${fixedCount} games`)
    if (errorCount > 0) {
        console.log(`⚠️  Failed to fix ${errorCount} games`)
    }
}

async function main() {
    const args = process.argv.slice(2)
    const shouldFix = args.includes('--fix')

    try {
        const mismatches = await findStatusMismatches()
        await fixStatusMismatches(mismatches, !shouldFix)
    } catch (error) {
        console.error('❌ Error:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
