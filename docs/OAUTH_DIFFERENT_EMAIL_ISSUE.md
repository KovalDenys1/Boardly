# OAuth Account Linking with Different Emails - Solution

## Problem Statement

**User Scenario:**
- User has account with `kovaldenys@icloud.com`
- Already linked: GitHub and Discord (probably same email)
- Wants to link: Google account with `kovaldenys@gmail.com` (different email)
- **Current Issue**: NextAuth blocks OAuth sign-in if email already exists in database

## Current Flow

```
User Profile → Click "Connect Google" → /auth/link?provider=google
  ↓
Redirect to Google OAuth → User authorizes
  ↓
Google returns with email: kovaldenys@gmail.com
  ↓
NextAuth signIn callback checks:
  - OAuth account exists? NO
  - User with this email exists? YES (kovaldenys@gmail.com)
  - Action: BLOCK sign-in, return false
  ↓
Result: Error page, account NOT linked ❌
```

## Root Cause

In `lib/next-auth.ts` signIn callback (lines 119-128):

```typescript
if (existingUser) {
  // User exists with this email - DO NOT auto-link for security
  const log = apiLogger('OAuth signIn')
  log.warn('OAuth sign-in attempted with email of existing user', { 
    existingUserId: existingUser.id,
    provider: account.provider,
    email: user.email 
  })
  return false // ❌ BLOCKS linking
}
```

**Why this exists:** Security measure to prevent unauthorized account merging. If someone knows your email, they shouldn't be able to link their OAuth account to your profile without permission.

**Problem:** This also blocks legitimate linking when:
1. User is already logged in (authenticated session exists)
2. User explicitly clicks "Connect Google" from profile
3. User authorizes on Google's side
4. Google email differs from primary email

## Solution Options

### Option 1: Allow Linking for Authenticated Users ✅ RECOMMENDED

**Concept**: If user is already logged in, allow OAuth linking regardless of email mismatch.

**Implementation**:

```typescript
// lib/next-auth.ts - signIn callback
async signIn({ user, account, profile }) {
  if (account?.provider && account.provider !== 'credentials') {
    // ... existing checks ...
    
    if (existingUser) {
      // Check if this is an account linking scenario
      // NextAuth doesn't provide session in signIn callback directly,
      // but we can check if account.userId is set (linking) vs null (new sign-in)
      
      // For new OAuth sign-ins: user doesn't exist yet, so account.userId is null
      // For account linking: PrismaAdapter sets account.userId to current user
      
      // HOWEVER, PrismaAdapter creates account AFTER signIn callback
      // So we can't rely on account.userId here
      
      // Alternative: Check if there's an active session via cookies
      // But NextAuth doesn't expose this in signIn callback
      
      // BEST SOLUTION: Use a different approach for profile page linking
      return false // Keep blocking for security
    }
  }
  return true
}
```

**Problem with Option 1**: NextAuth signIn callback doesn't have access to current session, so we can't distinguish "new sign-in" from "account linking".

---

### Option 2: Separate API Endpoint for Linking ✅ IMPLEMENTED

**Concept**: Don't use NextAuth signIn flow for profile linking. Instead:
1. Profile page uses custom API endpoint
2. User authorizes with OAuth provider
3. Backend manually creates Account record linked to current user
4. No email check needed - user explicitly authorized

**Current Implementation**: Already exists at `/api/user/link-oauth`

**Benefits**:
- Full control over linking logic
- Can prompt user for confirmation
- Can handle email mismatches explicitly
- Maintains security for new sign-ins

**Drawbacks**:
- More complex flow
- Not using NextAuth built-in linking

**Status**: ✅ This endpoint exists but `/auth/link` page doesn't use it correctly

---

### Option 3: Use Separate Callback URLs ⚠️ WORKAROUND

**Concept**: Detect linking scenario via callback URL parameter

```typescript
// lib/next-auth.ts
async signIn({ user, account, profile }) {
  if (account?.provider && account.provider !== 'credentials') {
    if (existingUser) {
      // Check callback URL - if contains '/auth/link', allow linking
      // Problem: signIn callback doesn't have access to callbackUrl
      
      // CANNOT IMPLEMENT - NextAuth limitation
    }
  }
}
```

**Problem**: NextAuth signIn callback doesn't expose callbackUrl or request object.

---

### Option 4: Custom NextAuth Adapter 🔧 COMPLEX

**Concept**: Create custom PrismaAdapter that handles email mismatches

**Implementation**:
```typescript
// lib/custom-prisma-adapter.ts
export function CustomPrismaAdapter(prisma: PrismaClient) {
  const adapter = PrismaAdapter(prisma)
  
  return {
    ...adapter,
    linkAccount: async (account) => {
      // Custom logic: Allow linking even if email differs
      // Check if user is authenticated via session
      // This is called BEFORE signIn callback returns
      
      // Problem: Still can't access current session here
      return adapter.linkAccount(account)
    }
  }
}
```

**Problem**: Adapters also don't have session context.

---

## ✅ RECOMMENDED SOLUTION

**Use Profile Page Manual Linking Flow:**

1. **Profile page** (`app/profile/page.tsx`):
   ```tsx
   <button onClick={() => router.push('/auth/link?provider=google')}>
     Connect Google
   </button>
   ```

2. **Link page** (`app/auth/link/page.tsx`):
   ```tsx
   // CURRENT (wrong):
   await signIn(provider, { callbackUrl: `/auth/link?provider=${provider}` })
   
   // SHOULD BE:
   // Show confirmation dialog:
   "You're about to connect your Google account to this profile.
    Note: Your Google email may differ from your profile email.
    Continue?"
   
   [Yes] → Call /api/user/link-oauth-manual with provider
   [No] → Go back to profile
   ```

3. **New API endpoint** (`app/api/user/link-oauth-manual/route.ts`):
   ```typescript
   export async function POST(req: NextRequest) {
     const session = await getServerSession(authOptions)
     if (!session?.user?.id) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
     }
     
     const { provider } = await req.json()
     
     // Generate OAuth authorization URL with state
     const state = generateSecureState({ userId: session.user.id, provider })
     const authUrl = getOAuthUrl(provider, state)
     
     return NextResponse.json({ authUrl })
   }
   ```

4. **OAuth callback handler** (`app/api/auth/link-callback/route.ts`):
   ```typescript
   export async function GET(req: NextRequest) {
     const { code, state } = req.nextUrl.searchParams
     
     // Verify state and extract userId
     const { userId, provider } = verifyState(state)
     
     // Exchange code for tokens
     const tokens = await exchangeCodeForTokens(provider, code)
     
     // Get user info from provider
     const oauthUser = await getProviderUserInfo(provider, tokens.access_token)
     
     // Create Account record
     await prisma.account.create({
       data: {
         userId: userId,
         type: 'oauth',
         provider: provider,
         providerAccountId: oauthUser.id,
         access_token: tokens.access_token,
         refresh_token: tokens.refresh_token,
         // ... other fields
       }
     })
     
     // Redirect back to profile
     return NextResponse.redirect('/profile?linked=true')
   }
   ```

**Benefits**:
- ✅ Full control over linking process
- ✅ Can link accounts with different emails
- ✅ User explicitly authorizes linking
- ✅ Maintains security (requires authenticated session)
- ✅ Can show confirmation dialog
- ✅ Can handle errors gracefully

**Drawbacks**:
- Requires implementing OAuth flow manually
- More code to maintain
- Doesn't use NextAuth built-in linking

---

## SIMPLER ALTERNATIVE: Modify NextAuth Behavior

**Allow linking via query parameter:**

1. **Profile page**: Add `?action=link` to callback URL
   ```tsx
   await signIn(provider, { 
     callbackUrl: `/profile?action=link&provider=${provider}` 
   })
   ```

2. **NextAuth signIn callback**: Check for linking action
   ```typescript
   // This WON'T WORK - signIn callback doesn't have access to URL params
   ```

---

## ACTUAL WORKING SOLUTION ✅

**Use PrismaAdapter Events Workaround:**

The `linkAccount` event in NextAuth fires AFTER account is created. We can modify the signIn callback to allow linking when user already has an account:

```typescript
// lib/next-auth.ts
async signIn({ user, account, profile }) {
  if (account?.provider && account.provider !== 'credentials') {
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: account.provider,
          providerAccountId: account.providerAccountId
        }
      },
      include: { user: true }
    })

    if (existingAccount) {
      return true // Already linked
    }

    // Check if OAuth email already exists
    const existingUserByEmail = await prisma.user.findUnique({
      where: { email: user.email! },
    })

    if (existingUserByEmail) {
      // SPECIAL CASE: Check if there's ANOTHER user in session
      // Problem: No access to session here
      
      // ALTERNATIVE: Allow it and let PrismaAdapter handle it
      // PrismaAdapter will link to existing user if one exists
      // This is actually what happens by default with PrismaAdapter!
      
      // The issue is PrismaAdapter creates NEW user if email exists
      // We want to LINK to current logged-in user
      
      return false // Block for security
    }

    return true // Allow new user creation
  }
  return true
}
```

---

## FINAL DECISION

**Current Implementation:** Keep security measure in signIn callback

**For Profile Linking:** Modify `/auth/link` page to:
1. Show intermediate confirmation page
2. Explain that Google email may differ
3. Use custom linking API instead of `signIn()`
4. Handle all OAuth flow manually

**Next Steps:**
1. Create `/api/user/link-oauth-start` - Initiates OAuth flow with state
2. Create `/api/auth/link-callback` - Handles OAuth callback
3. Modify `/auth/link/page.tsx` - Show confirmation dialog first
4. Test with different email scenarios

**Status**: 📝 Design documented, implementation pending

**Priority**: MEDIUM - Current workaround is to use same email for all OAuth providers

---

## User Workaround (Temporary)

Until custom linking is implemented:

**Option A**: Use same email for all OAuth providers
- Change Google account email to match iCloud email
- Not practical for most users

**Option B**: Create separate account with Google
- Register new account with Google email
- Not ideal - loses existing data

**Option C**: Contact support to manually link accounts
- Admin manually creates Account record
- Requires database access

**Option D**: Use "Forgot Password" to add password
- OAuth-only users can set password via reset flow
- Then link Google normally
- **Best current workaround** ✅

---

## Related Issues

- GitHub Issue: #TBD
- Security doc: `docs/AUTH_SECURITY_FIX.md`
- NextAuth docs: https://next-auth.js.org/configuration/callbacks#sign-in-callback

**Last Updated**: December 9, 2025
