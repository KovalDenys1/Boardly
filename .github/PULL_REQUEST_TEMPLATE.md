## 📝 Description
<!-- Provide a detailed description of your changes -->

## 🎯 Type of Change
<!-- Mark the relevant option with an 'x' -->
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📝 Documentation update
- [ ] 🎨 UI/UX improvement
- [ ] ⚡ Performance improvement
- [ ] ♻️ Code refactoring
- [ ] 🧪 Test addition/update
- [ ] 🔧 Configuration change

## 🎮 Game Context (if applicable)
<!-- Which game does this PR affect? -->
- [ ] Yahtzee
- [ ] Chess
- [ ] Guess the Spy
- [ ] Platform/Infrastructure
- [ ] All games
- [ ] N/A

## 🔗 Related Issue
<!-- Link the related issue(s) -->
Fixes #(issue number)
Closes #(issue number)
Related to #(issue number)

## 📋 Changes Made
<!-- List the main changes in bullet points -->
- 
- 
- 

## 🖼️ Screenshots/Videos (if applicable)
<!-- Add screenshots or videos demonstrating the changes -->

**Before:**
<!-- Screenshot of old behavior -->

**After:**
<!-- Screenshot of new behavior -->

## ✅ Testing Checklist
<!-- Mark completed items with an 'x' -->

### Code Quality
- [ ] Code follows the project's style guidelines
- [ ] Self-review of code completed
- [ ] Code is commented, particularly in complex areas
- [ ] No console.log statements left in code (use clientLogger/apiLogger)
- [ ] All new code is in English (comments, variables, functions)

### Functionality
- [ ] Changes work as expected locally
- [ ] No breaking changes to existing features
- [ ] Error handling is implemented
- [ ] Edge cases are handled

### Build & Tests
- [ ] `npm run build` completes successfully
- [ ] `npm run lint` passes without errors
- [ ] TypeScript compilation (`npx tsc --noEmit`) passes
- [ ] Manual testing completed
- [ ] Tested with different browsers (if UI change)
- [ ] Tested on mobile (if applicable)

### Game Testing (if applicable)
- [ ] Tested with 2 players
- [ ] Tested with maximum players
- [ ] Tested with bot opponents
- [ ] Tested guest mode
- [ ] Tested authenticated mode
- [ ] Turn timer works correctly
- [ ] Chat functionality works
- [ ] Game state persists correctly

### Documentation
- [ ] Updated relevant documentation (README, CONTRIBUTING, etc.)
- [ ] Added/updated code comments
- [ ] Updated TypeScript types if needed
- [ ] Added JSDoc comments for public APIs

### Security
- [ ] No sensitive data exposed
- [ ] Input validation implemented
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] Authentication/authorization checked

## 🚀 Deployment Notes
<!-- Any special considerations for deployment? -->
- [ ] Requires database migration
- [ ] Requires environment variables update
- [ ] Requires dependency installation
- [ ] Requires server restart
- [ ] No special deployment steps

### Environment Variables (if new ones added)
```env
NEW_VARIABLE_NAME=description
```

### Database Changes (if applicable)
```bash
npx prisma migrate dev --name migration_name
```

## ⚡ Performance Impact
<!-- Does this PR affect performance? -->
- [ ] No performance impact
- [ ] Improves performance
- [ ] May impact performance (explain below)

**Details:**


## 🔄 Breaking Changes
<!-- List any breaking changes and migration steps -->
- [ ] No breaking changes
- [ ] Breaking changes (list below)

**Breaking Changes:**


**Migration Guide:**


## 📸 Demo
<!-- If possible, provide a live demo or video -->
- Demo URL: 
- Video walkthrough: 

## 👥 Reviewers
<!-- Tag specific reviewers if needed -->
@KovalDenys1

## 📝 Additional Notes
<!-- Any additional information for reviewers -->


## ✅ Final Checklist
<!-- Before submitting, ensure all items are checked -->
- [ ] I have read the [CONTRIBUTING](../docs/CONTRIBUTING.md) guidelines
- [ ] My code follows the project's coding standards
- [ ] I have performed a self-review of my own code
- [ ] I have tested my changes thoroughly
- [ ] I have updated the documentation accordingly
- [ ] My changes generate no new warnings or errors
- [ ] I have checked my code for security vulnerabilities

---

<!-- 
Thank you for contributing to Boardly! 🎮
Your efforts help make multiplayer board games accessible and fun for everyone.
-->
