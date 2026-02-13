## Description

<!-- Provide a clear summary of what changed and why -->

## Type of Change

<!-- Mark relevant options with an "x" -->

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (change that can alter existing behavior)
- [ ] Documentation update
- [ ] UI/UX improvement
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] Test addition/update
- [ ] Configuration change

## Game Context (if applicable)

<!-- Which game(s) does this PR affect? -->

- [ ] Yahtzee
- [ ] Guess the Spy
- [ ] Tic-Tac-Toe
- [ ] Rock Paper Scissors
- [ ] Platform/Infrastructure
- [ ] All games
- [ ] N/A

## Related Issue

<!-- Reference issue numbers if available -->

- Fixes #
- Closes #
- Related to #

## Changes Made

<!-- List the main changes -->

- [ ] Change 1
- [ ] Change 2
- [ ] Change 3

## Screenshots / Videos (if applicable)

### Before

<!-- Screenshot/video of previous behavior -->

### After

<!-- Screenshot/video of new behavior -->

## Testing Checklist

### Code Quality

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Complex logic is documented
- [ ] No `console.log` statements left in production paths
- [ ] New code is in English (identifiers/comments)

### Functionality

- [ ] Changes work as expected locally
- [ ] No unintended regressions
- [ ] Error handling is implemented
- [ ] Edge cases are covered

### Build & Tests

- [ ] `npm run build` completes successfully
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] Manual testing completed
- [ ] Cross-browser testing completed (if UI changed)
- [ ] Mobile testing completed (if applicable)

### Game Testing (if applicable)

- [ ] Tested with minimum players
- [ ] Tested with maximum players
- [ ] Tested with bot opponents (if supported)
- [ ] Tested guest mode
- [ ] Tested authenticated mode
- [ ] Turn timer works correctly
- [ ] Chat works correctly
- [ ] Game state recovery/persistence verified

### Documentation

- [ ] Updated relevant documentation
- [ ] Updated comments/types where needed
- [ ] Added docs for public APIs when applicable

### Security

- [ ] No sensitive data is exposed
- [ ] Input validation added/updated
- [ ] Auth/authz checks verified
- [ ] No obvious XSS/SQL injection vectors introduced

## Deployment Notes

- [ ] Requires database migration
- [ ] Requires environment variables update
- [ ] Requires dependency installation
- [ ] Requires server restart
- [ ] No special deployment steps

### Environment Variables (if added)

```env
NEW_VARIABLE_NAME=description
```

### Database Changes (if applicable)

```bash
npx prisma migrate dev --name migration_name
```

## Performance Impact

- [ ] No performance impact
- [ ] Improves performance
- [ ] May impact performance (details below)

### Details

## Breaking Changes

- [ ] No breaking changes
- [ ] Breaking changes (describe below)

### Change Details

### Migration Guide

## Demo (optional)

- Demo URL:
- Video walkthrough:

## Reviewers

<!-- Tag reviewers if needed -->

@KovalDenys1

## Additional Notes

<!-- Anything reviewers should know -->

## Final Checklist

- [ ] I have read the [CONTRIBUTING](../docs/CONTRIBUTING.md) guidelines
- [ ] My code follows project standards
- [ ] I have self-reviewed my changes
- [ ] I tested changes thoroughly
- [ ] I updated relevant documentation
- [ ] My changes introduce no new warnings/errors
- [ ] I reviewed changes for security risks
