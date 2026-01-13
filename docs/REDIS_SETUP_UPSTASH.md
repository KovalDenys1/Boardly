# Upstash Redis Setup Guide (Free Alternative)

This guide explains how to set up **Upstash Redis** (free tier) as an alternative to Vercel KV for distributed rate limiting and bot turn locking.

## Why Upstash?

- ✅ **Free tier**: 10,000 commands/day, 256 MB storage
- ✅ **No credit card required**
- ✅ **Works with serverless** (REST API)
- ✅ **Global edge network**
- ✅ **Better free tier than Vercel KV**

## Setup Steps

### 1. Create Upstash Account

1. Go to [upstash.com](https://upstash.com/)
2. Sign up (GitHub, Google, or email)
3. No credit card required!

### 2. Create Redis Database

1. Click **Create Database**
2. Choose:
   - **Name**: `boardly-redis` (or any name)
   - **Type**: Regional (faster) or Global (better for multi-region)
   - **Region**: Choose closest to your users
3. Click **Create**

### 3. Get Connection Details

After creating the database:

1. Click on your database name
2. Go to **REST API** tab
3. You'll see:
   - **UPSTASH_REDIS_REST_URL** - REST API endpoint
   - **UPSTASH_REDIS_REST_TOKEN** - Authentication token

### 4. Add Environment Variables to Vercel

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add these variables (use Upstash names or map to KV names):

**Option A: Use Upstash variable names (requires code change)**
```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

**Option B: Map to existing KV variables (no code change needed)**
```
KV_REST_API_URL=https://your-db.upstash.io
KV_REST_API_TOKEN=your-token
```

4. Make sure to add them for:
   - ✅ Production
   - ✅ Preview
   - ✅ Development (optional)

### 5. Update Code (If using Option A)

If you want to use Upstash variable names directly, update `lib/rate-limit.ts`:

```typescript
function isKvAvailable(): boolean {
  try {
    return !!(
      process.env.KV_URL ||
      process.env.UPSTASH_REDIS_REST_URL || // Add this
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    )
  } catch {
    return false
  }
}
```

And update the KV client initialization to use Upstash REST API.

**However**, the current code already supports `KV_REST_API_URL` and `KV_REST_API_TOKEN`, so **Option B (mapping to KV variables) works without code changes!**

## Verification

1. Deploy your changes to Vercel
2. Check logs - should see no KV connection errors
3. Test rate limiting - should work across requests
4. Check Upstash dashboard - should see command usage

## Monitoring

Monitor usage in Upstash dashboard:
- Commands per day (free tier: 10,000/day)
- Storage usage (free tier: 256 MB)
- Latency metrics

## Free Tier Limits

- **10,000 commands/day** - Should be enough for rate limiting + bot locks
- **256 MB storage** - More than enough for this use case
- **No expiration** - Free tier doesn't expire

## Troubleshooting

### Issue: "KV connection failed"

**Solution**: 
- Verify `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set correctly
- Check Upstash dashboard - database should be active
- Ensure you're using REST API URL (not Redis URL)

### Issue: Rate limiting not working

**Solution**:
- Check that environment variables are set in Vercel
- Verify Upstash database is active
- Check Vercel logs for connection errors

### Issue: Exceeded free tier

**Solution**:
- Check Upstash dashboard for usage
- Free tier: 10,000 commands/day
- If exceeded, wait for daily reset or upgrade to paid tier

## Migration from In-Memory

The code automatically detects KV availability:

1. **Before**: Uses in-memory `Map` (single instance only)
2. **After**: Uses Upstash Redis (works across all instances)

No code changes needed if you use `KV_REST_API_URL` and `KV_REST_API_TOKEN`!

## Additional Resources

- [Upstash Documentation](https://docs.upstash.com/redis)
- [Upstash REST API](https://docs.upstash.com/redis/features/restapi)
- [Upstash Pricing](https://upstash.com/pricing)
