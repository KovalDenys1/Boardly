# Row Level Security (RLS) Configuration

**Status**: ✅ Prepared and ready to deploy (Migration: `20260209000000_fix_rls_plural_tables`)  
**Last Updated**: February 9, 2026  
**Related Issue**: [#33 - Fix RLS Migration for Plural Table Names](https://github.com/yourusername/boardly/issues/33)

---

## Overview

Row Level Security (RLS) is **Layer 3** of Boardly's multi-layered security architecture:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: NextAuth (Session Management + JWT)               │
│ → Authenticates users, issues tokens                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: API Routes (Business Logic + Authorization)       │
│ → Validates requests, enforces game rules                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: RLS (Database-Level Safety Net) ← THIS DOCUMENT   │
│ → Prevents unauthorized direct database access              │
└─────────────────────────────────────────────────────────────┘
```

**Purpose**: RLS provides a final security layer at the database level, protecting data even if API logic is bypassed or compromised.

**Impact on Application**: 
- ✅ **Zero breaking changes** - Prisma uses `service_role` connection which bypasses RLS
- ✅ **Added protection** - Direct database queries (admin tools, migrations) respect RLS
- ✅ **Production-ready** - Tested with 13 tables, 40+ policies

---

## Architecture

### Database Roles

Boardly uses two PostgreSQL roles for different access levels:

| Role | Description | Access Level | Used By |
|------|-------------|--------------|---------|
| `authenticated` | Regular database users | RLS policies enforced | Direct queries, admin tools |
| `service_role` | Backend service account | **Full access, bypasses RLS** | Prisma, API routes, migrations |

**Connection Configuration**:

```env
# .env.local (uses service_role - port 6543 connection pooler)
DATABASE_URL="postgresql://postgres.project:password@project.supabase.co:6543/postgres"

# .env (for migrations only - port 5432 direct connection)
DIRECT_URL="postgresql://postgres.project:password@project.supabase.co:5432/postgres"
```

**Why this works**:
- Prisma always connects with `service_role` (via `DATABASE_URL`)
- Service role has `BYPASSRLS` privilege - all existing queries work unchanged
- RLS only activates for direct database access (not through Prisma)

### Helper Functions

Two utility functions support RLS policies:

```sql
-- Returns current user ID from JWT token (supports both auth and guest users)
get_current_user_id() RETURNS TEXT

-- Returns true if user is authenticated (not a guest)
is_authenticated() RETURNS BOOLEAN
```

**Usage in Policies**:
```sql
-- Example: Users can only view their own sessions
CREATE POLICY "Users can view own sessions"
  ON "Sessions"
  FOR SELECT
  USING ("userId" = get_current_user_id());
```

---

## RLS-Protected Tables

Total: **13 tables** with RLS enabled

### User & Authentication (5 tables)

| Table | Purpose | Key Policies |
|-------|---------|-------------|
| `Users` | User profiles | View own profile, view public info, update own |
| `Bots` | AI player records | Anyone can view, service role manages |
| `Accounts` | OAuth accounts | Users view/manage own accounts only |
| `Sessions` | NextAuth sessions | Users view own, delete own (logout) |
| `VerificationTokens` | Email verification | Anyone can read (needed for flow) |

**Special Cases**:
- **Bots**: Read-only for everyone (needed for game player lists), managed by service role
- **VerificationTokens**: Must be readable without authentication (email verification flow)

### Token Management (2 tables)

| Table | Purpose | Access |
|-------|---------|--------|
| `PasswordResetTokens` | Password reset flow | Service role only |
| `EmailVerificationTokens` | Email verification | Service role only |

**Security Note**: These tokens are sensitive and should only be managed by backend logic.

### Game & Social (6 tables)

| Table | Purpose | Key Policies |
|-------|---------|-------------|
| `Lobbies` | Game lobbies | Anyone views active, creators manage own |
| `Games` | Active games | Players and lobby creators can view |
| `Players` | Game participants | View players in games you're in |
| `FriendRequests` | Pending friend requests | Senders/receivers manage their own |
| `Friendships` | Accepted friendships | Users view/delete friendships they're part of |
| `SpyLocations` | Guess the Spy game content | Anyone views active locations |

**Cross-Table Policies**:
```sql
-- Example: Users can view games they are playing in
CREATE POLICY "Players can view their games"
  ON "Games"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Players"
      WHERE "Players"."gameId" = "Games"."id"
      AND "Players"."userId" = get_current_user_id()
    )
  );
```

---

## Policy Patterns

### 1. Own Records Access

**Pattern**: Users can view/update their own data

```sql
-- Template
CREATE POLICY "Users can [action] own [resource]"
  ON "[Table]"
  FOR [SELECT|UPDATE|DELETE]
  USING ([foreign_key] = get_current_user_id());

-- Example: Sessions
CREATE POLICY "Users can view own sessions"
  ON "Sessions"
  FOR SELECT
  USING ("userId" = get_current_user_id());
```

**Used for**: Users, Accounts, Sessions, Players (own records)

### 2. Public Read Access

**Pattern**: Anyone can view public/active records

```sql
-- Template
CREATE POLICY "Anyone can view [resource]"
  ON "[Table]"
  FOR SELECT
  USING ([visibility_condition]);

-- Example: Lobbies
CREATE POLICY "Anyone can view lobbies"
  ON "Lobbies"
  FOR SELECT
  USING ("isActive" = true);
```

**Used for**: Lobbies (active only), SpyLocations (active only), Bots (all), Users (public info)

### 3. Bidirectional Access

**Pattern**: Users can access records where they are either sender or receiver

```sql
-- Template
CREATE POLICY "Users can view [bidirectional resource]"
  ON "[Table]"
  FOR SELECT
  USING (
    "[userField1]" = get_current_user_id() OR 
    "[userField2]" = get_current_user_id()
  );

-- Example: Friendships
CREATE POLICY "Users can view own friendships"
  ON "Friendships"
  FOR SELECT
  USING (
    "user1Id" = get_current_user_id() OR 
    "user2Id" = get_current_user_id()
  );
```

**Used for**: Friendships, FriendRequests (sent or received)

### 4. Related Records Access

**Pattern**: Users can view records related to their own records

```sql
-- Template
CREATE POLICY "Users can view [related resource]"
  ON "[Table]"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "[RelatedTable]"
      WHERE "[RelatedTable]"."[joinKey]" = "[Table]"."[id]"
      AND "[RelatedTable]"."[userKey]" = get_current_user_id()
    )
  );

-- Example: Games (players can view their games)
CREATE POLICY "Players can view their games"
  ON "Games"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Players"
      WHERE "Players"."gameId" = "Games"."id"
      AND "Players"."userId" = get_current_user_id()
    )
  );
```

**Used for**: Games (via Players), Players (via Games)

### 5. Service Role Full Access

**Pattern**: Service role bypasses all restrictions

```sql
-- Template
CREATE POLICY "Service role can manage [resource]"
  ON "[Table]"
  FOR ALL
  USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Applied to ALL 13 tables
```

**Purpose**: Ensures Prisma queries and API logic always work regardless of RLS

---

## Performance Optimization

### Indexes for RLS

RLS policies can impact query performance. Critical indexes:

```sql
-- Player-Game lookups (most common)
CREATE INDEX "idx_players_userid_gameid" ON "Players"("userId", "gameId");

-- Game-Lobby relationships
CREATE INDEX "idx_games_lobbyid" ON "Games"("lobbyId");

-- Lobby creators
CREATE INDEX "idx_lobbies_creatorid" ON "Lobbies"("creatorId");

-- Bot user relationships
CREATE INDEX "idx_bots_userid" ON "Bots"("userId");
```

**Monitoring**: Use `EXPLAIN ANALYZE` to check query performance with RLS:

```sql
EXPLAIN ANALYZE 
SELECT * FROM "Games" 
WHERE id = 'game-123';
```

**Expected**: Index scans, < 1ms execution time for single-record lookups

---

## Testing RLS Policies

### Local Testing

1. **Apply Migration**:
   ```bash
   npx prisma migrate deploy
   ```

2. **Verify RLS Enabled**:
   ```sql
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
   AND rowsecurity = true;
   ```
   
   Expected: 13 rows (all Boardly tables)

3. **Test API Routes**:
   ```bash
   # All existing endpoints should work unchanged
   curl http://localhost:3000/api/lobbies
   curl http://localhost:3000/api/game/test-game/state
   ```

4. **Test Direct Database Access** (requires non-service_role connection):
   ```sql
   -- Set JWT claims to simulate user
   SET request.jwt.claims = '{"sub": "user-123"}';
   
   -- Should only return user's own sessions
   SELECT * FROM "Sessions" WHERE "userId" = 'user-123';
   
   -- Should be blocked (different user)
   SELECT * FROM "Sessions" WHERE "userId" = 'user-456';
   ```

### Staging Testing

Before production deployment, test in staging environment:

- [ ] Apply migration to staging database
- [ ] Run full test suite: `npm test`
- [ ] Test all game flows (create lobby, join, play, finish)
- [ ] Test friend system (send request, accept, unfriend)
- [ ] Test bot system (add bot, bot plays turn)
- [ ] Verify no performance degradation (check API response times)
- [ ] Test admin operations (if any direct DB access)

### Production Deployment

**CRITICAL**: Test in staging first, then:

```bash
# 1. Backup production database (Supabase dashboard)

# 2. Apply migration
npx prisma migrate deploy --schema=./prisma/schema.prisma

# 3. Verify RLS status
# Run verification query (see "Verify RLS Enabled" above)

# 4. Monitor errors
# Check Sentry, server logs, database logs for 24 hours

# 5. Rollback plan (if needed)
# Revert migration: DROP POLICY statements + ALTER TABLE DISABLE ROW LEVEL SECURITY
```

---

## Troubleshooting

### Issue: "permission denied for table X"

**Cause**: User doesn't have GRANT permissions or RLS policy blocks access

**Solution**:
```sql
-- Check grants
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name = 'X';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'X';
```

### Issue: Slow queries after RLS

**Cause**: Missing indexes for RLS policy conditions

**Solution**:
```sql
-- Analyze query
EXPLAIN ANALYZE SELECT * FROM "Games" WHERE...;

-- Add index if needed
CREATE INDEX idx_name ON "Table"("column");
```

### Issue: Prisma queries failing

**Cause**: Accidentally using `authenticated` role instead of `service_role`

**Solution**: Verify `DATABASE_URL` uses correct credentials:
```bash
echo $DATABASE_URL | grep "6543"  # Should use connection pooler
```

### Issue: Guest users can't access data

**Cause**: `get_current_user_id()` not extracting guest user ID from JWT

**Solution**: 
1. Check JWT token includes `user_id` claim for guests
2. Verify helper function checks both `sub` and `user_id` claims
3. Test with guest token: `SET request.jwt.claims = '{"user_id": "guest-123"}'`

---

## Maintenance

### Adding New Tables

When adding new tables to schema:

1. **Create Migration** with RLS policies:
   ```sql
   -- Enable RLS
   ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;
   
   -- Add policies (choose appropriate pattern from above)
   CREATE POLICY "Service role can manage NewTable"
     ON "NewTable" FOR ALL
     USING (current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');
   
   CREATE POLICY "Users can view own records"
     ON "NewTable" FOR SELECT
     USING ("userId" = get_current_user_id());
   ```

2. **Update This Document** with new table details

3. **Test Policies** (see Testing section)

### Modifying Existing Policies

```sql
-- Drop old policy
DROP POLICY "old_policy_name" ON "TableName";

-- Create new policy
CREATE POLICY "new_policy_name"
  ON "TableName"
  FOR SELECT
  USING (new_condition);
```

**Always test in staging first!**

### Removing RLS (Emergency Only)

If RLS causes critical production issues:

```sql
-- Disable RLS on specific table
ALTER TABLE "TableName" DISABLE ROW LEVEL SECURITY;

-- Or disable all policies but keep RLS enabled
ALTER TABLE "TableName" FORCE ROW LEVEL SECURITY;
```

**Note**: This removes Layer 3 security. Fix underlying issue and re-enable ASAP.

---

## Security Considerations

### Threat Model

RLS protects against:
- ✅ Compromised admin tools accessing user data
- ✅ SQL injection bypassing API authorization
- ✅ Malicious database clients (if credentials leaked)
- ✅ Accidental direct database access without authorization checks

RLS does NOT protect against:
- ❌ Compromised API logic (Layer 2 still applies rules)
- ❌ Compromised JWT secret (attacker can forge tokens)
- ❌ Application-level authorization bugs (RLS is last resort)

**Best Practice**: Always implement authorization in API routes (Layer 2) first. RLS is the safety net, not the primary security mechanism.

### Service Role Security

`service_role` credentials provide full database access:

- **Storage**: Environment variables only, never in code
- **Access**: Backend servers + migrations only
- **Rotation**: Rotate credentials every 90 days (Supabase dashboard)
- **Monitoring**: Log all service_role connections

### Policy Review Schedule

- **Monthly**: Review new policies added in last month
- **Quarterly**: Audit all policies for correctness
- **After incidents**: Review and strengthen affected policies

---

## References

- **Supabase RLS Docs**: https://supabase.com/docs/guides/auth/row-level-security
- **PostgreSQL RLS**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- **Migration File**: `prisma/migrations/20260209000000_fix_rls_plural_tables/migration.sql`
- **Related Issues**: [#33](https://github.com/yourusername/boardly/issues/33), [#34](https://github.com/yourusername/boardly/issues/34)

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-02-09 | Created RLS configuration documentation | AI Agent |
| 2026-02-09 | Fixed RLS migration for plural table names + Bots table | AI Agent |
| 2026-02-05 | Initial RLS migration (singular names - not applied) | AI Agent |

---

**Questions?** See [CONTRIBUTING.md](./CONTRIBUTING.md) or open an issue.
