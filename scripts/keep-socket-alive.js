/**
 * Render Free Tier Keep-Alive Script
 * 
 * Pings the Socket.IO server every 10 minutes to prevent it from sleeping.
 * Render free tier services sleep after 15 minutes of inactivity.
 * 
 * Usage:
 *   1. Deploy this as a separate cron job (GitHub Actions, Vercel Cron, etc.)
 *   2. Or run locally: node scripts/keep-socket-alive.js
 */

const SOCKET_URL = process.env.SOCKET_SERVER_URL || 'https://boardly-websocket.onrender.com'
const PING_INTERVAL = 10 * 60 * 1000 // 10 minutes

async function pingServer() {
  try {
    console.log(`[${new Date().toISOString()}] Pinging ${SOCKET_URL}/health...`)
    
    const response = await fetch(`${SOCKET_URL}/health`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Boardly-KeepAlive/1.0',
      },
    })
    
    if (response.ok) {
      const data = await response.json()
      console.log(`[${new Date().toISOString()}] ✅ Socket server is alive:`, data)
    } else {
      console.error(`[${new Date().toISOString()}] ❌ Socket server responded with status ${response.status}`)
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ Failed to ping socket server:`, error)
  }
}

// Ping immediately on start
pingServer()

// Then ping every 10 minutes
setInterval(pingServer, PING_INTERVAL)

console.log(`[${new Date().toISOString()}] 🚀 Keep-alive script started. Pinging ${SOCKET_URL} every ${PING_INTERVAL / 60000} minutes.`)
