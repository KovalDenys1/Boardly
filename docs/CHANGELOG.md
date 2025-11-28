# Changelog - November 28, 2025

## 🎯 Major Updates

### Production Deployment & README
- ✅ Updated README with live production URL: [boardly.online](https://boardly.online)
- ✅ Added production screenshot to README
- ✅ Documented full tech stack (Vercel + Render + Supabase + Resend + Sentry)
- ✅ Added OAuth providers info (Google & GitHub)

### Game Improvements
- ✅ Fixed bot dice sound duplication (only play when dice data present)
- ✅ Fixed timer React lifecycle errors (separate useEffect for timeout)
- ✅ Implemented smart auto-scoring when timer expires
- ✅ Auto-roll dice if timer expires without player rolling (rollsLeft === 3)
- ✅ Fixed UI showing "Wait for your turn" when it IS player's turn
- ✅ Fixed Play Again button after game ends (creates new waiting game)

### UX Enhancements
- ✅ Reduced toast notifications from 3 to 1 when game starts
- ✅ Fixed host seeing duplicate toast on game start
- ✅ Non-host players now see proper toast with first player name
- ✅ Category selection on filled categories silently ignored (no error toast)
- ✅ "Next turn" toast only shown to non-active players

### Code Optimization
- ✅ Optimized selectBestAvailableCategory function (-42% lines, O(n log n) → O(n))
- ✅ Removed duplicate constants (ALL_CATEGORIES, WASTE_PRIORITY)
- ✅ Simplified category selection logic
- ✅ Added validation for filled categories before scoring

### Bug Fixes
- ✅ Fixed 400 error when timer expires without dice rolls
- ✅ Fixed DiceGroup disabled state at turn start
- ✅ Fixed "Play Again" 500 error (missing position field)
- ✅ Fixed timer callback with refs to prevent circular dependencies
- ✅ Fixed celebration showing for already-filled categories

### Project Cleanup & Internationalization
- ✅ Removed old/temporary files:
  - README.old.md
  - SCREENSHOT_UPLOAD_GUIDE.md
  - SENTRY_FIX.md
  - SENTRY_STATUS.md
  - SETUP_COMPLETE.md
  - build.log
  - dev-server.log
- ✅ Removed Russian language documentation:
  - SEO_GUIDE.md
  - POLISH_CHECKLIST.md
  - QUICKSTART.md
  - DEV_SETUP.md
- ✅ Translated all Russian comments to English (docs/YAHTZEE_QA_CHECKLIST.md)
- ✅ Verified all code and comments are English-only
- ✅ Removed empty scripts/ directory
- ✅ Added .gitattributes for proper GitHub language stats
- ✅ Organized documentation into docs/ folder

### Documentation Structure
- ✅ Moved CHANGELOG.md to docs/
- ✅ Moved CONTRIBUTING.md to docs/
- ✅ Root folder contains only README.md and LICENSE (standard practice)
- ✅ All development documentation centralized in docs/ folder

## 📊 Stats
- **Files Modified**: 15
- **Files Deleted**: 11
- **Files Moved**: 2
- **New Features**: 5
- **Bugs Fixed**: 8
- **Code Optimizations**: 3

## 🚀 Production Ready
Project is fully deployed and live at **[boardly.online](https://boardly.online)**

All code, comments, and documentation are now in English for international collaboration.

## 🔄 Next Steps
- Consider adding more game screenshots to README
- Add player statistics tracking
- Implement Chess game (in progress)
- Add more casual multiplayer games
