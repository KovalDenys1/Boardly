# PWA Support (Issue #44)

Updated: 2026-02-25

## Implemented

- Web app manifest: `public/manifest.json`
- App icons: `public/icons/*` (PNG + SVG, including maskable variants)
- Service worker: `public/sw.js`
- Offline fallback page: `public/offline.html`
- Service worker registration: `components/PwaServiceWorker.tsx`
- Install prompt UI: `components/InstallPrompt.tsx`
- Root layout PWA meta tags + iOS splash screen links: `app/layout.tsx`

## Current Caching Strategy

- `Network-first` for navigations (pages)
- `Cache-first` for same-origin static assets:
  - `/_next/static/*`
  - `/icons/*`
  - `/sounds/*`
  - common image/font/script/style file extensions
- API routes (`/api/*`) are excluded from SW caching

## Regenerating PWA Assets (Windows)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-pwa-assets.ps1
```

This regenerates:

- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/icon-maskable-192.png`
- `public/icons/icon-maskable-512.png`
- `public/splash/apple-splash-*.png`

## Manual QA Checklist (Required Before Closing #44)

- Android Chrome: install prompt appears and app installs
- iOS Safari: "Add to Home Screen" works and splash screen is shown on launch
- Desktop Chrome: install prompt / install icon works
- Offline mode: disconnect network, navigate to cached page, and verify offline fallback for uncached navigation
- Lighthouse PWA audit: target `> 90`
- Production deploy verification (HTTPS origin + service worker active)

## Notes / Remaining Limits

- Push notifications are not part of this issue's current implementation
- iOS install prompt is manual (Safari does not support `beforeinstallprompt`)
