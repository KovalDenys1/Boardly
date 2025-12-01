# Boardly Internationalization - Completion Guide

## ✅ Completed

1. **Installed i18n** - react-i18next
2. **Created translation files** - `messages/en.json` and `messages/uk.json`
3. **Configured infrastructure**:
   - `i18n.ts` - configuration
   - `LanguageSwitcher.tsx` - language switcher component
   - `providers.tsx` - i18n initialization
   - `Header` and its subcomponents adapted

## 🔄 Tasks Remaining

### 1. Home Page (app/page.tsx)
Convert components to client-side or use server-side translations:

```tsx
// Add to HomePage/* components:
'use client'
import { useTranslation } from 'react-i18next'

// Usage:
const { t } = useTranslation()
<h1>{t('home.title')}</h1>
```

**Files to adapt:**
- `components/HomePage/HeroSection.tsx`
- `components/HomePage/FeaturesGrid.tsx`
- `components/HomePage/HowItWorks.tsx`

### 2. Games Page (app/games/page.tsx)
**Changes:**
```tsx
'use client'
import { useTranslation } from 'react-i18next'

const { t } = useTranslation()

const games: Game[] = [
  {
    name: t('games.yahtzee.name'),
    description: t('games.yahtzee.description'),
    // ...
  }
]
```

### 3. Lobby (app/lobby/[code]/page.tsx)
**Key translations:**
- Game states (waiting, playing, finished)
- Toast messages
- Yahtzee category names
- Action buttons (Roll, Hold, Score)

**Example:**
```tsx
const CATEGORY_DISPLAY_NAMES: Record<YahtzeeCategory, string> = {
  ones: t('yahtzee.categories.ones'),
  twos: t('yahtzee.categories.twos'),
  // ...
}
```

### 4. Authentication
**Files:**
- `app/auth/login/page.tsx`
- `app/auth/register/page.tsx`
- `app/auth/forgot-password/page.tsx`
- `app/auth/reset-password/page.tsx`

**Pattern:**
```tsx
'use client'
import { useTranslation } from 'react-i18next'

const { t } = useTranslation()

<input placeholder={t('auth.login.emailPlaceholder')} />
<button>{t('auth.login.submit')}</button>
```

### 5. Components
**Files to adapt:**
- `components/Chat.tsx` - chat messages
- `components/Scorecard.tsx` - category names
- `components/PlayerList.tsx` - player statuses
- `components/YahtzeeResults.tsx` - game results

### 6. Toast Notifications
Create helper for localized toasts:

```typescript
// lib/i18n-toast.ts
import toast from 'react-hot-toast'
import i18n from '@/i18n'

export const showToast = {
  success: (key: string, fallback: string) => {
    toast.success(i18n.t(key, fallback))
  },
  error: (key: string, fallback: string) => {
    toast.error(i18n.t(key, fallback))
  },
  // ...
}
```

**Usage across project:**
```tsx
// Instead of:
toast.success('Game started!')

// Use:
showToast.success('lobby.game.gameStarted', 'Game started!')
```

## 📝 Important Notes

### Server Components
React-i18next only works on client. For server components:
1. Convert them to client-side (`'use client'`)
2. OR use server-side translations (more complex)

### Dynamic Values
For translations with variables:
```tsx
t('yahtzee.messages.scored', { 
  player: 'John', 
  score: 50, 
  category: 'Ones' 
})
```

In JSON:
```json
"scored": "{{player}} scored {{score}} points in {{category}}"
```

### Plural Forms
For Ukrainian add plural forms:
```json
"players": "{{count}} гравець",
"players_plural": "{{count}} гравці",
"players_many": "{{count}} гравців"
```

## 🚀 Next Steps

1. **Adapt HomePage components** (15 min)
2. **Adapt Games page** (10 min)
3. **Adapt Auth pages** (20 min)
4. **Adapt Lobby and game** (30 min)
5. **Adapt Toast notifications** (15 min)
6. **Test both languages** (20 min)

**Total time:** ~2 hours

## 🎯 Priority

1. ✅ Header (COMPLETED)
2. HeroSection - most visible part
3. Auth forms - critical for UX
4. Yahtzee game - core functionality
5. Chat and other components

## 🔍 Verification

After completion, verify:
- [ ] Language switcher works
- [ ] All texts are translated
- [ ] No hardcoded text remains
- [ ] Toast notifications localized
- [ ] Plural forms work
- [ ] Dates and numbers formatted correctly

## 📚 Useful Resources

- React-i18next: https://react.i18next.com/
- Ukrainian plurals: https://www.i18next.com/translation-function/plurals
- Language detector: https://github.com/i18next/i18next-browser-languageDetector
