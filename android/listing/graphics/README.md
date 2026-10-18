# Google Play listing graphics

Everything here is drawn by `scripts/generate-play-listing-art.ts`; edit the script, not the PNGs.

## Upload map

| Play Console slot | File |
|---|---|
| App icon | `icon-512.png` |
| Feature graphic, en-US (default) | `feature-graphic-1024x500.png` |
| Feature graphic, other languages | `feature-graphic-1024x500-<lang>.png` |
| Phone screenshots, in this order | `screenshots/<lang>/01…06-*.png` |

Site language → Play Console language: `en` → en-US, `no` → no-NO, `uk` → uk, `ru` → ru-RU, `de` → de-DE, `es` → es-ES.

| # | Screen | Caption (locale key, so every translation is the site's own) |
|---|---|---|
| 01 | Connect Four against a bot, mid-game | `home.statsBotsAvailable` |
| 02 | Waiting room after a friend joined | `auth.login.heroChipGuests` |
| 03 | Checkers against a bot, mid-game, the bot's last move highlighted | `games.checkers.detail.step4Title` |
| 04 | Game picker | `home.chooseWhatToPlay` |
| 05 | Guess the Spy, how to play | `home.marquee.findTheSpy` |
| 06 | Tic-Tac-Toe against a bot, mid-game | `home.marquee.quickTicTacToe` |

Four of the six are game screens; the first three are what Play needs (three 9:16 portrait shots of at least 1080×1920) for a game to show in its screenshot-based recommendation formats.

## What the art is

- **Icon:** `assets/brand/tile.svg` on the opaque `--bd-bg` ground, the mark on the 384px keyline grid. Play rounds the corners (30%) and adds the shadow itself; a transparent icon would show Play's own background around the tile.
- **Feature graphic:** the B tile and wordmark as in the site header, `home.heroTagline` in the language, six game glyphs from `components/GameIcon.tsx`. No price, ranking or "free" wording.
- **Screenshots:** production `https://boardly.online` in Play mode (`data-app-shell="play"` is checked before every capture), 360×640 CSS pixels at 3×, Android Chrome user agent, light theme. A caption band of 330px (17%; Play's limit for taglines is 20%) sits over the screen, scaled to 844×1500. Captions were chosen over raw shots because Play shows screenshots at thumbnail size, where the UI text cannot be read but a caption can. The floating feedback button and toasts are hidden in the captures; the rest is the live UI.
- **No third-party game names, no "no download":** before every capture the script fails if a visible, uncovered line of text holds "Yahtzee", "Yatzy", the game's localized name, or the site's "no download" / "play in the browser" / "installs needed" copy. That is why there is no dice game and no home shot: every scroll position of the home page shows one of them (the hero subtitle, the stats, the marquee, the game cards, how-it-works, the CTA, the FAQ), and its demo board carries an English sticker in every language.

## Files

Checked with `sips -g pixelWidth -g pixelHeight -g hasAlpha` and `file`. Play wants the icon as 32-bit PNG with alpha (≤1 MB) and the feature graphic and screenshots as 24-bit PNG without alpha (8 MB at most); `file` counts bits per channel, so 8-bit RGBA is 32-bit and 8-bit RGB is 24-bit. Total 11.8 MB.

| File | Pixels | Alpha | PNG | Size |
|---|---|---|---|---|
| `icon-512.png` | 512×512 | yes | 8-bit RGBA | 11 KB |
| `feature-graphic-1024x500.png` | 1024×500 | no | 8-bit RGB | 180 KB |
| `feature-graphic-1024x500-no.png` | 1024×500 | no | 8-bit RGB | 178 KB |
| `feature-graphic-1024x500-uk.png` | 1024×500 | no | 8-bit RGB | 179 KB |
| `feature-graphic-1024x500-ru.png` | 1024×500 | no | 8-bit RGB | 178 KB |
| `feature-graphic-1024x500-de.png` | 1024×500 | no | 8-bit RGB | 185 KB |
| `feature-graphic-1024x500-es.png` | 1024×500 | no | 8-bit RGB | 188 KB |
| `screenshots/en/01-connect-four.png` | 1080×1920 | no | 8-bit RGB | 354 KB |
| `screenshots/en/02-lobby.png` | 1080×1920 | no | 8-bit RGB | 296 KB |
| `screenshots/en/03-checkers.png` | 1080×1920 | no | 8-bit RGB | 283 KB |
| `screenshots/en/04-games.png` | 1080×1920 | no | 8-bit RGB | 237 KB |
| `screenshots/en/05-spy-rules.png` | 1080×1920 | no | 8-bit RGB | 392 KB |
| `screenshots/en/06-tic-tac-toe.png` | 1080×1920 | no | 8-bit RGB | 242 KB |
| `screenshots/no/01-connect-four.png` | 1080×1920 | no | 8-bit RGB | 353 KB |
| `screenshots/no/02-lobby.png` | 1080×1920 | no | 8-bit RGB | 299 KB |
| `screenshots/no/03-checkers.png` | 1080×1920 | no | 8-bit RGB | 285 KB |
| `screenshots/no/04-games.png` | 1080×1920 | no | 8-bit RGB | 233 KB |
| `screenshots/no/05-spy-rules.png` | 1080×1920 | no | 8-bit RGB | 407 KB |
| `screenshots/no/06-tic-tac-toe.png` | 1080×1920 | no | 8-bit RGB | 242 KB |
| `screenshots/uk/01-connect-four.png` | 1080×1920 | no | 8-bit RGB | 350 KB |
| `screenshots/uk/02-lobby.png` | 1080×1920 | no | 8-bit RGB | 301 KB |
| `screenshots/uk/03-checkers.png` | 1080×1920 | no | 8-bit RGB | 288 KB |
| `screenshots/uk/04-games.png` | 1080×1920 | no | 8-bit RGB | 241 KB |
| `screenshots/uk/05-spy-rules.png` | 1080×1920 | no | 8-bit RGB | 387 KB |
| `screenshots/uk/06-tic-tac-toe.png` | 1080×1920 | no | 8-bit RGB | 242 KB |
| `screenshots/ru/01-connect-four.png` | 1080×1920 | no | 8-bit RGB | 352 KB |
| `screenshots/ru/02-lobby.png` | 1080×1920 | no | 8-bit RGB | 304 KB |
| `screenshots/ru/03-checkers.png` | 1080×1920 | no | 8-bit RGB | 290 KB |
| `screenshots/ru/04-games.png` | 1080×1920 | no | 8-bit RGB | 253 KB |
| `screenshots/ru/05-spy-rules.png` | 1080×1920 | no | 8-bit RGB | 392 KB |
| `screenshots/ru/06-tic-tac-toe.png` | 1080×1920 | no | 8-bit RGB | 243 KB |
| `screenshots/de/01-connect-four.png` | 1080×1920 | no | 8-bit RGB | 359 KB |
| `screenshots/de/02-lobby.png` | 1080×1920 | no | 8-bit RGB | 307 KB |
| `screenshots/de/03-checkers.png` | 1080×1920 | no | 8-bit RGB | 292 KB |
| `screenshots/de/04-games.png` | 1080×1920 | no | 8-bit RGB | 234 KB |
| `screenshots/de/05-spy-rules.png` | 1080×1920 | no | 8-bit RGB | 414 KB |
| `screenshots/de/06-tic-tac-toe.png` | 1080×1920 | no | 8-bit RGB | 249 KB |
| `screenshots/es/01-connect-four.png` | 1080×1920 | no | 8-bit RGB | 360 KB |
| `screenshots/es/02-lobby.png` | 1080×1920 | no | 8-bit RGB | 317 KB |
| `screenshots/es/03-checkers.png` | 1080×1920 | no | 8-bit RGB | 289 KB |
| `screenshots/es/04-games.png` | 1080×1920 | no | 8-bit RGB | 251 KB |
| `screenshots/es/05-spy-rules.png` | 1080×1920 | no | 8-bit RGB | 398 KB |
| `screenshots/es/06-tic-tac-toe.png` | 1080×1920 | no | 8-bit RGB | 252 KB |

## Regenerate

```bash
npx tsx scripts/generate-play-listing-art.ts                           # icon + feature graphics (offline apart from loading boardly.online for its fonts)
npx tsx scripts/generate-play-listing-art.ts --screenshots             # also all 36 screenshots, about six minutes
npx tsx scripts/generate-play-listing-art.ts --screenshots --langs de --only checkers,lobby
npx tsx scripts/generate-play-listing-art.ts --compose-only            # re-caption the raw captures in tmp/play-listing/raw
```

The screenshot run plays on production as two guests, Mira (host) and Jonas (friend), whose sessions it keeps in `tmp/play-listing/` (gitignored), so a rerun reuses them. It opens a Connect Four, a Checkers and a Tic-Tac-Toe lobby, plays a few moves against the bot in each, leaves both and posts no chat message. Chromium starts with `--use-mock-keychain`, so macOS never asks for the keychain.
