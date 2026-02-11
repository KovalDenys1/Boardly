# Issue-Driven Development Workflow

## Overview

As of February 11, 2026, Boardly development follows an **Issue-First Workflow** where all tasks are tracked as GitHub Issues. This document explains how to work with Issues and how AI assistants (GitHub Copilot, Cursor, etc.) can help automate implementation.

## 📋 Issue Structure

All Issues follow a structured format with:

- **Title**: `[TYPE] Clear descriptive title`
  - Types: `[CRITICAL]`, `[HIGH]`, `[GAME]`, `[FEATURE]`, `[BUG]`, `[DOCS]`
- **Labels**: Organized by type, priority, area, and game
  - Type: `type:feature`, `type:bug`, `type:security`, etc.
  - Priority: `priority:critical`, `priority:high`, `priority:medium`, `priority:low`
  - Area: `area:monetization`, `area:security`, `area:social`, `area:infra`, `area:mobile`
  - Game: `game:yahtzee`, `game:spy`, `game:tic-tac-toe`, etc.
- **Body**: Detailed description with acceptance criteria, implementation notes, testing requirements

## 🔄 Development Workflow

### 1. Pick an Issue

**Browse Issues**:
```bash
# View all open issues
gh issue list --repo KovalDenys1/Boardly

# Filter by label
gh issue list --label "priority:high" --repo KovalDenys1/Boardly
gh issue list --label "type:game" --repo KovalDenys1/Boardly

# Or browse on GitHub
open https://github.com/KovalDenys1/Boardly/issues
```

**Assign yourself**:
```bash
gh issue edit <issue-number> --add-assignee @me --repo KovalDenys1/Boardly
```

### 2. Request Implementation Plan (AI-Assisted)

**Tell your AI assistant**:
> "Let's work on Issue #35"  
> "Plan implementation for #36"  
> "I want to implement the Tic-Tac-Toe game from Issue #35"

**AI will**:
1. Read the Issue via GitHub API
2. Research codebase (patterns, existing games)
3. Create detailed step-by-step plan
4. Ask clarifying questions if needed
5. Proceed with implementation when approved

### 3. Create Branch

```bash
# Branch naming: issue-<number>-short-description
git checkout -b issue-35-tic-tac-toe-game
```

### 4. Implement with AI Assistance

**Iterative development**:
- AI reads Issue requirements
- Implements code following project patterns
- Writes tests (target 80%+ coverage)
- Updates documentation
- Adds translations (EN/UK)

**Progress updates**:
```bash
# Add comment to Issue
gh issue comment <issue-number> --body "Implemented game logic and tests. Working on UI components." --repo KovalDenys1/Boardly
```

### 5. Commit with Issue Reference

```bash
# Use conventional commits + issue reference
git commit -m "feat(games): implement Tic-Tac-Toe game logic (#35)

- Add TicTacToeGame class extending GameEngine
- Implement move validation and win detection
- Add unit tests with 85% coverage
- Create game state management

Refs #35"
```

**Commit message pattern**:
- Format: `<type>(<scope>): <description> (#issue-number)`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Always reference the Issue number

### 6. Create Pull Request

```bash
gh pr create --title "feat: Implement Tic-Tac-Toe Game (#35)" \
  --body "Closes #35

## Summary
Implements Tic-Tac-Toe game with full multiplayer support.

## Changes
- ✅ TicTacToeGame class with GameEngine pattern
- ✅ Win condition detection (rows, columns, diagonals)
- ✅ Lobby and game board UI
- ✅ Unit tests (85% coverage)
- ✅ Translations (EN/UK)

## Testing
- [x] Unit tests passing
- [x] Manual testing with 2 players
- [x] Mobile responsive UI verified

## Checklist
- [x] Code follows project patterns
- [x] Tests written and passing
- [x] Documentation updated
- [x] Translations added
- [x] No console errors or warnings" \
  --repo KovalDenys1/Boardly
```

**PR closes Issue**: Use `Closes #<number>` in PR description to auto-close Issue when PR is merged.

### 7. Review & Merge

- CI/CD runs (tests, linting)
- Code review (manual or AI-assisted)
- Merge to `develop` or `main`
- Issue auto-closes when PR merges

## 🤖 AI Assistant Integration

### How to Work with Issues in AI Chat

**Start a task**:
```markdown
Let's work on Issue #35
```

**AI will automatically**:
1. Fetch Issue details from GitHub API
2. Read acceptance criteria
3. Research codebase for patterns
4. Create implementation plan
5. Ask for approval
6. Implement step-by-step
7. Run tests
8. Create PR draft

### Example AI Conversation

**You**: "Plan implementation for Issue #36"

**AI**: 
1. Reads Issue #36 (Rock Paper Scissors game)
2. Analyzes requirements
3. Responds with:

> **Implementation Plan for Issue #36: Rock Paper Scissors**
> 
> 1. Create `RockPaperScissorsGame` class extending `GameEngine`
> 2. Implement simultaneous move submission (hidden choices)
> 3. Add reveal logic with winner calculation
> 4. Create lobby page with best-of-3/5 selection
> 5. Build UI with emoji buttons (🪨📄✂️)
> 6. Add reveal animation
> 7. Write tests (all move combinations)
> 8. Add translations
> 
> This will take ~1-2 days. Proceed with implementation?

**You**: "Yes, start with the game logic class"

**AI**: *(Creates `lib/games/rps-game.ts` with full implementation)*

### AI Commands for Issue Management

**View Issue**:
```markdown
Show me Issue #33
What's the status of #35?
```

**List Issues**:
```markdown
Show all high priority issues
List game implementation issues
```

**Update Issue**:
```markdown
Add comment to Issue #35: "UI implementation in progress"
Close Issue #34 as completed
```

**Create Issue** (if needed):
```markdown
Create Issue for adding dark mode to game boards
```

## 📊 GitHub Projects Integration

**Projects**: Issues are organized in GitHub Projects board

**Views**:
- **Kanban**: Backlog → In Progress → Review → Testing → Done
- **Priority**: Grouped by priority labels
- **Timeline**: Milestones and sprints

**Automation**:
- Issue created → Moves to Backlog
- PR opened → Moves to Review
- PR merged → Moves to Done
- Auto-close Issue when PR merges

**Access Projects**:
```bash
open https://github.com/KovalDenys1/Boardly/projects
```

## 🏷️ Label System

### Type Labels
- `type:feature` - New feature implementation
- `type:bug` - Bug fix
- `type:security` - Security-related issue
- `type:refactor` - Code refactoring
- `type:documentation` - Documentation improvements
- `type:game` - New game implementation

### Priority Labels
- `priority:critical` - Needs immediate attention (security, data loss)
- `priority:high` - Important, should be done soon
- `priority:medium` - Normal priority
- `priority:low` - Nice to have, can wait

### Area Labels
- `area:monetization` - Payments, subscriptions, premium features
- `area:security` - Authentication, authorization, RLS
- `area:social` - Friends, chat, notifications
- `area:infra` - Infrastructure, CI/CD, monitoring
- `area:mobile` - Mobile UI, PWA, responsive design

### Game Labels
- `game:yahtzee`, `game:spy`, `game:tic-tac-toe`, `game:rps`, `game:memory`

## 📝 Issue Templates

**Available templates** (`.github/ISSUE_TEMPLATE/`):
- `bug_report.md` - Bug reports
- `feature_request.md` - Feature requests
- `game_request.md` - New game ideas
- `task.md` - Development tasks

**Create from template**:
```bash
gh issue create --template task.md --repo KovalDenys1/Boardly
```

## 🔍 Finding Work

### For Beginners
```bash
gh issue list --label "good first issue" --repo KovalDenys1/Boardly
```

### By Priority
```bash
# Critical issues (security, blockers)
gh issue list --label "priority:critical" --repo KovalDenys1/Boardly

# High priority (next sprint)
gh issue list --label "priority:high" --repo KovalDenys1/Boardly
```

### By Area of Interest
```bash
# Game development
gh issue list --label "type:game" --repo KovalDenys1/Boardly

# Infrastructure
gh issue list --label "area:infra" --repo KovalDenys1/Boardly

# Social features
gh issue list --label "area:social" --repo KovalDenys1/Boardly
```

## 📈 Tracking Progress

### View Sprint Progress
```bash
# Issues in milestone
gh issue list --milestone "Q1 2026" --repo KovalDenys1/Boardly

# Recently closed
gh issue list --state closed --limit 10 --repo KovalDenys1/Boardly
```

### Weekly Sprint Planning

**Monday**: Review open Issues, assign for the week
```bash
gh issue list --label "priority:high" --state open
```

**Friday**: Review completed Issues, close PRs
```bash
gh issue list --assignee @me --state all
```

## 🚀 Quick Reference

### Create Issue
```bash
gh issue create --title "[FEATURE] Add dark mode" --body "Description..." --label "type:feature,priority:medium"
```

### Comment on Issue
```bash
gh issue comment 35 --body "Working on this now"
```

### Close Issue
```bash
gh issue close 35 --comment "Completed in PR #123"
```

### Reopen Issue
```bash
gh issue reopen 35 --comment "Need to address review feedback"
```

### View Issue Details
```bash
gh issue view 35
```

## 📚 Resources

- **GitHub Issues**: https://github.com/KovalDenys1/Boardly/issues
- **GitHub Projects**: https://github.com/KovalDenys1/Boardly/projects
- **Label List**: `gh label list --repo KovalDenys1/Boardly`
- **Milestones**: https://github.com/KovalDenys1/Boardly/milestones

---

**Last Updated**: February 11, 2026  
**Workflow Version**: 1.0
