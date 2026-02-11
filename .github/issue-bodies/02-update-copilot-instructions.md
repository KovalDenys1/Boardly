## 📋 Issue Description

The `.github/copilot-instructions.md` file contains inaccurate information about project status, particularly regarding Row Level Security (RLS) implementation.

## 🎯 Goal

Ensure copilot-instructions.md accurately reflects the current state of the project to provide correct guidance to developers and AI assistants.

## ✅ Acceptance Criteria

- [ ] Update RLS status from "✅ Enabled" to "🔄 Prepared but not yet applied"
- [ ] Verify all "Current Status" sections are accurate as of February 2026
- [ ] Update any references to deprecated patterns (e.g., `user.isBot` → `!!user.bot`)
- [ ] Add note about plural table names migration (February 2026)
- [ ] Review and update "Critical Patterns" section if needed
- [ ] Ensure "File References" section points to correct locations

## 📝 Implementation Notes

**File**: `.github/copilot-instructions.md`

**Known Inaccuracies**:
1. RLS section claims "✅ Enabled on all 13 tables (Feb 2026)" - Should be "🔄 Migration prepared, pending testing"
2. Bot system references may need update to reflect separate Bots table
3. Database connection details should reflect connection pooler usage

**Sections to Review**:
- "2026: Production & Database Migration Complete" 
- "Critical Patterns > Database Schema"
- "Critical Patterns > Row Level Security"
- All status indicators (✅, 🔄, ❌)

## 🧪 Testing Requirements

- [ ] Review with project maintainer
- [ ] Cross-reference with actual code and database
- [ ] Verify examples still work with current codebase

## 📊 Estimated Complexity

**S (Small - 1-2 hours)**

## 🔗 Related Issues

- Related to #1 (RLS Migration Fix)
- Should be updated AFTER RLS is actually deployed

## 📚 Additional Context

Accurate documentation is critical for AI-assisted development and new contributors.

**Current Misleading Statement**:
> Row Level Security (RLS): Status: ✅ Enabled on all 13 tables (Feb 2026)

**Should be**:
> Row Level Security (RLS): Status: 🔄 Migration prepared, awaiting testing and deployment
