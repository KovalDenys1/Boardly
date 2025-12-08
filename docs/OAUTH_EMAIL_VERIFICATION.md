# OAuth Email Verification

## Overview
Users who register via OAuth providers (Google, GitHub, Discord) have their email automatically verified upon sign-in. This is because OAuth providers already verify email addresses as part of their authentication process.

## How It Works

### For New OAuth Users
When a user signs up via OAuth for the first time:

1. **NextAuth Callback** (`lib/next-auth.ts`):
   ```typescript
   if (!existingUser) {
     const newUser = await prisma.user.create({
       data: {
         email: user.email!,
         username: user.email!.split('@')[0],
         emailVerified: new Date(), // ✅ Auto-verified
       },
     })
   }
   ```

2. **Session Creation**:
   - `emailVerified` is set to current timestamp
   - User immediately has verified status
   - No verification email is sent

### For Existing Users (OAuth Sign-in)
When a user who already has an account signs in via OAuth:

1. **Check Verification Status**:
   ```typescript
   if (existingUser && !existingUser.emailVerified) {
     await prisma.user.update({
       where: { id: existingUser.id },
       data: { emailVerified: new Date() }
     })
   }
   ```

2. **Auto-Verify**:
   - If email is not verified, it's automatically verified
   - This handles users who:
     - Created account via email/password but never verified
     - Later sign in with OAuth
     - Should now be considered verified

### Session Management
`emailVerified` is included in JWT token and session:

```typescript
// JWT Token
async jwt({ token, user, trigger }) {
  if (user) {
    token.emailVerified = user.emailVerified
  }
  
  // Refresh on update trigger
  if (trigger === 'update') {
    const dbUser = await prisma.user.findUnique({
      where: { email: token.email },
      select: { emailVerified: true }
    })
    if (dbUser) {
      token.emailVerified = dbUser.emailVerified
    }
  }
}

// Session
async session({ session, token }) {
  session.user.emailVerified = token.emailVerified
}
```

## UI Behavior

### Profile Page
The verification banner is shown based on `session.user.emailVerified`:

```tsx
{session?.user?.email && !session?.user?.emailVerified && (
  <div className="verification-banner">
    ⚠️ Email Not Verified
    <button onClick={handleResendVerification}>
      Resend Verification Email
    </button>
  </div>
)}
```

**For OAuth Users**:
- ✅ Banner is **hidden** (emailVerified is set)
- ✅ Email shows "✓ Verified" badge
- ✅ No warning about 7-day deletion

**For Email/Password Users (not verified)**:
- ⚠️ Banner is **shown**
- ⚠️ "Resend Verification Email" button available
- ⚠️ Warning about auto-deletion after 7 days

## Linked Accounts

### Scenario 1: Email/Password → OAuth
1. User creates account with email/password
2. Email is NOT verified yet
3. User links Google account
4. On next Google sign-in:
   - Email is auto-verified ✅
   - Verification banner disappears
   - User gains full access

### Scenario 2: OAuth → Email/Password
1. User signs up with Google
2. Email is auto-verified ✅
3. User sets password later (for email/password login)
4. Email remains verified
5. No verification email sent

### Scenario 3: Multiple OAuth Providers
1. User signs up with Google (verified ✅)
2. User links GitHub account
3. User links Discord account
4. Email remains verified for all sign-in methods

## Session Updates

### After Email Verification
When user verifies email via link:
```typescript
// In verify-email page
await update() // Refreshes session with new emailVerified status
```

This triggers the JWT callback with `trigger: 'update'` which:
1. Fetches fresh `emailVerified` from database
2. Updates token
3. Updates session
4. UI automatically reflects new status

### After OAuth Sign-in
When user signs in with OAuth:
```typescript
// In signIn callback
user.emailVerified = new Date()
// This flows through jwt → session → UI
```

## TypeScript Types

### NextAuth Types (`types/next-auth.d.ts`)
```typescript
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
      emailVerified?: Date | null // ✅ Added
    }
  }

  interface User {
    emailVerified?: Date | null // ✅ Added
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    emailVerified?: Date | null // ✅ Added
  }
}
```

## Database Schema

### User Model
```prisma
model User {
  id            String    @id @default(cuid())
  email         String    @unique
  emailVerified DateTime? // NULL = not verified, Date = verified
  // ...
}
```

## Benefits

### User Experience
- ✅ **No verification step** for OAuth users
- ✅ **Instant access** to all features
- ✅ **Seamless** sign-up flow
- ✅ **No confusing emails** for already-verified users

### Security
- ✅ **Trust OAuth providers** (Google, GitHub, Discord verify emails)
- ✅ **Consistent verification state** across all auth methods
- ✅ **Automatic upgrade** (unverified → verified on OAuth sign-in)

### Developer Experience
- ✅ **Simple logic**: Check `session.user.emailVerified`
- ✅ **Automatic updates**: Session refresh triggers re-fetch
- ✅ **Type-safe**: TypeScript knows about emailVerified

## Testing

### Test OAuth Verification
```bash
# 1. Create account via email/password
# 2. Don't verify email (banner should show)
# 3. Link Google account
# 4. Sign out
# 5. Sign in with Google
# 6. Check profile - banner should be gone ✅
```

### Test Session Updates
```tsx
// In any component
const { data: session, update } = useSession()

// After verification
await update() // Refreshes emailVerified from database
```

## Common Scenarios

### User Journey 1: OAuth First-Time User
```
1. Click "Sign in with Google"
2. Authorize on Google
3. Redirected to app
4. Profile shows "✓ Verified" immediately
5. No verification banner
6. Full access to all features
```

### User Journey 2: Email/Password → OAuth
```
1. Sign up with email/password
2. See verification banner (⚠️ Not verified)
3. Link Google account
4. Sign in with Google next time
5. Email auto-verified ✅
6. Banner disappears
7. Full access granted
```

### User Journey 3: OAuth → Password Set
```
1. Sign in with GitHub
2. Email verified ✅
3. Go to profile, set password
4. Can now login with email/password
5. Email stays verified
6. No verification needed
```

## Configuration

### Required NextAuth Setup
```typescript
// lib/next-auth.ts
import GoogleProvider from 'next-auth/providers/google'
import GitHubProvider from 'next-auth/providers/github'
import DiscordProvider from 'next-auth/providers/discord'

providers: [
  GoogleProvider({ /* ... */ }),
  GitHubProvider({ /* ... */ }),
  DiscordProvider({ /* ... */ }),
],

callbacks: {
  async signIn({ user, account }) {
    if (account?.provider !== 'credentials') {
      // Auto-verify OAuth users
      user.emailVerified = new Date()
      // Update database if needed
    }
  },
  
  async jwt({ token, user, trigger }) {
    // Include emailVerified in token
    if (user) token.emailVerified = user.emailVerified
    if (trigger === 'update') {
      // Refresh from database
    }
  },
  
  async session({ session, token }) {
    // Pass emailVerified to session
    session.user.emailVerified = token.emailVerified
  }
}
```

## Troubleshooting

### Banner Still Shows After OAuth Sign-in
**Solution**: Refresh session
```tsx
const { update } = useSession()
await update() // Force session refresh
```

### emailVerified is NULL After OAuth
**Cause**: Callback not updating database
**Solution**: Check `signIn` callback in `next-auth.ts`

### Session Not Updating After Verification
**Cause**: No session refresh triggered
**Solution**: Call `update()` after verification

## Best Practices

1. **Always check** `session.user.emailVerified` for UI logic
2. **Call `update()`** after any verification action
3. **Trust OAuth providers** - don't re-verify their emails
4. **Show clear status** - use ✓ icon for verified
5. **Handle transitions** - email/password → OAuth verification

## Related Documentation
- Account Deletion: `ACCOUNT_DELETION.md`
- OAuth Linking: `OAUTH_LINKING.md`
- Email Verification: `EMAIL_VERIFICATION.md`

---

**Status**: ✅ Production Ready
**Last Updated**: December 2024
