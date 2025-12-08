# OAuth Account Linking - Implementation Guide

## Overview

Boardly supports linking multiple OAuth providers (Google, GitHub, Discord) to a single user account. The system handles three main scenarios with different behaviors for security.

## Scenarios

### ✅ Scenario 1: Same Email - Auto Linking (SAFE)

**Example:**
- User registers with `email@example.com` using email/password
- User clicks "Connect Google" 
- Google account also has `email@example.com`
- **Result**: Google account automatically linked

**Why it's safe:**
- OAuth provider (Google) verified the user owns this email
- Email match proves it's the same person
- No risk of account hijacking

**Flow:**
```
1. User clicks "Connect Google" in profile
2. OAuth flow starts
3. Google returns verified email: email@example.com
4. signIn callback checks: Does user exist with this email? YES
5. Creates Account record linking Google to existing user
6. User can now sign in with either credentials OR Google ✅
```

### ❌ Scenario 2: Different Emails - Blocked (SECURE)

**Example:**
- User A logged in with Discord: `discord@example.com`
- User tries to link Google: `google@example.com` (different email)
- Google account already registered as separate user
- **Result**: Error page with clear options

**Why it's blocked:**
- These are potentially two different people
- Auto-merge could allow account takeover
- User must explicitly choose what to do

**Flow:**
```
1. User A clicks "Connect Google" in profile
2. OAuth flow starts
3. Google returns: google@example.com
4. signIn callback finds existing user B with google@example.com
5. But current session is User A (discord@example.com)
6. NextAuth error: OAuthAccountNotLinked
7. Redirect to /auth/error-oauth with clear message
8. User sees options:
   ✓ Sign in with Google instead (switch accounts)
   ✓ Return to current profile
   ✓ Contact support for manual merge
```

**Error Page Options:**

1. **"Use Google"** - Signs out of Discord account, signs in with Google
2. **"Go Back"** - Returns to profile, stays on Discord account
3. **"Contact Support"** - For manual account merge (future feature)

### ✅ Scenario 3: New OAuth User - Auto Create

**Example:**
- New user signs in with GitHub
- Email `newuser@github.com` not in system
- **Result**: New user account created automatically

**Flow:**
```
1. User clicks "Sign in with GitHub" on login page
2. GitHub OAuth completes
3. signIn callback: No existing account or user found
4. PrismaAdapter creates new User + Account
5. linkAccount event fires → email auto-verified
6. User signed in ✅
```

## Technical Implementation

### Key Files

```
lib/next-auth.ts                      - NextAuth configuration & callbacks
app/profile/page.tsx                  - Connected accounts UI
app/auth/link/page.tsx                - OAuth linking flow page
app/auth/error-oauth/page.tsx         - Error handling page
app/api/user/linked-accounts/route.ts - View/unlink OAuth accounts
app/api/user/merge-accounts/route.ts  - Manual account merge (admin)
```

### signIn Callback Logic

```typescript
async signIn({ user, account, profile }) {
  if (account?.provider !== 'credentials') {
    // 1. Check if this OAuth account already exists
    const existingAccount = await findAccount(provider, providerAccountId)
    if (existingAccount) {
      // Already linked - allow sign in
      return true
    }

    // 2. Check if user exists with same email
    const existingUser = await findUserByEmail(user.email)
    if (existingUser) {
      // SAME EMAIL - Auto link (safe!)
      await createAccount(existingUser.id, account)
      return true
    }

    // 3. New user - PrismaAdapter will create
    return true
  }
  return true
}
```

### linkAccount Event

```typescript
async linkAccount({ user, account }) {
  // Auto-verify email when OAuth account linked
  await prisma.user.update({
    where: { id: user.id },
    data: { 
      emailVerified: new Date(),
      username: deriveUsername(user)
    }
  })
  
  log.info('Account linked and email verified', {
    userId: user.id,
    provider: account.provider
  })
}
```

## API Endpoints

### GET /api/user/linked-accounts

Returns all OAuth providers linked to current user.

**Response:**
```json
{
  "linkedAccounts": {
    "google": {
      "provider": "google",
      "providerAccountId": "123456789",
      "id": "account_id"
    },
    "github": null,
    "discord": null
  }
}
```

### DELETE /api/user/linked-accounts?provider=google

Unlinks OAuth provider from current user.

**Safety check:** Cannot unlink last authentication method (must have password OR at least one OAuth)

### POST /api/user/merge-accounts

Manually merge two user accounts (for admin/support use).

**Request:**
```json
{
  "provider": "google",
  "providerAccountId": "123456789",
  "confirmed": true
}
```

**What it does:**
1. Moves all OAuth accounts from source user to target
2. Moves all game players/history
3. Moves lobby ownership
4. Merges statistics
5. Deletes source user

**Security:** Only accessible by authenticated users, requires explicit confirmation.

## UI Components

### Profile Page - Connected Accounts Section

```tsx
// Shows status for each provider
{linkedAccounts.google ? (
  <button onClick={() => unlink('google')}>Unlink</button>
) : (
  <button onClick={() => router.push('/auth/link?provider=google')}>
    Connect
  </button>
)}
```

**Features:**
- ✅ Shows "✓ Connected" for linked accounts
- Color-coded buttons (Google=blue, GitHub=black, Discord=purple)
- Hover effects for better UX
- Success toast on successful linking

### Linking Page (/auth/link)

- Shows provider icon and name
- Loading animation during OAuth
- Handles merge confirmation if needed
- Clean error handling

### Error Page (/auth/error-oauth)

- Clear explanation of why linking failed
- Three actionable options
- Provider-specific messaging
- No confusing technical jargon

## Security Considerations

### ✅ Safe Practices

1. **Email verification by OAuth provider** - We trust Google/GitHub/Discord verified the email
2. **Same-email auto-linking** - Only when emails match exactly
3. **Explicit confirmation for merges** - Never automatic for different emails
4. **Cannot unlink last auth method** - User must always have a way to log in
5. **Audit logging** - All linking/unlinking logged

### ❌ Unsafe (NOT Implemented)

1. **`allowDangerousEmailAccountLinking: true`** - Removed for security
2. **Auto-merge different emails** - Could enable account takeover
3. **No confirmation for merges** - Too risky

## Testing

### Test Same Email Linking

```bash
1. Register with email@example.com (credentials)
2. Click "Connect Google" in profile
3. Sign in to Google with same email@example.com
4. Should auto-link ✅
5. Check profile - both credentials and Google shown
```

### Test Different Email Blocking

```bash
1. Sign in with Discord (email1@example.com)
2. Click "Connect Google" in profile
3. Sign in to Google with email2@example.com (different!)
4. Should show error page ❌
5. Verify options shown clearly
```

### Test New User Creation

```bash
1. Go to /auth/login
2. Click "Sign in with GitHub"
3. Complete OAuth with new email
4. Should create new user ✅
5. Check database - user + account + emailVerified set
```

## Troubleshooting

### User sees "OAuthAccountNotLinked" error

**Cause:** OAuth email belongs to different user account

**Solution:** User must choose:
- Switch to the OAuth account
- Stay on current account
- Contact support for manual merge

### "Cannot unlink account" error

**Cause:** Trying to unlink last authentication method

**Solution:** User must either:
- Add another OAuth provider first
- Set a password first
- Keep at least one way to log in

### Auto-verification not working

**Check:**
1. `linkAccount` event in `lib/next-auth.ts`
2. Logs for "Account linked and email verified"
3. Database: `emailVerified` column should have timestamp

## Future Enhancements

1. **Self-service account merge** - Let users merge accounts themselves with email verification
2. **Admin panel** - Support team can merge accounts manually
3. **Merge preview** - Show what will be merged before confirming
4. **Email change** - Allow updating primary email
5. **Primary provider** - Mark which OAuth is "main" account

## Summary

**Current Implementation:**
- ✅ Same email → Auto link (safe)
- ❌ Different email → Block with clear error
- ✅ New OAuth → Auto create user
- ✅ All OAuth users auto-verified
- ✅ Manual merge available (admin only)

**Security:** Prioritizes safety over convenience. Better to show error page than accidentally merge wrong accounts.
