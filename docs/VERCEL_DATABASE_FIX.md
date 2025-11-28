# Vercel Database Connection Fix

## Problem
Bot-turn endpoint returns 500 with error:
```
Can't reach database server at aws-1-eu-west-1.pooler.supabase.com:5432
PrismaClientKnownRequestError: P1001
```

**Root Cause**: Vercel serverless functions + Supabase Session Pooler = connection timeouts

## Solution

### 1. Update DATABASE_URL in Vercel Environment Variables

Go to Vercel Dashboard → Your Project → Settings → Environment Variables

**Current (WRONG for Vercel):**
```
DATABASE_URL=postgresql://postgres.xxx:password@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

**New (CORRECT for Vercel):**
```
DATABASE_URL=postgresql://postgres.xxx:password@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

**Key Changes:**
- Port: `5432` → `6543` (Transaction mode pooler)
- Add: `?pgbouncer=true` (tells Prisma to use pgBouncer)
- Add: `&connection_limit=1` (limit connections per serverless instance)

### 2. Get Correct Connection String from Supabase

1. Go to: https://app.supabase.com/project/_/settings/database
2. Find section: **Connection Pooling** (not "Connection string")
3. Select **Mode: Transaction**
4. Select **Connection type: URI**
5. Copy the connection string (it should have port `6543`)

### 3. Alternative: Use Direct Connection (if pooler issues persist)

**Direct Connection URL:**
```
DATABASE_URL=postgresql://postgres.xxx:password@db.xxx.supabase.co:5432/postgres?connection_limit=1
```

**Note**: Direct connection is slower on cold starts but more reliable for Vercel.

### 4. Update Environment Variables

**In Vercel Dashboard:**
1. Settings → Environment Variables
2. Edit `DATABASE_URL`
3. Set value to Transaction pooler URL (port 6543)
4. Apply to: **Production, Preview, Development**
5. Click **Save**

**Redeploy:**
```bash
git commit --allow-empty -m "Fix: Update DATABASE_URL for Vercel"
git push origin main
```

Vercel will automatically redeploy with new environment variable.

### 5. Verify Fix

After deployment:
1. Go to boardly.online
2. Start a game with bot
3. Make a move (bot's turn should auto-execute)
4. Check Vercel logs for any P1001 errors

**Expected**: No more "Can't reach database server" errors

## What We Already Fixed in Code

✅ Added retry logic to `lib/db.ts` (Prisma middleware)
✅ Added retry logic to bot-turn endpoint (individual queries)
✅ Changed parallel `Promise.all()` to sequential updates (reduces connection pressure)
✅ Added 100-300ms delays between retries (exponential backoff)

**These code changes work WITH the correct DATABASE_URL.**

## Technical Details

### Why Session Pooler (port 5432) Fails on Vercel

- Vercel serverless functions have 10s timeout
- Each function creates new database connection
- Session pooler maintains persistent connections → slow handshake
- Cold starts = 2-5s connection time = timeouts

### Why Transaction Pooler (port 6543) Works

- Transaction-level pooling (not session-level)
- Faster connection handshake (~100ms)
- Better for serverless ephemeral connections
- Prisma officially recommends for serverless

### Connection Limits Explained

```
?connection_limit=1
```

- Each Vercel serverless instance gets 1 connection
- Prevents connection pool exhaustion
- Supabase free tier: 60 connections max
- Multiple serverless instances = shared pool

## Monitoring

After fix, monitor in Vercel dashboard:
- Functions → Runtime Logs
- Look for: `[Prisma] Connection error, retry`
- Should see: No P1001 errors

## References

- [Prisma + Supabase on Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
- [Supabase Connection Pooling](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Vercel Serverless Limits](https://vercel.com/docs/functions/serverless-functions/runtimes#maximum-duration)
