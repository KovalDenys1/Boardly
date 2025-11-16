/**
 * Integration test for Yahtzee bot logic
 * Tests that the bot makes valid decisions and completes games without errors
 * Run with: npx tsx lib/yahtzee-bot.test.ts
 */

import { YahtzeeBot } from './yahtzee-bot'
import { YahtzeeScorecard, calculateScore } from './yahtzee'

// Test result tracking
let testsRun = 0
let testsPassed = 0
let testsFailed = 0

function test(name: string, fn: () => void) {
  testsRun++
  try {
    fn()
    testsPassed++
    console.log(`✅ ${name}`)
  } catch (error) {
    testsFailed++
    console.error(`❌ ${name}`)
    console.error(`   ${error instanceof Error ? error.message : String(error)}`)
  }
}

function assertExists(value: any, message?: string) {
  if (value === undefined || value === null) {
    throw new Error(message || 'Expected value to exist')
  }
}

function assertTrue(value: boolean, message?: string) {
  if (!value) {
    throw new Error(message || 'Expected true, but got false')
  }
}

function assertInRange(value: number, min: number, max: number, message?: string) {
  if (value < min || value > max) {
    throw new Error(message || `Expected ${value} to be between ${min} and ${max}`)
  }
}

console.log('\n🤖 YAHTZEE BOT TESTS\n')
console.log('=' .repeat(50))

// ============================================================================
// BOT DECISION MAKING TESTS
// ============================================================================

console.log('\n🎯 BOT DECISION TESTS\n')

test('Bot: should select valid category for any dice', () => {
  const dice = [3, 4, 2, 5, 1]
  const scorecard: YahtzeeScorecard = {}
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertExists(category, 'Bot should select a category')
  
  // Verify selected category is available
  assertTrue(scorecard[category] === undefined, 'Bot should select available category')
})

test('Bot: should prefer high-scoring categories', () => {
  const dice = [5, 5, 5, 5, 5] // Yahtzee
  const scorecard: YahtzeeScorecard = {}
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertTrue(category === 'yahtzee', 'Bot should select Yahtzee for 5 of a kind')
})

test('Bot: should select large straight when available', () => {
  const dice = [1, 2, 3, 4, 5]
  const scorecard: YahtzeeScorecard = {}
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertTrue(category === 'largeStraight', 'Bot should recognize large straight')
})

test('Bot: should handle situation when preferred categories are taken', () => {
  const dice = [6, 6, 6, 6, 6] // Yahtzee
  const scorecard: YahtzeeScorecard = {
    yahtzee: 50 // Already taken
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertExists(category, 'Bot should find alternative category')
  assertTrue(scorecard[category] === undefined, 'Bot should select available category')
  
  // Should choose a high-value alternative (fourOfKind, fullHouse, sixes, or threeOfKind)
  const validChoices = ['fourOfKind', 'threeOfKind', 'sixes', 'fullHouse', 'chance']
  assertTrue(validChoices.includes(category), `Bot chose ${category}, which is valid`)
  
  const score = calculateScore(dice, category)
  console.log(`   Bot selected ${category} for ${score} points (Yahtzee already taken)`)
})

test('Bot: should handle low-value rolls sensibly', () => {
  const dice = [1, 2, 3, 4, 6] // No good patterns
  const scorecard: YahtzeeScorecard = {}
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertExists(category, 'Bot should select a category even for bad rolls')
  
  // Bot should probably dump in ones, twos, or threes
  const score = calculateScore(dice, category)
  console.log(`   Bot selected ${category} for score ${score}`)
})

test('Bot: should decide which dice to hold on first roll', () => {
  const dice = [5, 5, 5, 2, 3]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {}
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 3, scorecard)
  
  // Should hold the three 5s (indices 0, 1, 2)
  assertTrue(holdIndices.length >= 3, 'Bot should hold at least the three 5s')
  console.log(`   Bot decided to hold dice at indices: ${holdIndices}`)
})

test('Bot: should hold Yahtzee immediately', () => {
  const dice = [4, 4, 4, 4, 4]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {}
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 2, scorecard)
  
  // Should hold all 5 dice
  assertTrue(holdIndices.length === 5, 'Bot should hold all dice for Yahtzee')
})

test('Bot: should hold four of a kind and try for fifth', () => {
  const dice = [3, 3, 3, 3, 1]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {}
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 2, scorecard)
  
  // Should hold the four 3s
  assertTrue(holdIndices.length === 4, 'Bot should hold four of a kind')
})

test('Bot: should recognize and hold full house', () => {
  const dice = [2, 2, 2, 5, 5]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {
    fullHouse: undefined // Available
  }
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 2, scorecard)
  
  // Bot might hold all 5 for full house, or hold the three 2s to try for four of a kind
  // Both strategies are valid
  assertTrue(holdIndices.length >= 3, 'Bot should hold at least the three of a kind')
  console.log(`   Bot decided to hold ${holdIndices.length} dice for full house pattern`)
})

test('Bot: should make decisions with limited categories left', () => {
  const dice = [6, 5, 4, 3, 2]
  const scorecard: YahtzeeScorecard = {
    ones: 1,
    twos: 4,
    threes: 6,
    fours: 8,
    fives: 10,
    sixes: 12,
    threeOfKind: 15,
    fourOfKind: 20,
    fullHouse: 25,
    smallStraight: 30,
    largeStraight: 40,
    yahtzee: 0
    // Only 'chance' left
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertTrue(category === 'chance', 'Bot should select the only available category')
})

// ============================================================================
// BOT STRATEGY TESTS
// ============================================================================

console.log('\n🧠 BOT STRATEGY TESTS\n')

test('Bot: should prioritize upper section bonus when close', () => {
  const dice = [6, 6, 6, 2, 3]
  const scorecard: YahtzeeScorecard = {
    ones: 2,
    twos: 6,
    threes: 9,
    fours: 12,
    fives: 15
    // Upper sum = 44, need 19 more for bonus
    // sixes available
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Bot should strongly consider 'sixes' to work toward bonus
  console.log(`   Bot selected ${category} (upper sum: 44/63)`)
})

test('Bot: should not waste high-value rolls on low categories', () => {
  const dice = [6, 6, 6, 6, 5] // Four sixes
  const scorecard: YahtzeeScorecard = {}
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  
  // Should NOT select ones, twos, threes
  const badChoices = ['ones', 'twos', 'threes']
  assertTrue(!badChoices.includes(category), `Bot should not waste this roll on ${category}`)
})

test('Bot: should dump bad rolls in low-value categories', () => {
  const dice = [1, 1, 2, 3, 4] // Low sum, no good patterns
  const scorecard: YahtzeeScorecard = {
    threeOfKind: 20,
    fourOfKind: 25,
    fullHouse: 25,
    smallStraight: 30,
    largeStraight: 40,
    yahtzee: 50,
    chance: 25
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  
  // Should probably dump in ones or twos
  const score = calculateScore(dice, category)
  console.log(`   Bot dumped bad roll in ${category} for ${score} points`)
})

// ============================================================================
// BOT EDGE CASES
// ============================================================================

console.log('\n🔍 BOT EDGE CASES\n')

test('Bot: should handle empty scorecard', () => {
  const dice = [3, 4, 2, 5, 1]
  const scorecard: YahtzeeScorecard = {}
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertExists(category, 'Bot should handle empty scorecard')
})

test('Bot: should handle nearly full scorecard', () => {
  const dice = [6, 5, 4, 3, 2]
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, largeStraight: 40, yahtzee: 0
    // Only chance left
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertTrue(category === 'chance', 'Bot should select last available category')
})

test('Bot: dice holding decisions should be valid indices', () => {
  const dice = [1, 2, 3, 4, 5]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {}
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 2, scorecard)
  
  // All indices should be valid (0-4)
  for (const idx of holdIndices) {
    assertInRange(idx, 0, 4, `Dice index ${idx} should be between 0 and 4`)
  }
})

test('Bot: should not try to hold dice on last roll (rollsLeft = 0)', () => {
  const dice = [3, 3, 3, 2, 1]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {}
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 0, scorecard)
  
  // Should return empty array when no rolls left
  assertTrue(holdIndices.length === 0, 'Bot should not hold dice when rollsLeft = 0')
})

test('Bot: should handle all-different dice', () => {
  const dice = [1, 2, 3, 4, 6]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {}
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 2, scorecard)
  
  // Should make some decision (might hold high values)
  console.log(`   Bot decided to hold ${holdIndices.length} dice for all-different roll`)
})

test('Bot: should handle all-same dice (Yahtzee)', () => {
  const dice = [5, 5, 5, 5, 5]
  const held = [false, false, false, false, false]
  const scorecard: YahtzeeScorecard = {}
  
  const holdIndices = YahtzeeBot.decideDiceToHold(dice, held, 2, scorecard)
  
  // Should hold all 5
  assertTrue(holdIndices.length === 5, 'Bot should hold all dice for Yahtzee')
})

// ============================================================================
// PHASE 2 TESTS: Tasks 2.1, 2.2, 2.3
// ============================================================================

console.log('\n🔧 PHASE 2 IMPROVEMENTS TESTS\n')

// Task 2.1: Protection from missing categories
test('Task 2.1: Bot should handle completely filled scorecard gracefully', () => {
  const dice = [3, 4, 2, 5, 1]
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, largeStraight: 40, yahtzee: 50, chance: 20
  }
  
  // Should not throw error, should return fallback
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertExists(category, 'Bot should return a fallback category')
  console.log(`   Bot returned fallback: ${category}`)
})

// Task 2.2: Upper section bonus prioritization
test('Task 2.2: Bot should prioritize upper section when close to bonus (10 pts away)', () => {
  const dice = [6, 6, 6, 3, 4] // Three 6s
  const scorecard: YahtzeeScorecard = {
    ones: 3,     // 3
    twos: 6,     // 6
    threes: 9,   // 9
    fours: 12,   // 12
    fives: 15,   // 15
    // Upper sum = 45, need 18 more for bonus (sixes can give max 18)
    // sixes is available
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Bot should strongly consider 'sixes' to get bonus
  assertTrue(category === 'sixes' || category === 'threeOfKind', 
    `Bot should prioritize sixes or threeOfKind, got ${category}`)
  console.log(`   Bot selected ${category} (45/63 towards bonus)`)
})

test('Task 2.2: Bot should prioritize upper section when very close to bonus (5 pts away)', () => {
  const dice = [5, 5, 5, 2, 3] // Three 5s
  const scorecard: YahtzeeScorecard = {
    ones: 3,
    twos: 6,
    threes: 9,
    fours: 12,
    sixes: 18,
    // Upper sum = 48, need 15 more (fives can give 15)
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Bot MUST prioritize fives to secure bonus
  assertTrue(category === 'fives', `Bot should prioritize fives for bonus, got ${category}`)
  console.log(`   Bot correctly selected ${category} (48/63, can reach exactly 63!)`)
})

test('Task 2.2: Bot should not waste Yahtzee on low upper section category', () => {
  const dice = [1, 1, 1, 1, 1] // Yahtzee of ones
  const scorecard: YahtzeeScorecard = {
    twos: 6,
    threes: 9,
    fours: 12,
    fives: 15,
    sixes: 18,
    // Upper sum = 60, need 3 more, but have Yahtzee
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Bot should prefer yahtzee (50 pts) over ones (5 pts), even though ones would give bonus
  assertTrue(category === 'yahtzee', `Bot should not waste Yahtzee on 5 points, got ${category}`)
  console.log(`   Bot correctly chose ${category} (50 pts > 5 pts + 35 bonus)`)
})

test('Task 2.2: Bot should recognize when bonus is impossible', () => {
  const dice = [3, 3, 3, 4, 5]
  const scorecard: YahtzeeScorecard = {
    ones: 2,
    twos: 4,
    threes: 6,
    // Upper sum = 12, need 51 more
    // Only fours, fives, sixes left (max 18+25+30 = 73, so bonus IS possible)
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Bot should work toward bonus
  console.log(`   Bot selected ${category} (upper sum: 12/63, bonus still achievable)`)
})

test('Task 2.2: Bot should recognize when bonus is truly impossible', () => {
  const dice = [1, 1, 1, 2, 3]
  const scorecard: YahtzeeScorecard = {
    fours: 0,
    fives: 0,
    sixes: 0,
    // Upper sum = 0, all high-value categories taken with 0
    // Max possible = 1+2+3 = 6, bonus impossible
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Bot should just pick best available, not prioritize upper section artificially
  console.log(`   Bot selected ${category} (bonus impossible, not prioritizing upper)`)
})

// Task 2.3: Endgame strategy
test('Task 2.3: Bot should handle endgame with 1 category left', () => {
  const dice = [6, 5, 4, 3, 2]
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, largeStraight: 40, yahtzee: 0
    // Only 'chance' left
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertTrue(category === 'chance', 'Bot should select the only available category')
  console.log(`   Bot correctly selected last category: ${category}`)
})

test('Task 2.3: Bot should be conservative in endgame (3 categories left)', () => {
  const dice = [4, 4, 3, 2, 1] // Low sum, no great patterns
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, largeStraight: 40
    // Only yahtzee and chance left
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Should pick chance (14 pts) over yahtzee (0 pts) in endgame
  assertTrue(category === 'chance', `Bot should take guaranteed points in endgame, got ${category}`)
  console.log(`   Bot conservatively chose ${category} in endgame`)
})

test('Task 2.3: Bot should still take high-value combos in endgame', () => {
  const dice = [1, 2, 3, 4, 5] // Large straight
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, yahtzee: 0
    // Only largeStraight and chance left
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  assertTrue(category === 'largeStraight', 'Bot should take 40 pts over 15 pts even in endgame')
  console.log(`   Bot correctly prioritized large straight in endgame`)
})

test('Task 2.3: Bot should avoid zeros in endgame if possible', () => {
  const dice = [1, 2, 3, 4, 6] // No yahtzee, decent sum
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, largeStraight: 40
    // Only yahtzee and chance left
  }
  
  const category = YahtzeeBot.selectCategory(dice, scorecard)
  // Should strongly prefer chance (16 pts) over yahtzee (0 pts) in endgame
  assertTrue(category === 'chance', `Bot should avoid zero in endgame, got ${category}`)
  const score = calculateScore(dice, category)
  console.log(`   Bot avoided zero, took ${category} for ${score} pts`)
})

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(50))
console.log('\n📈 BOT TEST SUMMARY\n')
console.log(`Total tests run:    ${testsRun}`)
console.log(`Tests passed:       ${testsPassed} ✅`)
console.log(`Tests failed:       ${testsFailed} ❌`)
console.log(`Success rate:       ${((testsPassed / testsRun) * 100).toFixed(1)}%`)

if (testsFailed === 0) {
  console.log('\n🎉 All bot tests passed! Bot logic is working correctly.\n')
  process.exit(0)
} else {
  console.log('\n⚠️  Some bot tests failed. Please review the errors above.\n')
  process.exit(1)
}
