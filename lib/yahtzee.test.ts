/**
 * Unit tests for Yahtzee scoring logic
 * Run with: npx tsx lib/yahtzee.test.ts
 */

import { calculateScore, calculateTotalScore, isGameFinished, YahtzeeScorecard } from './yahtzee'

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

function assertEquals(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected}, but got ${actual}`
    )
  }
}

function assertTrue(value: boolean, message?: string) {
  if (!value) {
    throw new Error(message || 'Expected true, but got false')
  }
}

function assertFalse(value: boolean, message?: string) {
  if (value) {
    throw new Error(message || 'Expected false, but got true')
  }
}

console.log('\n🎲 YAHTZEE SCORING TESTS\n')
console.log('=' .repeat(50))

// ============================================================================
// UPPER SECTION TESTS (Ones through Sixes)
// ============================================================================

console.log('\n📊 UPPER SECTION TESTS\n')

test('Ones: should count all ones', () => {
  assertEquals(calculateScore([1, 1, 1, 2, 3], 'ones'), 3)
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'ones'), 1)
  assertEquals(calculateScore([2, 3, 4, 5, 6], 'ones'), 0)
  assertEquals(calculateScore([1, 1, 1, 1, 1], 'ones'), 5)
})

test('Twos: should count all twos', () => {
  assertEquals(calculateScore([2, 2, 2, 3, 4], 'twos'), 6)
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'twos'), 2)
  assertEquals(calculateScore([1, 3, 4, 5, 6], 'twos'), 0)
  assertEquals(calculateScore([2, 2, 2, 2, 2], 'twos'), 10)
})

test('Threes: should count all threes', () => {
  assertEquals(calculateScore([3, 3, 3, 4, 5], 'threes'), 9)
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'threes'), 3)
  assertEquals(calculateScore([1, 2, 4, 5, 6], 'threes'), 0)
  assertEquals(calculateScore([3, 3, 3, 3, 3], 'threes'), 15)
})

test('Fours: should count all fours', () => {
  assertEquals(calculateScore([4, 4, 4, 5, 6], 'fours'), 12)
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'fours'), 4)
  assertEquals(calculateScore([1, 2, 3, 5, 6], 'fours'), 0)
  assertEquals(calculateScore([4, 4, 4, 4, 4], 'fours'), 20)
})

test('Fives: should count all fives', () => {
  assertEquals(calculateScore([5, 5, 5, 6, 1], 'fives'), 15)
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'fives'), 5)
  assertEquals(calculateScore([1, 2, 3, 4, 6], 'fives'), 0)
  assertEquals(calculateScore([5, 5, 5, 5, 5], 'fives'), 25)
})

test('Sixes: should count all sixes', () => {
  assertEquals(calculateScore([6, 6, 6, 1, 2], 'sixes'), 18)
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'sixes'), 0)
  assertEquals(calculateScore([1, 2, 3, 4, 6], 'sixes'), 6)
  assertEquals(calculateScore([6, 6, 6, 6, 6], 'sixes'), 30)
})

// ============================================================================
// LOWER SECTION TESTS (Combinations)
// ============================================================================

console.log('\n🎯 LOWER SECTION TESTS\n')

test('Three of a Kind: should return sum if 3+ same dice', () => {
  assertEquals(calculateScore([3, 3, 3, 4, 5], 'threeOfKind'), 18) // 3+3+3+4+5
  assertEquals(calculateScore([5, 5, 5, 5, 1], 'threeOfKind'), 21) // 4 of a kind counts
  assertEquals(calculateScore([6, 6, 6, 6, 6], 'threeOfKind'), 30) // Yahtzee counts
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'threeOfKind'), 0)  // No three of a kind
  assertEquals(calculateScore([2, 2, 3, 3, 4], 'threeOfKind'), 0)  // Two pairs don't count
})

test('Four of a Kind: should return sum if 4+ same dice', () => {
  assertEquals(calculateScore([4, 4, 4, 4, 2], 'fourOfKind'), 18) // 4+4+4+4+2
  assertEquals(calculateScore([6, 6, 6, 6, 6], 'fourOfKind'), 30) // Yahtzee counts
  assertEquals(calculateScore([3, 3, 3, 4, 5], 'fourOfKind'), 0)  // Only three
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'fourOfKind'), 0)  // No four of a kind
})

test('Full House: should return 25 for 3+2 combination', () => {
  assertEquals(calculateScore([3, 3, 3, 2, 2], 'fullHouse'), 25) // Classic full house
  assertEquals(calculateScore([6, 6, 4, 4, 4], 'fullHouse'), 25) // Order doesn't matter
  assertEquals(calculateScore([1, 1, 5, 5, 5], 'fullHouse'), 25) // Different numbers
})

test('Full House: should return 25 for Yahtzee (5 of a kind)', () => {
  // По классическим правилам Yahtzee, 5 одинаковых тоже считается Full House
  assertEquals(calculateScore([5, 5, 5, 5, 5], 'fullHouse'), 25) // Yahtzee as Full House
  assertEquals(calculateScore([2, 2, 2, 2, 2], 'fullHouse'), 25) // Any Yahtzee
})

test('Full House: should return 0 for invalid combinations', () => {
  assertEquals(calculateScore([3, 3, 3, 4, 5], 'fullHouse'), 0)  // Only three of a kind
  assertEquals(calculateScore([2, 2, 4, 4, 6], 'fullHouse'), 0)  // Two pairs
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'fullHouse'), 0)  // Straight
  assertEquals(calculateScore([3, 3, 3, 3, 2], 'fullHouse'), 0)  // Four + one
})

test('Small Straight: should return 30 for 4 consecutive dice', () => {
  assertEquals(calculateScore([1, 2, 3, 4, 6], 'smallStraight'), 30) // 1-2-3-4
  assertEquals(calculateScore([2, 3, 4, 5, 6], 'smallStraight'), 30) // 2-3-4-5
  assertEquals(calculateScore([3, 4, 5, 6, 1], 'smallStraight'), 30) // 3-4-5-6
})

test('Small Straight: should work with duplicates', () => {
  assertEquals(calculateScore([1, 2, 3, 4, 4], 'smallStraight'), 30) // Duplicate 4
  assertEquals(calculateScore([2, 2, 3, 4, 5], 'smallStraight'), 30) // Duplicate 2
  assertEquals(calculateScore([1, 1, 2, 3, 4], 'smallStraight'), 30) // Duplicate 1
})

test('Small Straight: should work with large straight', () => {
  // Large straight contains small straight
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'smallStraight'), 30)
  assertEquals(calculateScore([2, 3, 4, 5, 6], 'smallStraight'), 30)
})

test('Small Straight: should return 0 for invalid sequences', () => {
  assertEquals(calculateScore([1, 2, 4, 5, 6], 'smallStraight'), 0) // Missing 3 (no 4 consecutive)
  assertEquals(calculateScore([1, 2, 2, 2, 2], 'smallStraight'), 0) // Not enough unique
  assertEquals(calculateScore([1, 1, 1, 1, 1], 'smallStraight'), 0) // All same
  assertEquals(calculateScore([1, 3, 5, 6, 6], 'smallStraight'), 0) // No 4 consecutive
  assertEquals(calculateScore([2, 4, 5, 6, 6], 'smallStraight'), 0) // Missing 3 (2-4-5-6 not consecutive)
})

test('Large Straight: should return 40 for 5 consecutive dice', () => {
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'largeStraight'), 40) // 1-2-3-4-5
  assertEquals(calculateScore([2, 3, 4, 5, 6], 'largeStraight'), 40) // 2-3-4-5-6
})

test('Large Straight: order should not matter', () => {
  assertEquals(calculateScore([5, 4, 3, 2, 1], 'largeStraight'), 40) // Reversed
  assertEquals(calculateScore([3, 1, 4, 2, 5], 'largeStraight'), 40) // Scrambled
  assertEquals(calculateScore([6, 2, 4, 3, 5], 'largeStraight'), 40) // Scrambled
})

test('Large Straight: should return 0 with duplicates', () => {
  assertEquals(calculateScore([1, 2, 3, 4, 4], 'largeStraight'), 0) // Duplicate 4
  assertEquals(calculateScore([2, 2, 3, 4, 5], 'largeStraight'), 0) // Duplicate 2
  assertEquals(calculateScore([1, 2, 3, 3, 4], 'largeStraight'), 0) // Only 4 unique
})

test('Large Straight: should return 0 for invalid sequences', () => {
  assertEquals(calculateScore([1, 2, 3, 4, 6], 'largeStraight'), 0) // Missing 5
  assertEquals(calculateScore([1, 3, 4, 5, 6], 'largeStraight'), 0) // Missing 2
  assertEquals(calculateScore([1, 1, 1, 1, 1], 'largeStraight'), 0) // All same
})

test('Yahtzee: should return 50 for 5 of a kind', () => {
  assertEquals(calculateScore([1, 1, 1, 1, 1], 'yahtzee'), 50)
  assertEquals(calculateScore([3, 3, 3, 3, 3], 'yahtzee'), 50)
  assertEquals(calculateScore([6, 6, 6, 6, 6], 'yahtzee'), 50)
})

test('Yahtzee: should return 0 if not 5 of a kind', () => {
  assertEquals(calculateScore([1, 1, 1, 1, 2], 'yahtzee'), 0) // Four of a kind
  assertEquals(calculateScore([3, 3, 3, 2, 2], 'yahtzee'), 0) // Full house
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'yahtzee'), 0) // Straight
})

test('Chance: should return sum of all dice', () => {
  assertEquals(calculateScore([1, 2, 3, 4, 5], 'chance'), 15)
  assertEquals(calculateScore([6, 6, 6, 6, 6], 'chance'), 30)
  assertEquals(calculateScore([1, 1, 1, 1, 1], 'chance'), 5)
  assertEquals(calculateScore([5, 4, 3, 2, 1], 'chance'), 15)
  assertEquals(calculateScore([6, 5, 4, 3, 2], 'chance'), 20)
})

// ============================================================================
// TOTAL SCORE AND BONUS TESTS
// ============================================================================

console.log('\n🏆 TOTAL SCORE AND BONUS TESTS\n')

test('Total Score: should calculate correctly without bonus', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 2,      // 2
    twos: 6,      // 6
    threes: 9,    // 9
    fours: 12,    // 12
    fives: 15,    // 15
    sixes: 18,    // 18
    // Upper section = 62 (no bonus, need 63)
    threeOfKind: 20,
    fourOfKind: 0,
    fullHouse: 25,
    smallStraight: 30,
    largeStraight: 0,
    yahtzee: 0,
    chance: 15
  }
  // Total: 62 (upper) + 0 (no bonus) + 90 (lower) = 152
  assertEquals(calculateTotalScore(scorecard), 152)
})

test('Total Score: should include +35 bonus when upper >= 63', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 3,      // 3
    twos: 6,      // 6
    threes: 9,    // 9
    fours: 12,    // 12
    fives: 15,    // 15
    sixes: 18,    // 18
    // Upper section = 63 (exactly 63, gets bonus)
    threeOfKind: 20,
    fourOfKind: 0,
    fullHouse: 25,
    smallStraight: 30,
    largeStraight: 0,
    yahtzee: 0,
    chance: 15
  }
  // Total: 63 (upper) + 35 (bonus) + 90 (lower) = 188
  assertEquals(calculateTotalScore(scorecard), 188)
})

test('Total Score: should include bonus with high upper section', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 5,      // 5
    twos: 10,     // 10
    threes: 15,   // 15
    fours: 20,    // 20
    fives: 25,    // 25
    sixes: 30,    // 30
    // Upper section = 105 (well above 63, gets bonus)
    threeOfKind: 0,
    fourOfKind: 0,
    fullHouse: 0,
    smallStraight: 0,
    largeStraight: 0,
    yahtzee: 0,
    chance: 0
  }
  // Total: 105 (upper) + 35 (bonus) + 0 (lower) = 140
  assertEquals(calculateTotalScore(scorecard), 140)
})

test('Total Score: should handle perfect game', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 5,              // 5
    twos: 10,             // 10
    threes: 15,           // 15
    fours: 20,            // 20
    fives: 25,            // 25
    sixes: 30,            // 30
    // Upper = 105 + 35 bonus = 140
    threeOfKind: 30,      // 30
    fourOfKind: 30,       // 30
    fullHouse: 25,        // 25
    smallStraight: 30,    // 30
    largeStraight: 40,    // 40
    yahtzee: 50,          // 50
    chance: 30            // 30
    // Lower = 235
  }
  // Total: 105 + 35 + 235 = 375
  assertEquals(calculateTotalScore(scorecard), 375)
})

test('Total Score: should handle empty scorecard', () => {
  const scorecard: YahtzeeScorecard = {}
  assertEquals(calculateTotalScore(scorecard), 0)
})

test('Total Score: should handle partial scorecard', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 3,
    yahtzee: 50,
    chance: 20
  }
  // Total: 3 (upper) + 0 (no bonus) + 70 (lower) = 73
  assertEquals(calculateTotalScore(scorecard), 73)
})

// ============================================================================
// GAME FINISHED TESTS
// ============================================================================

console.log('\n✔️  GAME FINISHED TESTS\n')

test('isGameFinished: should return true when all categories filled', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, largeStraight: 40, yahtzee: 50, chance: 20
  }
  assertTrue(isGameFinished(scorecard))
})

test('isGameFinished: should return false when categories missing', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6,
    threeOfKind: 10, fourOfKind: 15, fullHouse: 25,
    smallStraight: 30, largeStraight: 40, yahtzee: 50
    // Missing 'chance'
  }
  assertFalse(isGameFinished(scorecard))
})

test('isGameFinished: should return false for empty scorecard', () => {
  const scorecard: YahtzeeScorecard = {}
  assertFalse(isGameFinished(scorecard))
})

test('isGameFinished: should accept 0 scores as valid', () => {
  const scorecard: YahtzeeScorecard = {
    ones: 0, twos: 0, threes: 0, fours: 0, fives: 0, sixes: 0,
    threeOfKind: 0, fourOfKind: 0, fullHouse: 0,
    smallStraight: 0, largeStraight: 0, yahtzee: 0, chance: 0
  }
  assertTrue(isGameFinished(scorecard))
})

// ============================================================================
// EDGE CASES AND SPECIAL SCENARIOS
// ============================================================================

console.log('\n🔍 EDGE CASES TESTS\n')

test('Edge Case: All ones (Yahtzee of ones)', () => {
  const dice = [1, 1, 1, 1, 1]
  assertEquals(calculateScore(dice, 'ones'), 5)
  assertEquals(calculateScore(dice, 'threeOfKind'), 5)
  assertEquals(calculateScore(dice, 'fourOfKind'), 5)
  assertEquals(calculateScore(dice, 'fullHouse'), 25)
  assertEquals(calculateScore(dice, 'yahtzee'), 50)
  assertEquals(calculateScore(dice, 'chance'), 5)
  assertEquals(calculateScore(dice, 'smallStraight'), 0)
  assertEquals(calculateScore(dice, 'largeStraight'), 0)
})

test('Edge Case: All sixes (Yahtzee of sixes)', () => {
  const dice = [6, 6, 6, 6, 6]
  assertEquals(calculateScore(dice, 'sixes'), 30)
  assertEquals(calculateScore(dice, 'threeOfKind'), 30)
  assertEquals(calculateScore(dice, 'fourOfKind'), 30)
  assertEquals(calculateScore(dice, 'fullHouse'), 25)
  assertEquals(calculateScore(dice, 'yahtzee'), 50)
  assertEquals(calculateScore(dice, 'chance'), 30)
})

test('Edge Case: No matching patterns', () => {
  const dice = [1, 2, 4, 5, 6]
  assertEquals(calculateScore(dice, 'threeOfKind'), 0)
  assertEquals(calculateScore(dice, 'fourOfKind'), 0)
  assertEquals(calculateScore(dice, 'fullHouse'), 0)
  assertEquals(calculateScore(dice, 'smallStraight'), 0)
  assertEquals(calculateScore(dice, 'largeStraight'), 0)
  assertEquals(calculateScore(dice, 'yahtzee'), 0)
  assertEquals(calculateScore(dice, 'chance'), 18) // Only chance works
})

test('Edge Case: Multiple potential patterns', () => {
  // Dice can be interpreted in multiple ways
  const dice = [3, 3, 3, 3, 3]
  assertEquals(calculateScore(dice, 'threes'), 15)
  assertEquals(calculateScore(dice, 'threeOfKind'), 15)
  assertEquals(calculateScore(dice, 'fourOfKind'), 15)
  assertEquals(calculateScore(dice, 'fullHouse'), 25)
  assertEquals(calculateScore(dice, 'yahtzee'), 50)
  assertEquals(calculateScore(dice, 'chance'), 15)
})

test('Edge Case: Four of a kind with small values', () => {
  const dice = [1, 1, 1, 1, 2]
  assertEquals(calculateScore(dice, 'fourOfKind'), 6) // Sum is only 6
  assertEquals(calculateScore(dice, 'threeOfKind'), 6)
  assertEquals(calculateScore(dice, 'fullHouse'), 0) // Not a full house
})

test('Edge Case: Full house with low and high values', () => {
  const dice = [1, 1, 6, 6, 6]
  assertEquals(calculateScore(dice, 'fullHouse'), 25)
  assertEquals(calculateScore(dice, 'threeOfKind'), 20) // Sum: 1+1+6+6+6
  assertEquals(calculateScore(dice, 'chance'), 20)
})

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(50))
console.log('\n📈 TEST SUMMARY\n')
console.log(`Total tests run:    ${testsRun}`)
console.log(`Tests passed:       ${testsPassed} ✅`)
console.log(`Tests failed:       ${testsFailed} ❌`)
console.log(`Success rate:       ${((testsPassed / testsRun) * 100).toFixed(1)}%`)

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed! Scoring logic is correct.\n')
  process.exit(0)
} else {
  console.log('\n⚠️  Some tests failed. Please review the errors above.\n')
  process.exit(1)
}
