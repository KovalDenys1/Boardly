# Socket.IO Troubleshooting Guide

## Common Issues on Render Free Tier

### 1. WebSocket Connection Timeout

**Symptoms:**
- `WebSocket connection failed: WebSocket is closed before the connection is established`
- `Socket connection error: timeout`
- 0 active connections on server

**Causes:**
- **Cold Start**: Render free tier spins down after 15 minutes of inactivity
- First connection can take 30-120 seconds to wake up the server
- Initial timeout might be too short

**Solutions:**

1. **Check Environment Variables on Render:**
   ```bash
   CORS_ORIGIN=https://boardly.online,https://www.boardly.online
   PORT=10000
   HOSTNAME=0.0.0.0
   DATABASE_URL=<your-supabase-url>
   ```

2. **Verify Socket URL Configuration:**
   - In Render dashboard for Next.js app, add:
     ```
     NEXT_PUBLIC_SOCKET_URL=https://boardly-websocket.onrender.com
     ```
   - **Important**: Use the actual Render URL for your socket service

3. **Test Socket Server Health:**
   ```bash
   curl https://boardly-websocket.onrender.com/health
   # Should return: {"ok":true}
   ```

4. **Monitor Logs:**
   - Check Render logs for socket server
   - Look for connection attempts and errors
   - Verify CORS headers are correct

### 2. CORS Errors

**Symptoms:**
- `Access-Control-Allow-Origin` errors in browser console
- Connections rejected immediately

**Solution:**
Update `CORS_ORIGIN` on Render socket server:
```
CORS_ORIGIN=https://boardly.online,https://www.boardly.online,http://localhost:3000
```

### 3. Authentication Failures

**Symptoms:**
- `Authentication failed` in logs
- Immediate disconnections after connection attempt

**Solution:**
- Verify token is being sent correctly in auth/query params
- Check guest mode handling for unauthenticated users
- Ensure JWT_SECRET is set on both servers

### 4. Memory Issues (Free Tier)

**Symptoms:**
- Server crashes or restarts frequently
- Slow responses
- Connection drops

**Solution:**
- Render free tier has 512MB RAM limit
- Monitor memory usage in logs
- Consider upgrading to Starter plan ($7/mo) for better performance

## Testing Checklist

### Local Development
- [ ] Both servers running (`npm run dev:all`)
- [ ] Socket server on port 3001
- [ ] Next.js on port 3000
- [ ] Can connect via browser console: `io('http://localhost:3001')`

### Production (Render)
- [ ] Socket server deployed and healthy (`/health` endpoint returns `{"ok":true}`)
- [ ] CORS_ORIGIN includes production domain
- [ ] NEXT_PUBLIC_SOCKET_URL set in Next.js environment
- [ ] Database accessible from socket server
- [ ] No authentication errors in logs

## Debugging Steps

### 1. Check Browser Console
```javascript
// Open browser console on boardly.online
console.log('Socket URL:', /* should show Render URL */)
// Try manual connection
const testSocket = io('https://boardly-websocket.onrender.com', {
  transports: ['polling', 'websocket'],
  timeout: 120000
})
testSocket.on('connect', () => console.log('✅ Connected!'))
testSocket.on('connect_error', (err) => console.error('❌ Error:', err))
```

### 2. Check Server Logs
Look for:
- `Socket.IO server listening on...`
- Connection attempts with user info
- Any error messages or stack traces

### 3. Verify Network Tab
- Open Network tab in browser DevTools
- Filter by "WS" (WebSocket)
- Look for Socket.IO polling requests (`/socket.io/?EIO=...`)
- Check response codes (should be 200 for successful polling)

## Performance Optimization

### Current Configuration

**Server (socket-server.ts):**
- `pingTimeout`: 120s (2 minutes before considering client dead)
- `pingInterval`: 30s (heartbeat frequency)
- `connectTimeout`: 120s (important for cold starts!)
- `transports`: polling first, then websocket upgrade

**Client (useSocketConnection.ts):**
- `reconnectionAttempts`: 20 (enough for cold start recovery)
- `reconnectionDelay`: 3s → 120s (exponential backoff)
- `timeout`: 120s (match server timeout)
- `transports`: polling → websocket

### Recommended Upgrades

**For Production Reliability:**

1. **Upgrade Render Plan** ($7/mo Starter):
   - No cold starts
   - 512MB → more RAM
   - Better performance
   - Worth it for production app

2. **Alternative: Keep Server Warm**
   - External cron job pinging `/health` every 10 minutes
   - Services: UptimeRobot (free), cron-job.org
   - Prevents cold starts entirely

3. **Use Redis Adapter** (for multiple socket servers):
   ```typescript
   import { createAdapter } from '@socket.io/redis-adapter'
   const pubClient = createClient({ url: 'redis://...' })
   const subClient = pubClient.duplicate()
   io.adapter(createAdapter(pubClient, subClient))
   ```

## Monitoring

### Built-in Metrics
The socket server logs metrics every 30 seconds:
- Active connections
- Total rooms
- Events processed
- Database query stats

### Health Check Endpoint
```bash
curl https://boardly-websocket.onrender.com/health
```

### Sentry Integration
Errors are automatically sent to Sentry (if configured):
- Connection errors
- Database errors
- Unhandled exceptions

## Common Fixes

### Quick Fix: Restart Services
1. Go to Render dashboard
2. Manual deploy (latest commit) for both services
3. Wait 2-3 minutes for cold start
4. Test connection

### Reset Everything
```bash
# Locally
rm -rf node_modules package-lock.json
npm install
npm run dev:all

# On Render
# Clear build cache + manual deploy
```

## Support

If issues persist:
1. Check Render status page: https://status.render.com/
2. Review Socket.IO docs: https://socket.io/docs/v4/
3. Check application logs for specific error messages
4. File issue on GitHub with:
   - Browser console logs
   - Server logs (last 50 lines)
   - Network tab screenshot
   - Environment (browser, OS, network)
