# Redis/KV Setup Guide (Optional)

This guide explains how to set up a Redis-compatible key-value store for distributed rate limiting and bot turn locking in production.

> **⚠️ Important**: This is **OPTIONAL**. The application works perfectly fine without KV/Redis using in-memory storage. However, for production with multiple serverless instances, distributed storage is recommended.

## What is this for?

A Redis-compatible store is used in this project for:
- **Distributed rate limiting** - Works across multiple serverless instances
- **Bot turn locking** - Prevents race conditions in concurrent bot turns

## Current Behavior (Without KV)

**Without KV configured**, the application uses:
- ✅ In-memory rate limiting (works for single instance)
- ✅ In-memory bot turn locks (works for single instance)
- ⚠️ **Limitation**: In multi-instance deployments (Vercel serverless), rate limiting and locks only work per-instance, not globally

**This is fine for:**
- Development
- Small deployments
- Single-instance production

**Consider KV/Redis if:**
- You have high traffic
- You're using Vercel serverless with multiple instances
- You need strict global rate limiting

## Setup Steps

### 1. Create Vercel KV Store

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (Boardly)
3. Navigate to **Storage** tab
4. Click **Create Database**
5. Select **KV** (Redis-compatible)
6. Choose a name (e.g., `boardly-kv`)
7. Select a region (choose closest to your users)
8. Click **Create**

### 2. Get Connection Details

After creating the KV store:

1. Click on your KV store name
2. Go to the **.env.local** tab
3. You'll see three environment variables:
   - `KV_URL` - Redis connection URL
   - `KV_REST_API_URL` - REST API endpoint
   - `KV_REST_API_TOKEN` - REST API authentication token

### 3. Add Environment Variables to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add the following variables:

```
KV_URL=redis://...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
```

4. Make sure to add them for:
   - ✅ Production
   - ✅ Preview
   - ✅ Development (optional, for local testing)

#### Option B: Via Vercel CLI

```bash
vercel env add KV_URL production
vercel env add KV_REST_API_URL production
vercel env add KV_REST_API_TOKEN production
```

### 4. Add to Local .env (Optional, for Development)

If you want to test KV locally:

1. Copy the environment variables from Vercel dashboard
2. Add them to your local `.env.local` file:

```env
KV_URL=redis://...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
```

**Note**: In development, the code will fallback to in-memory storage if KV is not available, so this is optional.

## Verification

### Check if KV is Working

1. Deploy your changes to Vercel
2. Check the logs for any KV connection errors
3. Test rate limiting - it should work across multiple requests
4. Test bot turns - they should not have race conditions

### Monitoring

You can monitor KV usage in:
- Vercel Dashboard → Storage → Your KV Store
- Check metrics for:
  - Operations per second
  - Memory usage
  - Network traffic

## Fallback Behavior

The code is designed to gracefully fallback:

- **If KV is not available**: Falls back to in-memory storage
- **If KV connection fails**: Logs error and uses in-memory storage
- **Development mode**: Works without KV (uses in-memory)

This ensures the app works even if KV is temporarily unavailable.

## Free Alternatives

### Option 1: Upstash Redis (Recommended - Better Free Tier)

[Upstash Redis](https://upstash.com/) offers a more generous free tier:

- **Free tier**: 10,000 commands/day, 256 MB storage
- **No credit card required**
- **Global edge network**
- **REST API** (works with serverless)

**Setup:**
1. Sign up at [upstash.com](https://upstash.com/)
2. Create a Redis database
3. Get REST API URL and token
4. Use environment variables:
   ```
   KV_REST_API_URL=https://your-db.upstash.io
   KV_REST_API_TOKEN=your-token
   ```

**Code changes needed:**
The code already supports REST API via `KV_REST_API_URL` and `KV_REST_API_TOKEN`, so it should work with Upstash out of the box!

### Option 2: Vercel KV

Vercel KV pricing:
- **Free tier**: 256 MB storage, 10,000 commands/day (requires Vercel Pro)
- **Pro tier**: $0.20/GB storage, $0.20 per 100K commands

**Note**: Vercel KV free tier requires Vercel Pro plan ($20/month).

### Option 3: Self-hosted Redis

If you have a server, you can run Redis yourself:
- Free and open-source
- Requires server management
- Use `KV_URL=redis://your-redis-server:6379`

## Cost Comparison

| Service | Free Tier | Paid Tier |
|---------|----------|-----------|
| **Upstash Redis** | ✅ 10K commands/day, 256MB | $0.20/100K commands |
| **Vercel KV** | ⚠️ Requires Pro ($20/mo) | $0.20/100K commands |
| **In-Memory** | ✅ Free, unlimited | N/A (single instance only) |

**Recommendation**: For free tier, use **Upstash Redis**. For this project's usage (rate limiting + bot locks), the free tier should be sufficient.

## Troubleshooting

### Issue: "KV connection failed"

**Solution**: 
- Check that environment variables are set correctly
- Verify KV store is active in Vercel dashboard
- Check network connectivity

### Issue: Rate limiting not working

**Solution**:
- Verify `KV_URL` or `KV_REST_API_URL` + `KV_REST_API_TOKEN` are set
- Check Vercel logs for KV errors
- Ensure KV store is in the same region as your deployment

### Issue: Bot turns still have race conditions

**Solution**:
- Verify KV is properly configured
- Check that lock keys are unique per game+bot
- Review logs for lock acquisition failures

## Migration from In-Memory

The code automatically detects KV availability:

1. **Before**: Uses in-memory `Map` (single instance only)
2. **After**: Uses Vercel KV (works across all instances)

No code changes needed - just add the environment variables!

## Additional Resources

- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
- [Redis Commands Reference](https://redis.io/commands/)
- [@vercel/kv Package](https://www.npmjs.com/package/@vercel/kv)
