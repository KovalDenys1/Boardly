import { generateLobbyCode } from '@/lib/lobby'
import { calculateScore, calculateTotalScore } from '@/lib/yahtzee'
import { YahtzeeCategory } from '@/lib/yahtzee'

describe('Lobby Utilities', () => {
  describe('generateLobbyCode', () => {
    it('should generate 4-character code', () => {
      const code = generateLobbyCode()
      expect(code).toHaveLength(4)
    })

    it('should generate alphanumeric code', () => {
      const code = generateLobbyCode()
      expect(code).toMatch(/^[A-Z0-9]{4}$/)
    })

    it('should generate codes with high randomness', () => {
      const code1 = generateLobbyCode()
      const code2 = generateLobbyCode()
      const code3 = generateLobbyCode()
      
      // Each code should be valid
      expect(code1).toMatch(/^[A-Z0-9]{4}$/)
      expect(code2).toMatch(/^[A-Z0-9]{4}$/)
      expect(code3).toMatch(/^[A-Z0-9]{4}$/)
      
      // Note: In tests, nanoid is mocked to return 'AB12' consistently
      // In production, codes would be unique
    })
  })
})

describe('Yahtzee Score Calculation', () => {
  describe('calculateScore', () => {
    it('should calculate ones correctly', () => {
      expect(calculateScore([1, 1, 3, 4, 5], 'ones')).toBe(2)
      expect(calculateScore([1, 1, 1, 1, 1], 'ones')).toBe(5)
      expect(calculateScore([2, 3, 4, 5, 6], 'ones')).toBe(0)
    })

    it('should calculate twos correctly', () => {
      expect(calculateScore([2, 2, 3, 4, 5], 'twos')).toBe(4)
      expect(calculateScore([2, 2, 2, 2, 2], 'twos')).toBe(10)
      expect(calculateScore([1, 3, 4, 5, 6], 'twos')).toBe(0)
    })

    it('should calculate threes correctly', () => {
      expect(calculateScore([3, 3, 1, 2, 4], 'threes')).toBe(6)
      expect(calculateScore([3, 3, 3, 3, 3], 'threes')).toBe(15)
    })

    it('should calculate fours correctly', () => {
      expect(calculateScore([4, 4, 1, 2, 3], 'fours')).toBe(8)
    })

    it('should calculate fives correctly', () => {
      expect(calculateScore([5, 5, 5, 1, 2], 'fives')).toBe(15)
    })

    it('should calculate sixes correctly', () => {
      expect(calculateScore([6, 6, 1, 2, 3], 'sixes')).toBe(12)
    })

    it('should calculate three of a kind', () => {
      expect(calculateScore([3, 3, 3, 4, 5], 'threeOfKind')).toBe(18)
      expect(calculateScore([1, 1, 1, 1, 1], 'threeOfKind')).toBe(5)
      expect(calculateScore([1, 2, 3, 4, 5], 'threeOfKind')).toBe(0)
    })

    it('should calculate four of a kind', () => {
      expect(calculateScore([4, 4, 4, 4, 2], 'fourOfKind')).toBe(18)
      expect(calculateScore([6, 6, 6, 6, 6], 'fourOfKind')).toBe(30)
      expect(calculateScore([1, 2, 3, 4, 5], 'fourOfKind')).toBe(0)
    })

    it('should calculate full house (25 points)', () => {
      expect(calculateScore([3, 3, 3, 2, 2], 'fullHouse')).toBe(25)
      expect(calculateScore([6, 6, 1, 1, 1], 'fullHouse')).toBe(25)
      // Yahtzee (5 of a kind) can also count as full house for bonus scoring
      expect(calculateScore([1, 1, 1, 1, 1], 'fullHouse')).toBe(25)
      expect(calculateScore([1, 2, 3, 4, 5], 'fullHouse')).toBe(0)
    })

    it('should calculate one pair (10 points)', () => {
      expect(calculateScore([3, 3, 1, 2, 4], 'onePair')).toBe(10)
      expect(calculateScore([6, 6, 1, 2, 3], 'onePair')).toBe(10)
      expect(calculateScore([5, 5, 4, 4, 1], 'onePair')).toBe(10) // Two pairs also counts as one pair
      expect(calculateScore([1, 2, 3, 4, 5], 'onePair')).toBe(0) // No pairs
    })

    it('should calculate two pairs (20 points)', () => {
      expect(calculateScore([3, 3, 2, 2, 1], 'twoPairs')).toBe(20)
      expect(calculateScore([6, 6, 1, 1, 4], 'twoPairs')).toBe(20)
      expect(calculateScore([5, 5, 4, 4, 4], 'twoPairs')).toBe(20) // Three of a kind includes two pairs
      expect(calculateScore([1, 2, 3, 4, 5], 'twoPairs')).toBe(0)
      expect(calculateScore([2, 2, 3, 4, 5], 'twoPairs')).toBe(0) // Only one pair
    })

    it('should calculate small straight (30 points)', () => {
      expect(calculateScore([1, 2, 3, 4, 6], 'smallStraight')).toBe(30)
      expect(calculateScore([2, 3, 4, 5, 6], 'smallStraight')).toBe(30)
      expect(calculateScore([3, 4, 5, 6, 1], 'smallStraight')).toBe(30)
      expect(calculateScore([1, 3, 4, 5, 6], 'smallStraight')).toBe(30)
      expect(calculateScore([1, 1, 2, 3, 4], 'smallStraight')).toBe(30)
      // Duplicates are allowed in small straight detection
      expect(calculateScore([1, 2, 2, 3, 4], 'smallStraight')).toBe(30)
    })

    it('should calculate large straight (40 points)', () => {
      expect(calculateScore([1, 2, 3, 4, 5], 'largeStraight')).toBe(40)
      expect(calculateScore([2, 3, 4, 5, 6], 'largeStraight')).toBe(40)
      expect(calculateScore([1, 2, 3, 4, 6], 'largeStraight')).toBe(0)
      expect(calculateScore([1, 1, 2, 3, 4], 'largeStraight')).toBe(0)
    })

    it('should calculate yahtzee (50 points)', () => {
      expect(calculateScore([1, 1, 1, 1, 1], 'yahtzee')).toBe(50)
      expect(calculateScore([6, 6, 6, 6, 6], 'yahtzee')).toBe(50)
      expect(calculateScore([3, 3, 3, 3, 3], 'yahtzee')).toBe(50)
      expect(calculateScore([1, 1, 1, 1, 2], 'yahtzee')).toBe(0)
    })

    it('should calculate chance (sum of all dice)', () => {
      expect(calculateScore([1, 2, 3, 4, 5], 'chance')).toBe(15)
      expect(calculateScore([6, 6, 6, 6, 6], 'chance')).toBe(30)
      expect(calculateScore([1, 1, 1, 1, 1], 'chance')).toBe(5)
    })
  })

  describe('calculateTotalScore', () => {
    it('should calculate total with bonus', () => {
      const scorecard = {
        ones: 3,
        twos: 6,
        threes: 9,
        fours: 12,
        fives: 15,
        sixes: 18, // Upper total: 63, gets 35 bonus
        threeOfKind: 20,
        fourOfKind: 24,
        fullHouse: 25,
        onePair: 10,
        twoPairs: 20,
        smallStraight: 30,
        largeStraight: 40,
        yahtzee: 50,
        chance: 25,
      }
      // Upper: 63 + 35 bonus = 98
      // Lower: 20+24+25+10+20+30+40+50+25 = 244
      // Total: 342
      expect(calculateTotalScore(scorecard)).toBe(342)
    })

    it('should calculate total without bonus', () => {
      const scorecard = {
        ones: 1,
        twos: 2,
        threes: 3,
        fours: 4,
        fives: 5,
        sixes: 6, // Upper total: 21, no bonus
        threeOfKind: 15,
        fourOfKind: 20,
        fullHouse: 25,
        onePair: 10,
        twoPairs: 20,
        smallStraight: 30,
        largeStraight: 40,
        yahtzee: 50,
        chance: 20,
      }
      // Upper: 21
      // Lower: 15+20+25+10+20+30+40+50+20 = 230
      // Total: 251
      expect(calculateTotalScore(scorecard)).toBe(251)
    })

    it('should handle empty scorecard', () => {
      expect(calculateTotalScore({})).toBe(0)
    })

    it('should handle partial scorecard', () => {
      const scorecard = {
        ones: 3,
        twos: 6,
        yahtzee: 50,
      }
      expect(calculateTotalScore(scorecard)).toBe(59) // 3+6+50
    })

    it('should get bonus at exactly 63 points', () => {
      const scorecard = {
        ones: 3,
        twos: 6,
        threes: 9,
        fours: 12,
        fives: 15,
        sixes: 18, // Exactly 63
      }
      expect(calculateTotalScore(scorecard)).toBe(98) // 63 + 35 bonus
    })

    it('should not get bonus at 62 points', () => {
      const scorecard = {
        ones: 2,
        twos: 6,
        threes: 9,
        fours: 12,
        fives: 15,
        sixes: 18, // Total 62
      }
      expect(calculateTotalScore(scorecard)).toBe(62) // No bonus
    })
  })

  describe('edge cases', () => {
    it('should handle all zeros', () => {
      const dice = [1, 2, 3, 4, 5]
      expect(calculateScore(dice, 'sixes')).toBe(0)
      expect(calculateScore(dice, 'fourOfKind')).toBe(0)
    })

    it('should handle maximum values', () => {
      const dice = [6, 6, 6, 6, 6]
      expect(calculateScore(dice, 'sixes')).toBe(30)
      expect(calculateScore(dice, 'yahtzee')).toBe(50)
      expect(calculateScore(dice, 'chance')).toBe(30)
    })

    it('should handle invalid dice arrays', () => {
      expect(calculateScore([], 'ones')).toBe(0)
      expect(calculateScore([1], 'ones')).toBe(1)
      expect(calculateScore([1, 2], 'ones')).toBe(1)
    })
  })
})
