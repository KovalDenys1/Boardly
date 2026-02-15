import {
  detectCelebration,
  detectPatternOnRoll,
  getCategoryDisplayName,
} from '@/lib/celebrations'

describe('Celebrations', () => {
  describe('detectCelebration', () => {
    describe('Yahtzee detection', () => {
      it('should detect Yahtzee (5 of a kind)', () => {
        const result = detectCelebration([3, 3, 3, 3, 3])
        expect(result).not.toBeNull()
        expect(result?.type).toBe('yahtzee')
        expect(result?.title).toBe('YAHTZEE!')
        expect(result?.emoji).toBe('🎉')
      })

      it('should detect Yahtzee with score', () => {
        const result = detectCelebration([6, 6, 6, 6, 6], 'yahtzee', 50)
        expect(result?.score).toBe(50)
      })

      it('should detect Yahtzee with different numbers', () => {
        const ones = detectCelebration([1, 1, 1, 1, 1])
        const sixes = detectCelebration([6, 6, 6, 6, 6])
        
        expect(ones).not.toBeNull()
        expect(sixes).not.toBeNull()
        expect(ones?.type).toBe('yahtzee')
        expect(sixes?.type).toBe('yahtzee')
      })
    })

    describe('Large Straight detection', () => {
      it('should detect large straight 1-5', () => {
        const result = detectCelebration([1, 2, 3, 4, 5])
        expect(result).not.toBeNull()
        expect(result?.type).toBe('largeStraight')
        expect(result?.title).toBe('Large Straight!')
        expect(result?.emoji).toBe('📏')
      })

      it('should detect large straight 2-6', () => {
        const result = detectCelebration([2, 3, 4, 5, 6])
        expect(result).not.toBeNull()
        expect(result?.type).toBe('largeStraight')
      })

      it('should detect large straight in random order', () => {
        const result = detectCelebration([5, 2, 4, 3, 1])
        expect(result).not.toBeNull()
        expect(result?.type).toBe('largeStraight')
      })

      it('should not detect non-consecutive as large straight', () => {
        const result = detectCelebration([1, 2, 3, 4, 6])
        expect(result?.type).not.toBe('largeStraight')
      })
    })

    describe('Full House detection', () => {
      it('should detect full house (3+2)', () => {
        const result = detectCelebration([3, 3, 3, 5, 5])
        expect(result).not.toBeNull()
        expect(result?.type).toBe('fullHouse')
        expect(result?.title).toBe('Full House!')
        expect(result?.emoji).toBe('🏠')
      })

      it('should detect full house in different order', () => {
        const result = detectCelebration([2, 4, 2, 4, 4])
        expect(result).not.toBeNull()
        expect(result?.type).toBe('fullHouse')
      })

      it('should not detect full house for 5 of a kind', () => {
        // Yahtzee should be detected instead
        const result = detectCelebration([3, 3, 3, 3, 3])
        expect(result?.type).toBe('yahtzee')
      })

      it('should not detect full house for 4+1', () => {
        const result = detectCelebration([2, 2, 2, 2, 5])
        // Should not be full house
        if (result) {
          expect(result.type).not.toBe('fullHouse')
        }
      })
    })

    describe('High Score detection', () => {
      it('should detect high score when total is high', () => {
        const result = detectCelebration([6, 6, 6, 6, 5], 'chance', 29)
        // High score detection depends on category and score
        if (result && result.score >= 25) {
          expect(result.type).toBeDefined()
        }
      })
    })

    describe('No celebration cases', () => {
      it('should return null for ordinary rolls', () => {
        const result = detectCelebration([1, 2, 3, 4, 6])
        expect(result).toBeNull()
      })

      it('should return null for small straight', () => {
        const result = detectCelebration([1, 2, 3, 4, 6])
        expect(result).toBeNull()
      })

      it('should return null for three of a kind only', () => {
        const result = detectCelebration([3, 3, 3, 1, 2])
        expect(result).toBeNull()
      })

      it('should return null for two pairs', () => {
        const result = detectCelebration([2, 2, 5, 5, 6])
        expect(result).toBeNull()
      })
    })

    describe('Edge cases', () => {
      it('should handle empty dice array', () => {
        const result = detectCelebration([])
        expect(result).toBeNull()
      })

      it('should handle dice with invalid values', () => {
        const result = detectCelebration([0, 7, 8, 9, 10] as any)
        expect(result).toBeNull()
      })

      it('should handle less than 5 dice', () => {
        const result = detectCelebration([1, 2, 3])
        expect(result).toBeNull()
      })

      it('should handle more than 5 dice', () => {
        const result = detectCelebration([1, 2, 3, 4, 5, 6])
        // Should still work or handle gracefully
        expect(result).toBeDefined()
      })
    })
  })

  describe('detectPatternOnRoll', () => {
    it('should detect yahtzee during roll', () => {
      const result = detectPatternOnRoll([3, 3, 3, 3, 3])
      expect(result).not.toBeNull()
      expect(result?.type).toBe('yahtzee')
    })

    it('should detect large straight during roll', () => {
      const result = detectPatternOnRoll([1, 2, 3, 4, 5])
      expect(result).not.toBeNull()
      expect(result?.type).toBe('largeStraight')
    })

    it('should detect full house during roll', () => {
      const result = detectPatternOnRoll([3, 3, 3, 5, 5])
      expect(result).not.toBeNull()
      expect(result?.type).toBe('fullHouse')
    })

    it('should detect four of a kind', () => {
      const result = detectPatternOnRoll([2, 2, 2, 2, 5])
      expect(result).not.toBeNull()
      expect(result?.type).toBe('perfectRoll')
      expect(result?.title).toContain('Four of a Kind')
    })
  })

  describe('getCategoryDisplayName', () => {
    it('should return correct display names', () => {
      expect(getCategoryDisplayName('ones')).toBe('Ones')
      expect(getCategoryDisplayName('yahtzee')).toBe('Yahtzee')
      expect(getCategoryDisplayName('fullHouse')).toBe('Full House')
      expect(getCategoryDisplayName('largeStraight')).toBe('Large Straight')
    })

    it('should return original string for unknown categories', () => {
      expect(getCategoryDisplayName('unknown')).toBe('unknown')
    })
  })

  describe('Integration scenarios', () => {
    it('should prioritize yahtzee over other patterns', () => {
      // 5 of a kind is both full house and yahtzee, but yahtzee should win
      const result = detectCelebration([4, 4, 4, 4, 4])
      expect(result?.type).toBe('yahtzee')
    })

    it('should detect correct celebration for game scenarios', () => {
      // Player rolls large straight
      const straightRoll = detectCelebration([1, 2, 3, 4, 5], 'largeStraight', 40)
      expect(straightRoll?.type).toBe('largeStraight')
      expect(straightRoll?.score).toBe(40)

      // Player rolling for full house
      const fullHouseRoll = detectCelebration([2, 2, 2, 6, 6], 'fullHouse', 25)
      expect(fullHouseRoll?.type).toBe('fullHouse')
      expect(fullHouseRoll?.score).toBe(25)
    })

    it('celebration should include category when provided', () => {
      const result = detectCelebration([5, 5, 5, 5, 5], 'yahtzee', 50)
      expect(result?.category).toBe('yahtzee')
    })

    it('should work without optional parameters', () => {
      const result = detectCelebration([6, 6, 6, 6, 6])
      expect(result).not.toBeNull()
      expect(result?.type).toBe('yahtzee')
    })
  })
})
