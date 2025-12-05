# 🌐 Boardly Internationalization System

## Overview

Boardly uses **react-i18next** for multi-language support. Currently supported:
- 🇬🇧 English - default
- 🇺🇦 Ukrainian

## How It Works

### Architecture

```
Boardly/
├── i18n.ts                 # i18next configuration
├── messages/               # Translation files
│   ├── en.json            # English translations
│   └── uk.json            # Ukrainian translations
├── components/
│   └── LanguageSwitcher.tsx  # Language switcher
└── app/providers.tsx      # i18n initialization
```

### Language Preference Storage

Selected language is saved in browser's `localStorage` and automatically restored on next visit.

## Usage in Components

### Basic Usage

```tsx
'use client'
import { useTranslation } from 'react-i18next'

export default function MyComponent() {
  const { t } = useTranslation()
  
  return (
    <div>
      <h1>{t('home.title')}</h1>
      <p>{t('home.subtitle')}</p>
    </div>
  )
}
```

### With Parameters

```tsx
const { t } = useTranslation()

// In component:
<p>{t('home.welcomeBack', { name: userName })}</p>

// In messages/en.json:
{
  "home": {
    "welcomeBack": "Welcome back, {{name}}!"
  }
}
```

### With Fallback Value

```tsx
<button>{t('button.submit', 'Submit')}</button>
```

If key is not found, "Submit" will be displayed.

### Plural Forms

```tsx
const { t } = useTranslation()

<p>{t('players.count', { count: playerCount })}</p>
```

```json
{
  "players": {
    "count": "{{count}} player",
    "count_plural": "{{count}} players",
    "count_many": "{{count}} players"
  }
}
```

## Translation File Structure

```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "header": {
    "home": "Home",
    "games": "Games",
    "profile": "Profile"
  },
  "home": {
    "title": "Play Board Games Online",
    "subtitle": "Real-time multiplayer gaming"
  },
  "games": {
    "yahtzee": {
      "name": "Yahtzee",
      "description": "Classic dice game"
    }
  }
}
```

### Key Naming Conventions

- **Section.subsection.key**: `home.features.title`
- **camelCase** for keys: `welcomeBack`, `signUpFree`
- **Logical grouping**: all texts from one page in one section

## Adding New Translations

### 1. Add key to both files

**messages/en.json:**
```json
{
  "mySection": {
    "newKey": "English text"
  }
}
```

**messages/uk.json:**
```json
{
  "mySection": {
    "newKey": "Український текст"
  }
}
```

### 2. Use in component

```tsx
const { t } = useTranslation()
<p>{t('mySection.newKey')}</p>
```

## Language Switcher

The `LanguageSwitcher` component is available in Header. It:
- Displays EN / UA buttons
- Saves choice in localStorage
- Instantly updates all texts

```tsx
<LanguageSwitcher />
```

## Toast Notifications

For localized toasts, use the helper:

```typescript
// lib/i18n-toast.ts
import toast from 'react-hot-toast'
import i18n from '@/i18n'

export const showToast = {
  success: (key: string) => toast.success(i18n.t(key)),
  error: (key: string) => toast.error(i18n.t(key)),
  info: (key: string) => toast(i18n.t(key)),
}

// Usage:
import { showToast } from '@/lib/i18n-toast'
showToast.success('toast.gameSaved')
```

## Testing

### Verify Translations

1. Run the app: `npm run dev:all`
2. Click language switcher in Header
3. Verify that all texts change

### Find Missing Translations

```bash
# Find all t() calls in code
grep -r "t('" app/ components/ --include="*.tsx" --include="*.ts"

# Check if all keys exist in messages/*.json
```

## Common Mistakes

### ❌ Forgot `'use client'`

```tsx
// ❌ Doesn't work in server component
export default function Page() {
  const { t } = useTranslation() // Error!
  // ...
}

// ✅ Correct
'use client'
export default function Page() {
  const { t } = useTranslation() // Works!
  // ...
}
```

### ❌ Hardcoded text

```tsx
// ❌ Bad
<button>Create Lobby</button>

// ✅ Good
<button>{t('lobby.createNew')}</button>
```

### ❌ Wrong key

```tsx
// ❌ Key doesn't exist in JSON
<h1>{t('home.typo')}</h1>

// ✅ Check spelling
<h1>{t('home.title')}</h1>
```

## SEO and Metadata

For SEO, you need to dynamically change `<title>`, `<meta>`, etc. Example:

```tsx
// app/layout.tsx
'use client'
import { useTranslation } from 'react-i18next'
import Head from 'next/head'

export default function RootLayout({ children }) {
  const { t } = useTranslation()
  
  return (
    <html>
      <Head>
        <title>{t('meta.title')}</title>
        <meta name="description" content={t('meta.description')} />
      </Head>
      <body>{children}</body>
    </html>
  )
}
```

## Extension

### Adding a New Language

1. Create `messages/de.json` (for German)
2. Update `i18n.ts`:
```typescript
export const locales = ['en', 'uk', 'de'] as const
```
3. Add button in LanguageSwitcher:
```tsx
{loc === 'de' ? 'DE' : '...'}
```

### Dates and Numbers

For date formatting:

```tsx
const { t, i18n } = useTranslation()

new Date().toLocaleDateString(i18n.language)
// 'en' → "12/1/2025"
// 'uk' → "01.12.2025"
```

## Implementation Status

### ✅ Completed
- [x] Header and navigation
- [x] Language switcher
- [x] HeroSection

### 🔄 In Progress
- [ ] FeaturesGrid
- [ ] HowItWorks
- [ ] Games page
- [ ] Auth forms
- [ ] Lobby & Chat
- [ ] Yahtzee scorecard

### 📋 Planned
- [ ] Toast notifications
- [ ] Email templates
- [ ] Error messages
- [ ] Bot messages

## Useful Links

- [react-i18next documentation](https://react.i18next.com/)
- [i18next plural forms](https://www.i18next.com/translation-function/plurals)
- [Language detector](https://github.com/i18next/i18next-browser-languageDetector)

## Support

If you encounter issues:
1. Check browser console for errors
2. Verify that key exists in `messages/*.json`
3. Ensure component has `'use client'`
4. Restart dev server after JSON changes

---

**Made with ❤️ for Boardly**
