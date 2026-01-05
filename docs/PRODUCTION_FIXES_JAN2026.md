# Production Issues Fix & Best Practices (January 2026)

## 🔧 Fixed Issues

### 1. ✅ Email Verification - Multiple Requests & Toast Duplicates

**Problem:** После регистрации при верификации почты появлялись множественные 400 ошибки и дублирующиеся toast-уведомления.

**Root Cause:** 
- `useEffect` без защиты от повторных вызовов запускал верификацию несколько раз
- Strict Mode в React 18 вызывает effects дважды в development
- Отсутствие debounce и флагов для отслеживания выполнения запроса

**Fix Applied:**
- Добавлен `useRef` для отслеживания попыток верификации (`verificationAttemptedRef`)
- Добавлена проверка текущего токена (`currentTokenRef`) для предотвращения дублирования
- Сброс флагов только при ошибке для возможности retry

**File:** [app/auth/verify-email/VerifyEmailContent.tsx](app/auth/verify-email/VerifyEmailContent.tsx)

```typescript
// Prevent duplicate verification requests
const verificationAttemptedRef = useRef(false)
const currentTokenRef = useRef<string | null>(null)

const verifyEmail = useCallback(async (verificationToken: string) => {
  // Prevent duplicate requests for the same token
  if (verificationAttemptedRef.current && currentTokenRef.current === verificationToken) {
    return
  }
  
  verificationAttemptedRef.current = true
  currentTokenRef.current = verificationToken
  // ... rest of verification logic
}, [router, toast, update])

useEffect(() => {
  if (token && !verificationAttemptedRef.current) {
    verifyEmail(token)
  }
}, [token, verifyEmail])
```

**Prevention Pattern:**
```typescript
// Pattern for one-time API calls in useEffect
const apiCallMadeRef = useRef(false)

useEffect(() => {
  if (someCondition && !apiCallMadeRef.current) {
    apiCallMadeRef.current = true
    makeApiCall()
  }
}, [dependencies])
```

---

### 2. ✅ Sound Loading Errors (ERR_CACHE_OPERATION_NOT_SUPPORTED)

**Problem:** В production на Render появлялись ошибки загрузки звуков `/sounds/turn-change.mp3` и `/sounds/click.mp3` с кодом `ERR_CACHE_OPERATION_NOT_SUPPORTED`.

**Root Cause:**
- Агрессивный preload='auto' вызывал проблемы с кешированием в production
- Некоторые браузеры/CDN имеют проблемы с кешированием аудио файлов
- Отсутствие retry логики при ошибках загрузки
- Избыточные console.warn в production

**Fix Applied:**
- Изменен `preload` с `'auto'` на `'none'` (lazy loading)
- Добавлена обработка media error code 4 (MEDIA_ERR_SRC_NOT_SUPPORTED) с автоматическим retry через `audio.load()`
- Проверка `readyState` перед воспроизведением с lazy loading при необходимости
- Логирование только в development mode (`process.env.NODE_ENV === 'development'`)
- Обработка дополнительных ошибок воспроизведения (AbortError)

**File:** [lib/sounds.ts](lib/sounds.ts)

```typescript
private loadSounds() {
  Object.entries(soundFiles).forEach(([key, path]) => {
    try {
      const audio = new Audio()
      audio.preload = 'none' // Changed from 'auto' to prevent cache issues
      audio.src = path
      
      // Enhanced error handler with retry logic
      audio.addEventListener('error', (e) => {
        const error = e.target as HTMLAudioElement
        if (error.error?.code === 4) {
          audio.load() // Retry on cache/media error
        }
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Failed to load sound: ${path}`, e)
        }
      })
      // ...
    } catch (error) {
      // Fail silently in production
    }
  })
}

play(soundName: string, options = {}) {
  // Load sound if not loaded (lazy loading)
  if (sound.readyState === 0) {
    sound.load()
  }
  // ... rest of play logic
}
```

**Prevention Pattern:**
```typescript
// Graceful media loading with fallback
const loadMediaWithFallback = (src: string) => {
  const media = new Audio()
  media.preload = 'none' // Lazy load
  media.src = src
  
  media.addEventListener('error', (e) => {
    const error = e.target as HTMLAudioElement
    if (error.error?.code === 4) {
      media.load() // Retry
    }
    // Log only in dev
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Media load failed: ${src}`)
    }
  })
  
  return media
}
```

---

### 3. ✅ WebSocket Connection Timeout (Render Cold Starts)

**Problem:** При запуске игры с ботом появлялись ошибки WebSocket:
- "WebSocket is closed before the connection is established"
- "🔴 Socket connection error: timeout"
- Бесконечная загрузка, игра не стартует

**Root Cause:**
- Render free tier имеет cold starts до 60-90 секунд
- Timeout был установлен на 120000ms (2 минуты) - недостаточно для холодного старта
- Отсутствие дополнительных опций для стабилизации соединения

**Fix Applied:**
- Увеличен `timeout` с 120000ms (2 мин) до 180000ms (3 мин)
- Добавлены опции для стабильности:
  - `closeOnBeforeunload: false` - не закрывать при перезагрузке страницы
  - `withCredentials: false` - не нужно для токен-авторизации
- Обновлены комментарии с актуальной информацией

**File:** [app/lobby/[code]/hooks/useSocketConnection.ts](app/lobby/[code]/hooks/useSocketConnection.ts)

```typescript
const newSocket = io(url, {
  transports: ['polling', 'websocket'],
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 3000,
  reconnectionDelayMax: 120000,
  timeout: 180000, // 3 хвилини (було 2 хв) - для cold start
  upgrade: true,
  rememberUpgrade: true,
  closeOnBeforeunload: false, // Не закривати при перезавантаженні
  withCredentials: false, // Не потрібно для токен-авторизації
  // ... auth config
})
```

**Prevention Pattern:**
```typescript
// Socket.IO config for serverless with cold starts
const socketConfig = {
  timeout: 180000, // 3 min for cold starts
  reconnectionAttempts: 20,
  reconnectionDelay: 3000,
  reconnectionDelayMax: 120000,
  transports: ['polling', 'websocket'], // Start with polling
  upgrade: true, // Auto-upgrade to WebSocket
  closeOnBeforeunload: false,
}
```

---

### 4. ✅ Missing i18n Translations on Spy Game Lobbies

**Problem:** На странице `/games/spy/lobbies` были hardcoded тексты вместо переводов:
- "Want to play?"
- "Sign In", "Create Account"
- "Create New Lobby"
- "Quick Join"
- "Waiting", "Playing", "Full"
- И другие UI элементы

**Root Cause:**
- Использование прямых строк вместо `t('key')` из `useTranslation`
- Использование `toast` напрямую вместо `showToast` из i18n-toast
- Отсутствие ключей перекладов в `messages/en.json` и `messages/uk.json`

**Fix Applied:**
- Добавлено 20+ новых ключей в секцию `games.spy.lobbies` в обоих файлах перекладов
- Добавлена секция `breadcrumbs` для навигации
- Заменен весь hardcoded текст на `t('key')`
- Заменен `toast` на `showToast` для локализованных уведомлений
- Добавлена обработка ошибок через `showToast.error('errors.loadFailed')`

**Files:** 
- [messages/en.json](messages/en.json) - English translations
- [messages/uk.json](messages/uk.json) - Ukrainian translations
- [app/games/spy/lobbies/page.tsx](app/games/spy/lobbies/page.tsx) - Updated component

**Added Keys:**
```json
{
  "breadcrumbs": {
    "home": "Home",
    "games": "Games"
  },
  "games": {
    "spy": {
      "lobbies": {
        "title": "Guess the Spy",
        "subtitle": "Join a game or create your own lobby!",
        "subtitleGuest": "Browse lobbies and sign in when you want to host or join.",
        "backToGames": "Back to Games",
        "wantToPlay": "Want to play?",
        "wantToPlayDesc": "Sign in or create an account...",
        "signIn": "Sign In",
        "createAccount": "Create Account",
        "createNewLobby": "Create New Lobby",
        "createDescription": "Start your own Spy game...",
        "createNow": "Create Now",
        "quickJoin": "Quick Join",
        "quickJoinDesc": "Have a lobby code?...",
        "enterCode": "Enter 4-digit code",
        "signInToJoin": "Please sign in before joining...",
        "activeLobbies": "Active Lobbies",
        "noLobbiesTitle": "No active lobbies right now...",
        "createFirstLobby": "Create First Lobby",
        "host": "Host",
        "waiting": "Waiting",
        "playing": "Playing",
        "full": "Full",
        "newGame": "NEW GAME"
      }
    }
  }
}
```

**Prevention Pattern:**
```typescript
// Always use i18n for ALL user-facing text
import { useTranslation } from 'react-i18next'
import { showToast } from '@/lib/i18n-toast'

function Component() {
  const { t } = useTranslation()
  
  // ❌ Don't
  <button>Create Lobby</button>
  toast.success('Created!')
  
  // ✅ Do
  <button>{t('lobby.create')}</button>
  showToast.success('toast.lobbyCreated')
  
  // ✅ With parameters
  showToast.success('toast.playerJoined', undefined, { name: username })
}
```

---

## 📋 Best Practices & Prevention Guide

### 1. API Calls in useEffect - Prevent Duplicates

**Problem Pattern:**
```typescript
// ❌ Will trigger multiple times
useEffect(() => {
  fetch('/api/endpoint').then(...)
}, [dependency])
```

**Solution:**
```typescript
// ✅ Protected with ref
const callMadeRef = useRef(false)

useEffect(() => {
  if (!callMadeRef.current) {
    callMadeRef.current = true
    fetch('/api/endpoint').then(...)
  }
}, [dependency])

// ✅ With cleanup and reset on error
const callMadeRef = useRef(false)

useEffect(() => {
  if (!callMadeRef.current) {
    callMadeRef.current = true
    
    fetch('/api/endpoint')
      .then(...)
      .catch((error) => {
        callMadeRef.current = false // Allow retry on error
        // Handle error
      })
  }
}, [dependency])
```

**When to use:**
- One-time initialization calls (verification, authentication)
- Critical operations that shouldn't duplicate
- Expensive API calls

---

### 2. Media Loading - Graceful Degradation

**Best Practices:**
- Use `preload='none'` for non-critical media
- Implement retry logic for media errors
- Log only in development mode
- Fail silently in production - app should continue working
- Check `readyState` before playing

**Example:**
```typescript
class MediaManager {
  loadMedia(src: string) {
    const media = new Audio()
    media.preload = 'none' // Lazy load
    media.src = src
    
    media.addEventListener('error', (e) => {
      const error = e.target as HTMLAudioElement
      if (error.error?.code === 4) {
        media.load() // Retry on cache error
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Failed to load: ${src}`)
      }
    })
    
    return media
  }
  
  play(media: HTMLAudioElement) {
    if (media.readyState === 0) {
      media.load() // Load if not loaded
    }
    
    const playPromise = media.play()
    if (playPromise) {
      playPromise.catch((err) => {
        // Handle AbortError, NotAllowedError silently
        if (process.env.NODE_ENV === 'development') {
          console.warn('Play failed:', err)
        }
      })
    }
  }
}
```

---

### 3. WebSocket Connections - Production Configuration

**For Render Free Tier / Serverless:**
```typescript
const socketConfig = {
  // Core settings
  timeout: 180000, // 3 min (cold starts can take 60-90s)
  transports: ['polling', 'websocket'], // Start with polling
  
  // Reconnection
  reconnection: true,
  reconnectionAttempts: 20,
  reconnectionDelay: 3000, // 3s initial
  reconnectionDelayMax: 120000, // Max 2 min between attempts
  
  // Stability
  upgrade: true, // Auto-upgrade polling → WebSocket
  rememberUpgrade: true, // Cache successful upgrade
  closeOnBeforeunload: false, // Don't close on reload
  withCredentials: false, // Not needed for token auth
  
  // Auth
  auth: { token, isGuest },
  query: { token, isGuest: 'false' },
}
```

**Error Handling:**
```typescript
socket.on('connect_error', (error) => {
  if (error.message.includes('timeout')) {
    // Show user-friendly message about cold start
    showToast.info('connection.coldStart')
  } else if (error.message.includes('Authentication failed')) {
    // Don't retry on auth errors
    setIsReconnecting(false)
  }
})
```

---

### 4. i18n - Complete Localization

**Checklist:**
- [ ] All user-facing text uses `t('key')`
- [ ] All toast notifications use `showToast`
- [ ] Keys exist in BOTH `en.json` and `uk.json`
- [ ] No hardcoded strings in JSX
- [ ] Parameters handled correctly: `t('key', { param: value })`

**File Structure:**
```
messages/
  ├── en.json
  └── uk.json
```

**Key Naming Convention:**
```json
{
  "section": {
    "subsection": {
      "action": "Text",
      "actionDesc": "Description"
    }
  }
}
```

**Usage:**
```typescript
// ✅ Correct
const { t } = useTranslation()
<h1>{t('games.spy.lobbies.title')}</h1>
showToast.success('toast.lobbyCreated')

// ❌ Wrong
<h1>Guess the Spy</h1>
toast.success('Lobby created!')
```

**Testing:**
1. Switch language in UI
2. Check all pages for missing translations (keys displayed as text)
3. Test toast notifications in both languages
4. Verify parameters rendering correctly

---

### 5. Error Handling - Production vs Development

**Pattern:**
```typescript
// Development: Log everything
// Production: Log only critical errors, fail gracefully

try {
  // Operation
} catch (error) {
  if (process.env.NODE_ENV === 'development') {
    console.error('Detailed error:', error)
  }
  
  // Show user-friendly error
  showToast.error('errors.operationFailed')
  
  // Log to Sentry in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.captureException(error)
  }
}
```

**Media/Resources:**
```typescript
media.addEventListener('error', (e) => {
  // Try to recover
  if (error.code === 4) {
    media.load()
  }
  
  // Log only in dev
  if (process.env.NODE_ENV === 'development') {
    console.warn('Media error:', e)
  }
  
  // Don't break app - continue silently
})
```

---

## 🧪 Testing Checklist

### Before Production Deploy:

**1. API Calls:**
- [ ] No duplicate requests in Network tab
- [ ] useEffect calls protected with refs
- [ ] Error states handled gracefully
- [ ] Loading states prevent multiple clicks

**2. Media/Resources:**
- [ ] Sounds play correctly
- [ ] No console errors for media
- [ ] App works when media fails to load
- [ ] Cache errors handled gracefully

**3. WebSocket:**
- [ ] Connection established within timeout
- [ ] Reconnection works after disconnect
- [ ] Cold start handled (wait up to 3 min)
- [ ] Error messages user-friendly

**4. i18n:**
- [ ] All text uses translation keys
- [ ] Both languages complete
- [ ] Switch language - no broken text
- [ ] Toast notifications localized

**5. Error Handling:**
- [ ] Development logs detailed
- [ ] Production logs minimal
- [ ] User sees friendly errors
- [ ] Sentry captures critical errors

---

## 🚀 Deployment

After fixes applied:

```bash
# 1. Test locally
npm run dev:all

# 2. Run tests
npm test

# 3. Build for production
npm run build

# 4. Deploy to Render
git push origin main

# 5. Monitor logs
# Check Render logs for errors

# 6. Test in production
# - Email verification
# - Sound playback
# - WebSocket connection
# - Language switching
```

---

## 📊 Monitoring

**Key Metrics to Watch:**

1. **API Calls:** Monitor duplicate requests via New Relic/Datadog
2. **WebSocket:** Track connection success rate and timeout frequency
3. **Media Loading:** Error rate for audio files
4. **i18n Coverage:** Missing translation keys
5. **Error Rate:** Sentry error frequency

**Alerts:**
- WebSocket timeout > 10% of connections
- Media load errors > 5%
- Missing translation keys detected
- API duplicate calls detected

---

## 📚 Resources

- [React useEffect Best Practices](https://react.dev/reference/react/useEffect)
- [Socket.IO Client Options](https://socket.io/docs/v4/client-options/)
- [HTML Audio API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAudioElement)
- [i18next React Guide](https://react.i18next.com/)
- [Render Cold Starts](https://render.com/docs/free#free-web-services)

---

## ✅ Summary

**Fixed:**
1. ✅ Email verification duplicate requests
2. ✅ Sound loading cache errors
3. ✅ WebSocket timeout on cold starts
4. ✅ Missing i18n translations on Spy Lobbies

**Implemented:**
- useRef protection for one-time API calls
- Graceful media loading with retry
- Extended WebSocket timeout for Render
- Complete i18n coverage
- Development vs Production logging

**Result:** Стабільна production app без критичних помилок ✨
