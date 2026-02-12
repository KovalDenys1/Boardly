## 📋 Issue Description

The Row Level Security (RLS) migration exists at `prisma/migrations/20260205000000_enable_rls/migration.sql` but uses **old singular table names** (User, Game, Lobby) instead of the new **plural table names** (Users, Games, Lobbies, Players, Bots, etc.) that were migrated on February 5, 2026.

## 🚨 Risk

**CRITICAL**: Applying the current migration will cause database permission errors. This is a security feature that needs to be tested thoroughly before production deployment.

## 🎯 Goal

Update and apply Row Level Security policies to production database to enable database-level security as a safety net alongside API authentication.

## ✅ Acceptance Criteria

- [ ] Rewrite migration SQL to use plural table names (Users, Games, Lobbies, Players, Accounts, Sessions, Bots, Friendships, FriendRequests, SpyLocations, EmailVerificationTokens, PasswordResetTokens, VerificationTokens)
- [ ] Test all RLS policies in staging environment with service role
- [ ] Verify no breaking changes to existing queries (Prisma uses service_role which bypasses RLS)
- [ ] Create comprehensive documentation: `docs/SECURITY_MODEL.md`
- [ ] Apply migration to production after thorough testing
- [ ] Verify all CRUD operations work correctly post-migration

## 📝 Implementation Notes

**Migration Location**: `prisma/migrations/20260205000000_enable_rls/migration.sql`

**Table Names to Update**:

- `User` → `Users`
- `Game` → `Games`  
- `Lobby` → `Lobbies`
- `Player` → `Players`
- `Bot` → `Bots` (NEW - separate table as of Feb 2026)
- `Account` → `Accounts`
- `Session` → `Sessions`
- `Friendship` → `Friendships`
- `FriendRequest` → `FriendRequests`
- `SpyLocation` → `SpyLocations`
- `EmailVerificationToken` → `EmailVerificationTokens`
- `PasswordResetToken` → `PasswordResetTokens`
- `VerificationToken` → `VerificationTokens`

**Key Considerations**:

- Prisma connection uses service_role (full access) via connection pooler (port 6543)
- RLS policies should allow service_role full access
- Staging test required before production
- Document RLS architecture for future reference

**Related Docs**:

- Existing: `docs/SECURITY_MODEL.md`, `docs/ARCHITECTURE.md`
- To update: `docs/SECURITY_MODEL.md`

## 🧪 Testing Requirements

- [ ] Test migration in local development copy of database
- [ ] Test in staging environment (separate Supabase project)
- [ ] Verify all API routes work correctly (guest + authenticated users)
- [ ] Test game CRUD operations (create lobby, join, play, finish)
- [ ] Test friend system (requests, accept, list)
- [ ] Verify service_role has full access (Prisma queries unaffected)
- [ ] Document test results

## 📊 Estimated Complexity

**L (Large - 3-5 days)**

## 🔗 Related Issues

- Blocks monetization features (need secure database)

## 🔒 Security Impact

**HIGH**: This is a critical security layer. Multi-layer defense:

1. NextAuth (session/JWT) - Layer 1
2. API routes (business logic) - Layer 2  
3. **RLS (database safety net) - Layer 3** ← THIS ISSUE

---

**References**:

- Migration: `prisma/migrations/20260205000000_enable_rls/migration.sql`
- Schema: `prisma/schema.prisma`
- Docs: `docs/SECURITY_MODEL.md`, `docs/ARCHITECTURE.md`
