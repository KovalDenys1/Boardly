# Liar's Party UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete UI layer for Liar's Party (#259) — lobby page covering all game phases, games hub pages, and translations.

**Architecture:** `LiarsPartyPage` follows `alias-page.tsx` exactly: own Socket.IO connection, `loadLobby()`, `applyAuthoritativeState()`, `handleMove()`. Phase-specific screens are named function components inside the same file. `LobbyPageClient.tsx` routes `gameType === 'liars_party'` directly to `LiarsPartyPage`. Two hub pages follow the `alias` pattern.

**Tech Stack:** Next.js, Socket.IO, React, TypeScript, Tailwind CSS

---

## File Map

| Action | Path |
|--------|------|
| Create | `app/lobby/[code]/liars-party-page.tsx` |
| Create | `__tests__/app/liars-party-page.test.tsx` |
| Modify | `app/lobby/[code]/LobbyPageClient.tsx` |
| Create | `app/games/liars-party/page.tsx` |
| Create | `app/games/liars-party/lobbies/page.tsx` |
| Modify | `app/games/page.tsx` |
| Modify | `locales/en.ts`, `locales/ru.ts`, `locales/uk.ts`, `locales/no.ts` |

---

## Task 1: Translations

**Files:**
- Modify: `locales/en.ts`
- Modify: `locales/ru.ts`
- Modify: `locales/uk.ts`
- Modify: `locales/no.ts`

Add `liarsParty:` top-level section (sibling of `alias:`) and `games.liars_party.lobbies` nested keys (sibling of `games.liars_party.name/description/difficulty`).

- [ ] **Step 1: Add `liarsParty:` section and lobbies keys to `locales/en.ts`**

Find the `alias:` section (around line 1510 in `en.ts`) and add after it:

```typescript
  liarsParty: {
    waitingForPlayers: 'Waiting for players...',
    roundsCount: '{{count}} rounds',
    eliminatedAfter: 'eliminated after {{count}} strikes',
    startGame: 'Start Game',
    needMorePlayers: 'Need at least 4 players to start',
    yourTurnToClaim: 'Your turn to make a claim!',
    isClaimingFor: '{{name}} is making a claim...',
    claimPlaceholder: 'Write your claim...',
    truth: 'Truth',
    bluff: 'Bluff',
    submitClaim: 'Submit Claim',
    charsRemaining: '{{count}} chars remaining',
    challengeOrBelieve: 'Challenge or Believe?',
    challenge: 'Challenge 🔥',
    believe: 'Believe ✓',
    voted: '{{done}}/{{total}} voted',
    waitingForVotes: 'Waiting for others to vote...',
    youVoted: 'You voted: {{decision}}',
    wasBluff: 'BLUFF 🎭',
    wasTruth: 'TRUTH ✓',
    nextRound: 'Next Round →',
    seeResults: 'See Final Results',
    waitingForHost: 'Waiting for host...',
    round: 'Round {{current}} / {{total}}',
    eliminated: 'You were eliminated',
    eliminatedAt: 'Eliminated in Round {{round}}',
    strikes: '{{count}} / {{max}} strikes',
    wins: '{{name}} wins!',
    playAgain: 'Play Again',
    lastPlayerStanding: 'Last player standing!',
    maxRoundsReached: 'All rounds complete',
    rank: '#{{position}}',
    rules: 'Rules',
    voteBreakdown: 'Vote Breakdown',
    scoreDelta: 'Points this round',
    totalScores: 'Total Scores',
    eliminatedThisRound: 'Eliminated this round',
    timeLeft: '{{seconds}}s',
  },
```

Also find `games.liars_party` (around line 591 in `en.ts`) which currently has only `name`, `description`, `difficulty`, and add `lobbies:` nested inside it:

```typescript
    liars_party: {
      name: 'Liar\'s Party',
      description: 'Bluff, read the room, and catch the best liars before they fool everyone.',
      difficulty: 'Hard',
      lobbies: {
        title: 'Liar\'s Party',
        subtitle: 'Join a game or create your own lobby!',
        subtitleGuest: 'Browse lobbies and sign in when you want to host or join.',
        backToGames: 'Back to Games',
        wantToPlay: 'Want to play?',
        wantToPlayDesc: 'Sign in or create an account to host lobbies and join games.',
        signIn: 'Sign In',
        createAccount: 'Create Account',
        createNewLobby: 'Create New Lobby',
        createDescription: 'Start your own Liar\'s Party game and invite friends to join!',
        createNow: 'Create Now',
        quickJoin: 'Quick Join',
        quickJoinDesc: 'Have a lobby code? Enter it below to join instantly!',
        enterCode: 'Enter 4-digit code',
        signInToJoin: 'Please sign in before joining a lobby.',
        activeLobbies: 'Active Lobbies',
        noLobbiesTitle: 'No active lobbies right now. Be the first to start a game!',
        createFirstLobby: 'Create First Lobby',
        host: 'Host',
        waiting: 'Waiting',
        playing: 'Playing',
        full: 'Full',
        newGame: 'NEW GAME',
      },
    },
```

- [ ] **Step 2: Add same keys to `locales/ru.ts`**

After `alias:` section (around line 1498 in `ru.ts`):

```typescript
  liarsParty: {
    waitingForPlayers: 'Ожидание игроков...',
    roundsCount: '{{count}} раундов',
    eliminatedAfter: 'вылет после {{count}} страйков',
    startGame: 'Начать игру',
    needMorePlayers: 'Нужно минимум 4 игрока',
    yourTurnToClaim: 'Ваш ход — сделайте заявление!',
    isClaimingFor: '{{name}} делает заявление...',
    claimPlaceholder: 'Напишите заявление...',
    truth: 'Правда',
    bluff: 'Блеф',
    submitClaim: 'Отправить заявление',
    charsRemaining: 'ещё {{count}} символов',
    challengeOrBelieve: 'Блефует или говорит правду?',
    challenge: 'Блефует 🔥',
    believe: 'Верю ✓',
    voted: '{{done}}/{{total}} проголосовали',
    waitingForVotes: 'Ожидание остальных...',
    youVoted: 'Ваш голос: {{decision}}',
    wasBluff: 'БЛЕФ 🎭',
    wasTruth: 'ПРАВДА ✓',
    nextRound: 'Следующий раунд →',
    seeResults: 'Итоги игры',
    waitingForHost: 'Ожидание хоста...',
    round: 'Раунд {{current}} / {{total}}',
    eliminated: 'Вы выбыли',
    eliminatedAt: 'Выбыли в раунде {{round}}',
    strikes: '{{count}} / {{max}} страйков',
    wins: '{{name}} побеждает!',
    playAgain: 'Играть ещё',
    lastPlayerStanding: 'Последний в игре!',
    maxRoundsReached: 'Все раунды завершены',
    rank: '№{{position}}',
    rules: 'Правила',
    voteBreakdown: 'Результаты голосования',
    scoreDelta: 'Очки за раунд',
    totalScores: 'Итоговый счёт',
    eliminatedThisRound: 'Выбыли в этом раунде',
    timeLeft: '{{seconds}}с',
  },
```

Also add `lobbies:` inside `games.liars_party` (around line 591 in `ru.ts`):

```typescript
    liars_party: {
      name: 'Вечеринка лжецов',
      description: 'Блефуйте, читайте эмоции игроков и ловите лучших лжецов до финала.',
      difficulty: 'Сложная',
      lobbies: {
        title: 'Вечеринка лжецов',
        subtitle: 'Присоединяйтесь к игре или создайте своё лобби!',
        subtitleGuest: 'Смотрите лобби и войдите, чтобы принять участие.',
        backToGames: 'К играм',
        wantToPlay: 'Хотите играть?',
        wantToPlayDesc: 'Войдите или создайте аккаунт, чтобы создавать лобби и присоединяться к играм.',
        signIn: 'Войти',
        createAccount: 'Создать аккаунт',
        createNewLobby: 'Создать лобби',
        createDescription: 'Начните свою игру и пригласите друзей!',
        createNow: 'Создать',
        quickJoin: 'Быстрое подключение',
        quickJoinDesc: 'Есть код лобби? Введите его ниже!',
        enterCode: 'Введите 4-значный код',
        signInToJoin: 'Войдите, чтобы присоединиться к лобби.',
        activeLobbies: 'Активные лобби',
        noLobbiesTitle: 'Нет активных лобби. Создайте первым!',
        createFirstLobby: 'Создать первое лобби',
        host: 'Хост',
        waiting: 'Ожидание',
        playing: 'Играют',
        full: 'Полное',
        newGame: 'НОВАЯ ИГРА',
      },
    },
```

- [ ] **Step 3: Add same keys to `locales/uk.ts`**

After `alias:` section in `uk.ts`:

```typescript
  liarsParty: {
    waitingForPlayers: 'Очікування гравців...',
    roundsCount: '{{count}} раундів',
    eliminatedAfter: 'вибуття після {{count}} страйків',
    startGame: 'Почати гру',
    needMorePlayers: 'Потрібно мінімум 4 гравці',
    yourTurnToClaim: 'Ваш хід — зробіть заяву!',
    isClaimingFor: '{{name}} робить заяву...',
    claimPlaceholder: 'Напишіть заяву...',
    truth: 'Правда',
    bluff: 'Блеф',
    submitClaim: 'Надіслати заяву',
    charsRemaining: 'ще {{count}} символів',
    challengeOrBelieve: 'Блефує чи говорить правду?',
    challenge: 'Блефує 🔥',
    believe: 'Вірю ✓',
    voted: '{{done}}/{{total}} проголосували',
    waitingForVotes: 'Очікування інших...',
    youVoted: 'Ваш голос: {{decision}}',
    wasBluff: 'БЛЕФ 🎭',
    wasTruth: 'ПРАВДА ✓',
    nextRound: 'Наступний раунд →',
    seeResults: 'Підсумки гри',
    waitingForHost: 'Очікування хоста...',
    round: 'Раунд {{current}} / {{total}}',
    eliminated: 'Ви вибули',
    eliminatedAt: 'Вибули в раунді {{round}}',
    strikes: '{{count}} / {{max}} страйків',
    wins: '{{name}} перемагає!',
    playAgain: 'Грати ще',
    lastPlayerStanding: 'Останній у грі!',
    maxRoundsReached: 'Всі раунди завершено',
    rank: '№{{position}}',
    rules: 'Правила',
    voteBreakdown: 'Результати голосування',
    scoreDelta: 'Очки за раунд',
    totalScores: 'Підсумковий рахунок',
    eliminatedThisRound: 'Вибули в цьому раунді',
    timeLeft: '{{seconds}}с',
  },
```

Also add `lobbies:` inside `games.liars_party` in `uk.ts`:

```typescript
    liars_party: {
      name: 'Вечірка брехунів',
      description: 'Блефуйте, читайте гравців і ловіть найкращих брехунів до фіналу.',
      difficulty: 'Складна',
      lobbies: {
        title: 'Вечірка брехунів',
        subtitle: 'Приєднуйтесь до гри або створіть власне лобі!',
        subtitleGuest: 'Перегляньте лобі та увійдіть, щоб грати.',
        backToGames: 'До ігор',
        wantToPlay: 'Хочете грати?',
        wantToPlayDesc: 'Увійдіть або створіть акаунт, щоб створювати лобі та приєднуватись до ігор.',
        signIn: 'Увійти',
        createAccount: 'Створити акаунт',
        createNewLobby: 'Створити лобі',
        createDescription: 'Розпочніть свою гру та запросіть друзів!',
        createNow: 'Створити',
        quickJoin: 'Швидке підключення',
        quickJoinDesc: 'Є код лобі? Введіть його нижче!',
        enterCode: 'Введіть 4-значний код',
        signInToJoin: 'Увійдіть, щоб приєднатись до лобі.',
        activeLobbies: 'Активні лобі',
        noLobbiesTitle: 'Немає активних лобі. Створіть першим!',
        createFirstLobby: 'Створити перше лобі',
        host: 'Хост',
        waiting: 'Очікування',
        playing: 'Грають',
        full: 'Повне',
        newGame: 'НОВА ГРА',
      },
    },
```

- [ ] **Step 4: Add same keys to `locales/no.ts`**

After `alias:` section in `no.ts`:

```typescript
  liarsParty: {
    waitingForPlayers: 'Venter på spillere...',
    roundsCount: '{{count}} runder',
    eliminatedAfter: 'eliminert etter {{count}} strikes',
    startGame: 'Start spillet',
    needMorePlayers: 'Trenger minst 4 spillere',
    yourTurnToClaim: 'Din tur — gjør en påstand!',
    isClaimingFor: '{{name}} gjør en påstand...',
    claimPlaceholder: 'Skriv din påstand...',
    truth: 'Sannhet',
    bluff: 'Bløff',
    submitClaim: 'Send påstand',
    charsRemaining: '{{count}} tegn igjen',
    challengeOrBelieve: 'Utfordre eller tro?',
    challenge: 'Utfordre 🔥',
    believe: 'Tro ✓',
    voted: '{{done}}/{{total}} stemt',
    waitingForVotes: 'Venter på andre...',
    youVoted: 'Du stemte: {{decision}}',
    wasBluff: 'BLØFF 🎭',
    wasTruth: 'SANNHET ✓',
    nextRound: 'Neste runde →',
    seeResults: 'Se sluttresultater',
    waitingForHost: 'Venter på verten...',
    round: 'Runde {{current}} / {{total}}',
    eliminated: 'Du er eliminert',
    eliminatedAt: 'Eliminert i runde {{round}}',
    strikes: '{{count}} / {{max}} strikes',
    wins: '{{name}} vinner!',
    playAgain: 'Spill igjen',
    lastPlayerStanding: 'Siste spiller igjen!',
    maxRoundsReached: 'Alle runder fullført',
    rank: '#{{position}}',
    rules: 'Regler',
    voteBreakdown: 'Stemmeoversikt',
    scoreDelta: 'Poeng denne runden',
    totalScores: 'Total poeng',
    eliminatedThisRound: 'Eliminert denne runden',
    timeLeft: '{{seconds}}s',
  },
```

Also add `lobbies:` inside `games.liars_party` in `no.ts`:

```typescript
    liars_party: {
      name: 'Liar\'s Party',
      description: 'Bløff, les rommet, og avsløre de beste løgnerne.',
      difficulty: 'Vanskelig',
      lobbies: {
        title: 'Liar\'s Party',
        subtitle: 'Bli med i et spill eller opprett ditt eget lobby!',
        subtitleGuest: 'Se lobbyer og logg inn for å spille.',
        backToGames: 'Tilbake til spill',
        wantToPlay: 'Vil du spille?',
        wantToPlayDesc: 'Logg inn eller opprett konto for å opprette lobbyer og bli med i spill.',
        signIn: 'Logg inn',
        createAccount: 'Opprett konto',
        createNewLobby: 'Opprett nytt lobby',
        createDescription: 'Start ditt eget spill og inviter venner!',
        createNow: 'Opprett nå',
        quickJoin: 'Rask tilkobling',
        quickJoinDesc: 'Har du en lobbykode? Skriv den inn nedenfor!',
        enterCode: 'Skriv inn 4-sifret kode',
        signInToJoin: 'Logg inn for å bli med i et lobby.',
        activeLobbies: 'Aktive lobbyer',
        noLobbiesTitle: 'Ingen aktive lobbyer. Vær den første til å starte!',
        createFirstLobby: 'Opprett første lobby',
        host: 'Vert',
        waiting: 'Venter',
        playing: 'Spiller',
        full: 'Full',
        newGame: 'NYTT SPILL',
      },
    },
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run ci:quick
```

Expected: no type errors related to the new keys.

- [ ] **Step 6: Commit**

```bash
git add locales/en.ts locales/ru.ts locales/uk.ts locales/no.ts
git commit -m "feat(#259): add liarsParty translations and lobbies locale keys"
```

---

## Task 2: LiarsPartyPage Component

**Files:**
- Create: `app/lobby/[code]/liars-party-page.tsx`

This is the main game page. It follows `alias-page.tsx` exactly except: no optimistic updates in `handleMove`, uses `LiarsPartyGame`, and contains 7 named screen components.

- [ ] **Step 1: Write the failing test** (write test file first — see Task 3, then come back to implement)

Actually: implement the component first, tests second. Proceed to Step 2.

- [ ] **Step 2: Create `app/lobby/[code]/liars-party-page.tsx`**

```tsx
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, type Socket } from 'socket.io-client'
import { useTranslation } from 'react-i18next'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { clientLogger } from '@/lib/client-logger'
import { showToast } from '@/lib/i18n-toast'
import { finalizePendingLobbyCreateMetric } from '@/lib/lobby-create-metrics'
import { trackMoveSubmitApplied } from '@/lib/analytics'
import LoadingSpinner from '@/components/LoadingSpinner'
import { LiarsPartyGame, type LiarsPartyGameData, type LiarsPartyRoundResult } from '@/lib/games/liars-party-game'

interface LiarsPartyPageProps {
  code: string
}

interface Lobby {
  id: string
  code: string
  gameType: string
  creatorId: string
  name: string
  isActive?: boolean
  turnTimer?: number
}

interface GamePlayer {
  id: string
  userId: string
  name: string
  user?: { username?: string }
}

interface Game {
  id: string
  status: string
  state: unknown
  players: GamePlayer[]
}

// ─── Screen components ────────────────────────────────────────────────────────

interface WaitingScreenProps {
  players: GamePlayer[]
  data: LiarsPartyGameData | undefined
  isHost: boolean
  isStarting: boolean
  onStart: () => void
  onLeave: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

function WaitingScreen({ players, data, isHost, isStarting, onStart, onLeave, t }: WaitingScreenProps) {
  const maxRounds = data?.maxRounds ?? 10
  const eliminationThreshold = data?.eliminationThreshold ?? 2
  const rules = [
    'Each round, one active player becomes the claimant and submits one claim.',
    'Other active players submit one vote: challenge or believe.',
    'A bluff is considered caught only when challengers are a strict majority.',
    'Wrong votes lose points; correct reads gain points; repeated caught bluffs add strikes.',
    'A player is eliminated after reaching strike limit.',
  ]

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-waiting-room"
    >
      <h1 className="text-3xl font-bold text-white drop-shadow">🎭 Liar&apos;s Party</h1>

      <div className="bg-white/10 backdrop-blur rounded-xl p-4 w-full max-w-sm text-white text-center">
        <div className="text-lg font-semibold mb-1">{players.length} / 12</div>
        <div className="text-sm text-white/80">
          {t('liarsParty.roundsCount', { count: maxRounds })} · {t('liarsParty.eliminatedAfter', { count: eliminationThreshold })}
        </div>
      </div>

      <div className="bg-white/10 backdrop-blur rounded-xl p-4 w-full max-w-sm text-white">
        <div className="font-semibold mb-3">{t('liarsParty.rules')}</div>
        <ol className="space-y-1.5">
          {rules.map((rule, i) => (
            <li key={i} className="text-sm text-white/85 flex gap-2">
              <span className="font-bold shrink-0">{i + 1}.</span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="bg-white/10 backdrop-blur rounded-xl p-4 w-full max-w-sm text-white">
        <div className="font-semibold mb-2">Players ({players.length})</div>
        <div className="space-y-1">
          {players.map(p => (
            <div key={p.id} className="text-sm text-white/90">{p.name}</div>
          ))}
        </div>
      </div>

      {isHost ? (
        <button
          onClick={onStart}
          disabled={isStarting || players.length < 4}
          className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
        >
          {isStarting ? t('common.loading') : t('liarsParty.startGame')}
        </button>
      ) : (
        <p className="text-white/80 text-sm">{t('liarsParty.waitingForPlayers')}</p>
      )}
      {players.length < 4 && isHost && (
        <p className="text-white/70 text-xs">{t('liarsParty.needMorePlayers')}</p>
      )}
      <button onClick={onLeave} className="text-sm text-white/70 underline">
        {t('lobby.leave')}
      </button>
    </div>
  )
}

interface ClaimScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  currentUserId: string
  isMoveSubmitting: boolean
  timerRemaining: number
  onSubmitClaim: (claim: string, isBluff: boolean) => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

function ClaimScreen({ data, players, currentUserId, isMoveSubmitting, timerRemaining, onSubmitClaim, t }: ClaimScreenProps) {
  const [claimText, setClaimText] = useState('')
  const [isBluffSelected, setIsBluffSelected] = useState<boolean | null>(null)
  const isClaimant = data.currentClaimantId === currentUserId
  const claimantPlayer = players.find(p => p.userId === data.currentClaimantId || p.id === data.currentClaimantId)
  const claimantName = claimantPlayer?.name ?? data.currentClaimantId
  const charCount = claimText.length
  const canSubmit = charCount >= 5 && charCount <= 180 && isBluffSelected !== null && !isMoveSubmitting

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-claim-screen"
    >
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>

      {isClaimant ? (
        <>
          <h2 className="text-2xl font-bold text-white">{t('liarsParty.yourTurnToClaim')}</h2>
          <div className="w-full max-w-md">
            <textarea
              className="w-full rounded-xl bg-white/20 border border-white/30 text-white placeholder-white/60 p-4 text-base resize-none focus:outline-none focus:ring-2 focus:ring-white/50"
              rows={4}
              placeholder={t('liarsParty.claimPlaceholder')}
              maxLength={180}
              value={claimText}
              onChange={e => setClaimText(e.target.value)}
            />
            <div className="text-right text-white/60 text-xs mt-1">
              {t('liarsParty.charsRemaining', { count: 180 - charCount })}
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsBluffSelected(false)}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${isBluffSelected === false ? 'bg-white text-green-600 scale-105 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              ✓ {t('liarsParty.truth')}
            </button>
            <button
              onClick={() => setIsBluffSelected(true)}
              className={`px-6 py-3 rounded-xl font-bold transition-all ${isBluffSelected === true ? 'bg-white text-rose-600 scale-105 shadow-lg' : 'bg-white/20 text-white hover:bg-white/30'}`}
            >
              🎭 {t('liarsParty.bluff')}
            </button>
          </div>
          <button
            onClick={() => isBluffSelected !== null && onSubmitClaim(claimText, isBluffSelected)}
            disabled={!canSubmit}
            className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {t('liarsParty.submitClaim')}
          </button>
        </>
      ) : (
        <p className="text-white text-xl">{t('liarsParty.isClaimingFor', { name: claimantName })}</p>
      )}
    </div>
  )
}

interface EliminatedClaimScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  timerRemaining: number
  t: (key: string, opts?: Record<string, unknown>) => string
}

function EliminatedClaimScreen({ data, players, timerRemaining, t }: EliminatedClaimScreenProps) {
  const claimantPlayer = players.find(p => p.userId === data.currentClaimantId || p.id === data.currentClaimantId)
  const claimantName = claimantPlayer?.name ?? data.currentClaimantId
  const eliminatedRound = data.eliminatedAtRound[data.currentClaimantId]

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-claim-screen"
    >
      <div
        className="w-full max-w-md bg-red-900/60 border border-red-400/50 rounded-xl p-4 text-white text-center"
        data-testid="eliminated-banner"
      >
        {t('liarsParty.eliminatedAt', { round: eliminatedRound ?? '?' })}
      </div>
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>
      <p className="text-white text-xl">{t('liarsParty.isClaimingFor', { name: claimantName })}</p>
    </div>
  )
}

interface ChallengeScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  currentUserId: string
  isMoveSubmitting: boolean
  timerRemaining: number
  onVote: (decision: 'challenge' | 'believe') => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

function ChallengeScreen({ data, players, currentUserId, isMoveSubmitting, timerRemaining, onVote, t }: ChallengeScreenProps) {
  const isClaimant = data.currentClaimantId === currentUserId
  const myVote = data.challengeVotes.find(v => v.playerId === currentUserId)
  const totalVoters = data.activePlayerIds.filter(id => id !== data.currentClaimantId).length
  const votedCount = data.challengeVotes.length

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-challenge-screen"
    >
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>

      <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-6 text-white">
        <div className="text-lg font-semibold mb-2">{t('liarsParty.challengeOrBelieve')}</div>
        <div className="text-xl text-white/90 italic mb-4">&ldquo;{data.claim?.text}&rdquo;</div>
        <div className="text-sm text-white/70">{t('liarsParty.voted', { done: votedCount, total: totalVoters })}</div>
      </div>

      {!isClaimant && !myVote && (
        <div className="flex gap-4">
          <button
            onClick={() => onVote('challenge')}
            disabled={isMoveSubmitting}
            className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold disabled:opacity-50 shadow-lg transition-all hover:scale-105"
          >
            {t('liarsParty.challenge')}
          </button>
          <button
            onClick={() => onVote('believe')}
            disabled={isMoveSubmitting}
            className="px-8 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold disabled:opacity-50 shadow-lg transition-all hover:scale-105"
          >
            {t('liarsParty.believe')}
          </button>
        </div>
      )}

      {!isClaimant && myVote && (
        <div className="text-white text-center">
          <div>{t('liarsParty.youVoted', { decision: myVote.decision })}</div>
          <div className="text-sm text-white/70 mt-1">{t('liarsParty.waitingForVotes')}</div>
        </div>
      )}

      {isClaimant && (
        <p className="text-white/80 text-sm">{t('liarsParty.waitingForVotes')}</p>
      )}
    </div>
  )
}

interface EliminatedChallengeScreenProps {
  data: LiarsPartyGameData
  timerRemaining: number
  t: (key: string, opts?: Record<string, unknown>) => string
}

function EliminatedChallengeScreen({ data, timerRemaining, t }: EliminatedChallengeScreenProps) {
  const totalVoters = data.activePlayerIds.filter(id => id !== data.currentClaimantId).length
  const votedCount = data.challengeVotes.length
  const eliminatedRound = data.eliminatedAtRound[data.currentClaimantId]

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-challenge-screen"
    >
      <div
        className="w-full max-w-md bg-red-900/60 border border-red-400/50 rounded-xl p-4 text-white text-center"
        data-testid="eliminated-banner"
      >
        {t('liarsParty.eliminatedAt', { round: eliminatedRound ?? '?' })}
      </div>
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>
      <div className="text-white text-2xl font-mono font-bold">{t('liarsParty.timeLeft', { seconds: timerRemaining })}</div>
      <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-6 text-white">
        <div className="text-xl text-white/90 italic mb-4">&ldquo;{data.claim?.text}&rdquo;</div>
        <div className="text-sm text-white/70">{t('liarsParty.voted', { done: votedCount, total: totalVoters })}</div>
      </div>
    </div>
  )
}

interface RevealScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  isHost: boolean
  isMoveSubmitting: boolean
  onAdvanceRound: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

function RevealScreen({ data, players, isHost, isMoveSubmitting, onAdvanceRound, t }: RevealScreenProps) {
  const lastResult: LiarsPartyRoundResult | undefined = data.roundResults[data.roundResults.length - 1]
  const isLastRound = data.currentRound >= data.maxRounds
  const eliminatedThisRound = lastResult
    ? players.filter(p => {
        const pid = p.userId || p.id
        return data.eliminatedPlayerIds.includes(pid) && data.eliminatedAtRound[pid] === lastResult.round
      })
    : []

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500 overflow-y-auto"
      data-testid="liars-party-reveal-screen"
    >
      <div className="text-white/80 text-sm font-mono">
        {t('liarsParty.round', { current: data.currentRound, total: data.maxRounds })}
      </div>

      {data.claim && (
        <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-5 text-white">
          <div className="text-xl italic mb-3">&ldquo;{data.claim.text}&rdquo;</div>
          <div className={`text-3xl font-extrabold ${data.claim.isBluff ? 'text-red-200' : 'text-green-200'}`}>
            {data.claim.isBluff ? t('liarsParty.wasBluff') : t('liarsParty.wasTruth')}
          </div>
        </div>
      )}

      {lastResult && (
        <>
          <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-5 text-white">
            <div className="font-semibold mb-3">{t('liarsParty.voteBreakdown')}</div>
            <div className="space-y-2">
              {data.challengeVotes.map(vote => {
                const voter = players.find(p => p.userId === vote.playerId || p.id === vote.playerId)
                const voterName = voter?.name ?? vote.playerId
                const correct = vote.decision === 'challenge' ? lastResult.bluffCaught : !lastResult.bluffCaught
                const delta = lastResult.voterScoreDeltas[vote.playerId] ?? 0
                return (
                  <div key={vote.playerId} className="flex items-center justify-between text-sm">
                    <span>{voterName}</span>
                    <span>{vote.decision === 'challenge' ? t('liarsParty.challenge') : t('liarsParty.believe')}</span>
                    <span>{correct ? '✓' : '✗'}</span>
                    <span className={delta >= 0 ? 'text-green-300' : 'text-red-300'}>{delta >= 0 ? `+${delta}` : delta}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="w-full max-w-md bg-white/10 backdrop-blur rounded-xl p-5 text-white">
            <div className="font-semibold mb-3">{t('liarsParty.totalScores')}</div>
            <div className="space-y-1">
              {data.activePlayerIds.map(pid => {
                const player = players.find(p => p.userId === pid || p.id === pid)
                const name = player?.name ?? pid
                const score = data.scores[pid] ?? 0
                const strikes = data.strikes[pid] ?? 0
                return (
                  <div key={pid} className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span>{score} pts · {t('liarsParty.strikes', { count: strikes, max: data.eliminationThreshold })}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {eliminatedThisRound.length > 0 && (
        <div className="w-full max-w-md bg-red-900/60 border border-red-400/50 rounded-xl p-4 text-white text-center">
          <div className="font-semibold mb-1">{t('liarsParty.eliminatedThisRound')}</div>
          {eliminatedThisRound.map(p => <div key={p.id} className="text-sm">{p.name}</div>)}
        </div>
      )}

      {isHost ? (
        <button
          onClick={onAdvanceRound}
          disabled={isMoveSubmitting}
          className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 shadow-lg"
        >
          {isLastRound ? t('liarsParty.seeResults') : t('liarsParty.nextRound')}
        </button>
      ) : (
        <p className="text-white/80 text-sm">{t('liarsParty.waitingForHost')}</p>
      )}
    </div>
  )
}

interface GameOverScreenProps {
  data: LiarsPartyGameData
  players: GamePlayer[]
  isHost: boolean
  isStarting: boolean
  onPlayAgain: () => void
  onBackToGames: () => void
  t: (key: string, opts?: Record<string, unknown>) => string
}

function GameOverScreen({ data, players, isHost, isStarting, onPlayAgain, onBackToGames, t }: GameOverScreenProps) {
  const winner = players.find(p => p.userId === data.winnerId || p.id === data.winnerId)
  const winnerName = winner?.name ?? data.winnerId ?? '?'

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 bg-gradient-to-br from-rose-500 to-orange-500"
      data-testid="liars-party-game-over-screen"
    >
      <div className="text-5xl">🎭</div>
      <h2 className="text-4xl font-extrabold text-white drop-shadow">
        {t('liarsParty.wins', { name: winnerName })}
      </h2>
      <div className="text-white/80 text-sm">
        {data.completionReason === 'last-player-standing'
          ? t('liarsParty.lastPlayerStanding')
          : t('liarsParty.maxRoundsReached')}
      </div>

      <div className="w-full max-w-sm bg-white/10 backdrop-blur rounded-xl p-5 text-white">
        <div className="space-y-2">
          {data.ranking.map((pid, idx) => {
            const player = players.find(p => p.userId === pid || p.id === pid)
            const name = player?.name ?? pid
            const score = data.scores[pid] ?? 0
            const strikes = data.strikes[pid] ?? 0
            return (
              <div key={pid} className="flex items-center justify-between text-sm">
                <span className="font-bold text-white/60">{t('liarsParty.rank', { position: idx + 1 })}</span>
                <span className="flex-1 ml-3">{name}</span>
                <span>{score} pts</span>
                <span className="text-white/60 ml-2">{t('liarsParty.strikes', { count: strikes, max: data.eliminationThreshold })}</span>
              </div>
            )
          })}
        </div>
      </div>

      {isHost && (
        <button
          onClick={onPlayAgain}
          disabled={isStarting}
          className="px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 shadow-lg"
        >
          {isStarting ? t('common.loading') : t('liarsParty.playAgain')}
        </button>
      )}
      <button onClick={onBackToGames} className="text-sm text-white/70 underline">
        {t('lobby.leave')}
      </button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LiarsPartyPage({ code }: LiarsPartyPageProps) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { isGuest, guestToken, guestId } = useGuest()
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameEngine, setGameEngine] = useState<LiarsPartyGame | null>(null)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isMoveSubmitting, setIsMoveSubmitting] = useState(false)

  // Timer tick — forces re-render every second for countdown displays
  const [, setTimerTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTimerTick(t => t + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const lifecycleRedirectInFlightRef = React.useRef(false)
  const activeGameIdRef = React.useRef<string | null>(null)
  const minPlayersRequired = 4

  const getCurrentUserId = useCallback(() => {
    return isGuest ? guestId : session?.user?.id
  }, [isGuest, guestId, session?.user?.id])

  const triggerLifecycleRedirect = useCallback((toastId: string) => {
    if (lifecycleRedirectInFlightRef.current) return
    lifecycleRedirectInFlightRef.current = true
    showToast.error('lobby.gameAbandoned', undefined, undefined, { id: toastId })
    router.replace('/games')
  }, [router])

  const applyAuthoritativeState = useCallback((gameId: string, authoritativeState: unknown) => {
    if (!authoritativeState || typeof authoritativeState !== 'object') return
    const fresh = new LiarsPartyGame(gameId)
    fresh.restoreState(authoritativeState as any)
    setGameEngine(fresh)
    setGame(prev => {
      if (!prev || prev.id !== gameId) return prev
      return { ...prev, status: fresh.getState().status, state: authoritativeState }
    })
  }, [])

  const loadLobby = useCallback(async () => {
    try {
      const res = await fetchWithGuest(`/api/lobby/${code}?includeFinished=true`)
      const data = await res.json()

      if (!res.ok) {
        clientLogger.error('LiarsPartyPage: failed to load lobby', data.error)
        showToast.error('errors.failedToLoad')
        router.push('/games')
        return
      }

      const { lobby: lobbyData, activeGame } = data as { lobby: Lobby; activeGame: Game | null }

      if (!lobbyData) {
        router.push('/games')
        return
      }

      setLobby(lobbyData)
      setGame(activeGame ?? null)
      if (typeof lobbyData.code === 'string') {
        finalizePendingLobbyCreateMetric({ lobbyCode: lobbyData.code, fallbackGameType: lobbyData.gameType })
      }

      if (activeGame?.state) {
        const parsedState = typeof activeGame.state === 'string'
          ? JSON.parse(activeGame.state || '{}')
          : activeGame.state
        if (parsedState && typeof parsedState === 'object') {
          const fresh = new LiarsPartyGame(activeGame.id)
          fresh.restoreState(parsedState)
          setGameEngine(fresh)
        }
      }

      setLoading(false)
    } catch (err) {
      clientLogger.error('LiarsPartyPage: loadLobby error', err)
      showToast.errorFrom(err, 'errors.failedToLoad')
      setLoading(false)
    }
  }, [code, router])

  useEffect(() => {
    activeGameIdRef.current = game?.id ?? null
  }, [game?.id])

  useEffect(() => {
    if (status === 'loading' || (status === 'unauthenticated' && !isGuest)) return
    if (isGuest && !guestToken) return

    let isMounted = true
    let activeSocket: Socket | null = null

    void loadLobby()

    const initSocket = async () => {
      const url = getBrowserSocketUrl()
      const useGuestAuth = isGuest && status !== 'authenticated'
      const socketAuth = await resolveSocketClientAuth({
        isGuest: useGuestAuth,
        guestToken: useGuestAuth ? guestToken : null,
      })

      if (!socketAuth || !isMounted) return

      const newSocket = io(url, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        auth: socketAuth.authPayload,
        query: socketAuth.queryPayload,
      })
      activeSocket = newSocket

      newSocket.on('connect', () => {
        clientLogger.log('✅ LiarsParty socket connected')
        newSocket.emit('join-lobby', code)
      })

      newSocket.on('game-update', (payload: Record<string, unknown>) => {
        const activeGameId = activeGameIdRef.current
        if (payload?.action === 'state-change' && activeGameId) {
          const state = (payload?.payload as Record<string, unknown>)?.state
          if (state) {
            applyAuthoritativeState(activeGameId, state)
            return
          }
        }
        void loadLobby()
      })

      newSocket.on('game-abandoned', (payload: { gameId: string; reason?: string }) => {
        clientLogger.log('📡 LiarsParty game abandoned', payload)
        void loadLobby()
        triggerLifecycleRedirect('liars-party-lifecycle-redirect')
      })

      newSocket.on('player-left', (payload: { userId: string; username?: string; remainingPlayers?: number }) => {
        clientLogger.log('📡 LiarsParty player left', payload)
        const name = payload.username
        if (name) showToast.info('toast.playerLeft', undefined, { player: name })
        if (typeof payload.remainingPlayers === 'number' && payload.remainingPlayers < minPlayersRequired) {
          triggerLifecycleRedirect('liars-party-lifecycle-redirect')
          return
        }
        void loadLobby()
      })

      newSocket.on('lobby-update', () => void loadLobby())
      newSocket.on('player-joined', () => void loadLobby())

      newSocket.on('disconnect', () => {
        clientLogger.log('❌ LiarsParty socket disconnected')
      })

      setSocket(newSocket)
    }

    void initSocket()

    return () => {
      isMounted = false
      if (activeSocket) {
        if (activeSocket.connected) {
          activeSocket.emit('leave-lobby', code)
        }
        activeSocket.disconnect()
      }
    }
  }, [status, isGuest, guestToken, code, loadLobby, applyAuthoritativeState, triggerLifecycleRedirect, minPlayersRequired])

  const handleMove = useCallback(async (type: string, payload: Record<string, unknown>) => {
    if (!game || isMoveSubmitting) return
    const userId = getCurrentUserId()
    if (!userId) return

    const move = { type, playerId: userId, data: payload, timestamp: new Date() }

    setIsMoveSubmitting(true)
    try {
      const res = await fetchWithGuest(`/api/game/${game.id}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, move, userId }),
      })

      trackMoveSubmitApplied({
        gameType: 'liars_party',
        moveType: type,
        durationMs: 0,
        isGuest,
        success: res.ok,
        applied: res.ok,
        statusCode: res.status,
        source: 'liars_party_page',
      })

      if (res.ok) {
        const result = await res.json()
        const authoritativeState = result?.game?.state
        if (authoritativeState) {
          applyAuthoritativeState(game.id, authoritativeState)
        }
      } else {
        clientLogger.error('LiarsParty move failed', { type })
        await loadLobby()
      }
    } catch (err) {
      clientLogger.error('LiarsPartyPage handleMove error', err)
      await loadLobby()
    } finally {
      setIsMoveSubmitting(false)
    }
  }, [game, getCurrentUserId, isGuest, isMoveSubmitting, applyAuthoritativeState, loadLobby])

  const handleStartGame = useCallback(async () => {
    if (!lobby?.id || isStarting) return
    setIsStarting(true)
    try {
      const res = await fetchWithGuest('/api/game/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameType: 'liars_party',
          lobbyId: lobby.id,
          config: { maxPlayers: 12, minPlayers: 4 },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast.error('toast.gameStartFailed', (err as Record<string, unknown>)?.error as string | undefined)
      }
    } catch (err) {
      showToast.errorFrom(err, 'toast.gameStartFailed')
    } finally {
      setIsStarting(false)
    }
  }, [lobby?.id, isStarting])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  const resolvedStatus = game?.status ?? 'waiting'
  const engineState = gameEngine?.getState()
  const data = engineState?.data as LiarsPartyGameData | undefined
  const currentUserId = getCurrentUserId() ?? ''
  const isHost = lobby?.creatorId === currentUserId
  const players = game?.players ?? []
  const isEliminated = data?.eliminatedPlayerIds.includes(currentUserId) ?? false

  const turnTimerSeconds = typeof lobby?.turnTimer === 'number' ? lobby.turnTimer : 60
  const lastMoveAt = (engineState as any)?.lastMoveAt as number | null
  const timerRemaining = lastMoveAt
    ? Math.max(0, turnTimerSeconds - Math.floor((Date.now() - lastMoveAt) / 1000))
    : turnTimerSeconds

  if (resolvedStatus === 'waiting') {
    return (
      <WaitingScreen
        players={players}
        data={data}
        isHost={isHost}
        isStarting={isStarting}
        onStart={handleStartGame}
        onLeave={() => router.push('/games')}
        t={t}
      />
    )
  }

  if (resolvedStatus === 'playing' && data) {
    if (data.phase === 'claim') {
      if (isEliminated) {
        return (
          <EliminatedClaimScreen
            data={data}
            players={players}
            timerRemaining={timerRemaining}
            t={t}
          />
        )
      }
      return (
        <ClaimScreen
          data={data}
          players={players}
          currentUserId={currentUserId}
          isMoveSubmitting={isMoveSubmitting}
          timerRemaining={timerRemaining}
          onSubmitClaim={(claim, isBluff) => handleMove('submit-claim', { claim, isBluff })}
          t={t}
        />
      )
    }

    if (data.phase === 'challenge') {
      if (isEliminated) {
        return (
          <EliminatedChallengeScreen
            data={data}
            timerRemaining={timerRemaining}
            t={t}
          />
        )
      }
      return (
        <ChallengeScreen
          data={data}
          players={players}
          currentUserId={currentUserId}
          isMoveSubmitting={isMoveSubmitting}
          timerRemaining={timerRemaining}
          onVote={(decision) => handleMove('submit-challenge', { decision })}
          t={t}
        />
      )
    }

    if (data.phase === 'reveal') {
      return (
        <RevealScreen
          data={data}
          players={players}
          isHost={isHost}
          isMoveSubmitting={isMoveSubmitting}
          onAdvanceRound={() => handleMove('advance-round', {})}
          t={t}
        />
      )
    }
  }

  if (resolvedStatus === 'finished' && data) {
    return (
      <GameOverScreen
        data={data}
        players={players}
        isHost={isHost}
        isStarting={isStarting}
        onPlayAgain={handleStartGame}
        onBackToGames={() => router.push('/games')}
        t={t}
      />
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner />
    </div>
  )
}
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
npm run ci:quick
```

Expected: no errors in `liars-party-page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/lobby/[code]/liars-party-page.tsx
git commit -m "feat(#259): add LiarsPartyPage component with all phase screens"
```

---

## Task 3: Tests

**Files:**
- Create: `__tests__/app/liars-party-page.test.tsx`
- Test: `__tests__/app/liars-party-page.test.tsx`

The test file mirrors `__tests__/app/alias-page.test.tsx` exactly.

- [ ] **Step 1: Write the test file**

```tsx
import { act, render, screen, waitFor } from '@testing-library/react'
import LiarsPartyLobbyPage from '@/app/lobby/[code]/liars-party-page'
import { fetchWithGuest } from '@/lib/fetch-with-guest'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { io } from 'socket.io-client'
import { showToast } from '@/lib/i18n-toast'

const mockReplace = jest.fn()
const mockPush = jest.fn()
const mockPrefetch = jest.fn()
const socketHandlers: Record<string, (payload?: any) => void> = {}
const mockSocket: any = {
  on: jest.fn((event: string, handler: (payload?: any) => void) => {
    socketHandlers[event] = handler
    return mockSocket
  }),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
  close: jest.fn(),
  connected: true,
}

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
    prefetch: mockPrefetch,
  }),
}))

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1' } },
    status: 'authenticated',
  }),
}))

jest.mock('@/contexts/GuestContext', () => ({
  useGuest: () => ({
    isGuest: false,
    guestToken: null,
    guestId: null,
    guestName: null,
  }),
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`
      return key
    },
  }),
}))

jest.mock('@/lib/i18n-toast', () => ({
  showToast: {
    error: jest.fn(),
    errorFrom: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}))

jest.mock('@/lib/fetch-with-guest', () => ({
  fetchWithGuest: jest.fn(),
}))

jest.mock('@/lib/socket-client-auth', () => ({
  resolveSocketClientAuth: jest.fn(),
}))

jest.mock('@/lib/socket-url', () => ({
  getBrowserSocketUrl: jest.fn(() => 'http://socket.test'),
}))

jest.mock('@/lib/client-logger', () => ({
  clientLogger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

jest.mock('@/lib/lobby-create-metrics', () => ({
  finalizePendingLobbyCreateMetric: jest.fn(),
}))

jest.mock('@/lib/analytics', () => ({
  trackMoveSubmitApplied: jest.fn(),
}))

jest.mock('@/components/LoadingSpinner', () => ({
  __esModule: true,
  default: () => <div data-testid="loading-spinner" />,
}))

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

function buildLobbyResponse() {
  return {
    lobby: {
      id: 'lobby-1',
      code: 'ABCD',
      gameType: 'liars_party',
      creatorId: 'user-1',
      name: 'Test Lobby',
      isActive: true,
      turnTimer: 60,
    },
    activeGame: {
      id: 'game-1',
      status: 'waiting',
      state: {
        status: 'waiting',
        currentPlayerIndex: 0,
        players: [],
        lastMoveAt: null,
        data: {
          phase: 'claim',
          currentRound: 1,
          maxRounds: 10,
          eliminationThreshold: 2,
          claimantOrder: [],
          currentClaimantId: '',
          currentClaimantIndex: 0,
          activePlayerIds: [],
          eliminatedPlayerIds: [],
          eliminatedAtRound: {},
          claim: null,
          challengeVotes: [],
          submittedPlayerIds: [],
          currentRoundResolved: false,
          roundResults: [],
          scores: {},
          strikes: {},
          winnerId: null,
          ranking: [],
          completionReason: null,
          finishedAt: null,
          isMvpScaffold: true,
        },
      },
      players: [
        { id: 'player-1', userId: 'user-1', name: 'Alice', user: { username: 'Alice' } },
        { id: 'player-2', userId: 'user-2', name: 'Bob', user: { username: 'Bob' } },
        { id: 'player-3', userId: 'user-3', name: 'Carol', user: { username: 'Carol' } },
        { id: 'player-4', userId: 'user-4', name: 'Dave', user: { username: 'Dave' } },
      ],
    },
  }
}

describe('LiarsPartyLobbyPage', () => {
  const mockFetchWithGuest = fetchWithGuest as jest.MockedFunction<typeof fetchWithGuest>
  const mockResolveSocketClientAuth = resolveSocketClientAuth as jest.MockedFunction<typeof resolveSocketClientAuth>
  const mockIo = io as jest.MockedFunction<typeof io>
  const toast = showToast as jest.Mocked<typeof showToast>

  beforeEach(() => {
    jest.clearAllMocks()
    Object.keys(socketHandlers).forEach((key) => delete socketHandlers[key])
    mockResolveSocketClientAuth.mockResolvedValue({
      authPayload: { userId: 'user-1' },
      queryPayload: {},
    })
    mockFetchWithGuest.mockResolvedValue({
      ok: true,
      json: async () => buildLobbyResponse(),
    } as Response)
  })

  it('renders the waiting room', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())
  })

  it('redirects away when the socket reports an abandoned game', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      socketHandlers['game-abandoned']?.({ gameId: 'game-1', reason: 'insufficient_players' })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'lobby.gameAbandoned',
        undefined,
        undefined,
        { id: 'liars-party-lifecycle-redirect' }
      )
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })

  it('redirects when a player leaves and remaining players drop below minimum', async () => {
    render(<LiarsPartyLobbyPage code="ABCD" />)
    await waitFor(() => expect(mockIo).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('liars-party-waiting-room')).toBeTruthy())

    act(() => {
      socketHandlers['player-left']?.({ userId: 'user-4', username: 'Dave', remainingPlayers: 3 })
    })

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('toast.playerLeft', undefined, { player: 'Dave' })
      expect(mockReplace).toHaveBeenCalledWith('/games')
    })
  })
})
```

- [ ] **Step 2: Run tests — verify they fail (component not wired yet)**

```bash
npm test -- --testPathPattern="liars-party-page" --no-coverage
```

Expected: 3 tests fail (import resolves but tests may pass once component exists — if tests pass, proceed to next task).

- [ ] **Step 3: Run tests — verify they pass**

```bash
npm test -- --testPathPattern="liars-party-page" --no-coverage
```

Expected: 3/3 PASS.

- [ ] **Step 4: Commit**

```bash
git add __tests__/app/liars-party-page.test.tsx
git commit -m "test(#259): add LiarsPartyPage lifecycle tests"
```

---

## Task 4: Wire into LobbyPageClient

**Files:**
- Modify: `app/lobby/[code]/LobbyPageClient.tsx`

Add dynamic import and routing — exactly the pattern used for `AliasLobbyPage` (lines 131–134 and 2223–2225).

- [ ] **Step 1: Add dynamic import after the `AliasLobbyPage` import (around line 134)**

Find this block in `LobbyPageClient.tsx`:
```typescript
const AliasLobbyPage = dynamic(
  () => import('./alias-page'),
  { loading: () => <CenteredLoadingFallback /> }
)
```

Add immediately after:
```typescript
const LiarsPartyLobbyPage = dynamic(
  () => import('./liars-party-page'),
  { loading: () => <CenteredLoadingFallback /> }
)
```

- [ ] **Step 2: Add routing after the `alias` check (around line 2224)**

Find this block:
```typescript
  if (gameType === 'alias') {
    return <AliasLobbyPage code={code} />
  }
```

Add immediately after:
```typescript
  if (gameType === 'liars_party') {
    return <LiarsPartyLobbyPage code={code} />
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run ci:quick
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lobby/[code]/LobbyPageClient.tsx
git commit -m "feat(#259): route liars_party game type to LiarsPartyPage in LobbyPageClient"
```

---

## Task 5: Games Hub Info Page

**Files:**
- Create: `app/games/liars-party/page.tsx`

Follows `app/games/alias/page.tsx` exactly — static metadata page with JSON-LD, breadcrumb, hero, facts grid, rules section, secondary CTA.

- [ ] **Step 1: Create `app/games/liars-party/page.tsx`**

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Play Liar\'s Party Online Free - Social Bluffing Party Game',
  description:
    'Play Liar\'s Party online with friends for free! 4–12 players, real-time bluffing and voting. Make claims, challenge liars, and survive elimination. No download needed. Start on Boardly now!',
  keywords: [
    "liar's party game online",
    'bluffing game online',
    'social deduction game free',
    'party game online multiplayer',
    "liar's party browser game",
    'online bluff game friends',
    'social party game no download',
  ],
  openGraph: {
    title: "Play Liar's Party Online Free | Boardly",
    description:
      "Make claims, vote on who's bluffing, and avoid elimination. Free social bluffing game for 4–12 players.",
    url: 'https://www.boardly.online/games/liars-party',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "Play Liar's Party Online Free | Boardly",
    description: 'Real-time bluffing party game in your browser. Claim, challenge, survive. Free, no download.',
  },
  alternates: {
    canonical: 'https://www.boardly.online/games/liars-party',
  },
}

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.boardly.online' },
    { '@type': 'ListItem', position: 2, name: 'Games', item: 'https://www.boardly.online/games' },
    { '@type': 'ListItem', position: 3, name: "Liar's Party", item: 'https://www.boardly.online/games/liars-party' },
  ],
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: "Liar's Party",
  description:
    'Social bluffing party game where players make claims (true or bluff), others vote to challenge or believe, and players are eliminated after too many caught bluffs.',
  url: 'https://www.boardly.online/games/liars-party',
  image: 'https://www.boardly.online/opengraph-image',
  genre: ['Party Game', 'Social Deduction', 'Multiplayer', 'Bluffing'],
  numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 4, maxValue: 12 },
  playMode: 'MultiPlayer',
  applicationCategory: 'Game',
  operatingSystem: 'Any (Browser)',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'Boardly', url: 'https://www.boardly.online' },
}

export default function LiarsPartyGamePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <div className="min-h-screen bg-gradient-to-br from-rose-500 via-red-500 to-orange-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">

          <nav className="mb-8 text-white/60 text-sm flex items-center gap-2" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/games" className="hover:text-white transition-colors">Games</Link>
            <span>/</span>
            <span className="text-white">Liar&apos;s Party</span>
          </nav>

          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white/20 backdrop-blur-sm mb-6">
              <span className="text-6xl" role="img" aria-label="Liar's Party">🎭</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4 drop-shadow-lg">
              Play Liar&apos;s Party Online
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto mb-8">
              Make claims — true or total bluffs. Everyone votes to challenge or believe.
              Get caught bluffing too many times and you&apos;re out. Free for 4–12 players.
            </p>
            <Link
              href="/lobby/create?gameType=liars_party"
              className="inline-block px-10 py-4 bg-white text-rose-600 rounded-2xl font-bold text-lg hover:bg-rose-50 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105"
            >
              Play Liar&apos;s Party Now →
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
            {[
              { label: 'Players', value: '4–12' },
              { label: 'Price', value: 'Free' },
              { label: 'Download', value: 'None' },
              { label: 'Game type', value: 'Social' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 backdrop-blur-md rounded-2xl p-5 text-center text-white">
                <div className="text-2xl font-bold">{value}</div>
                <div className="text-white/70 text-sm mt-1">{label}</div>
              </div>
            ))}
          </div>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-4">What is Liar&apos;s Party?</h2>
            <p className="text-white/85 leading-relaxed mb-4">
              Liar&apos;s Party is a social bluffing game for 4–12 players. Each round, one player becomes
              the claimant and submits a statement — true or completely made up. Everyone else votes:
              do they challenge (think it&apos;s a bluff) or believe it?
            </p>
            <p className="text-white/85 leading-relaxed">
              Wrong reads cost points and accumulate strikes. Reach the strike limit and you&apos;re eliminated.
              Last player standing — or whoever has the most points after all rounds — wins.
            </p>
          </section>

          <section className="bg-white/10 backdrop-blur-md rounded-3xl p-8 mb-8 text-white">
            <h2 className="text-3xl font-bold mb-6">How to Play Liar&apos;s Party Online</h2>
            <ol className="space-y-4">
              {[
                { step: '1', title: 'Create a lobby', desc: 'Start a game and invite 4–12 friends with a room code or link.' },
                { step: '2', title: 'Make your claim', desc: "When it's your turn as claimant, write any statement — true fact or complete bluff. Mark it secretly." },
                { step: '3', title: 'Vote', desc: "Other players vote: Challenge (think it's a bluff) or Believe (think it's true). Correct reads earn points; wrong reads lose them." },
                { step: '4', title: 'Reveal and survive', desc: "The truth is revealed. Caught bluffing too many times? You're eliminated. Last one standing wins." },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold">{step}</div>
                  <div>
                    <div className="font-semibold">{title}</div>
                    <div className="text-white/75 text-sm mt-1">{desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="text-center">
            <Link
              href="/games/liars-party/lobbies"
              className="inline-block px-8 py-3 bg-white/10 border border-white/30 text-white rounded-xl hover:bg-white/20 transition-colors mr-4"
            >
              Browse Open Lobbies
            </Link>
            <Link
              href="/lobby/create?gameType=liars_party"
              className="inline-block px-8 py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 transition-colors"
            >
              Create Lobby
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run ci:quick
```

Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add app/games/liars-party/page.tsx
git commit -m "feat(#259): add Liar's Party games hub info page with SEO metadata"
```

---

## Task 6: Lobbies Hub Page

**Files:**
- Create: `app/games/liars-party/lobbies/page.tsx`

Follows `app/games/alias/lobbies/page.tsx` exactly — socket, auto-refresh, create/join cards, active lobbies list.

- [ ] **Step 1: Create `app/games/liars-party/lobbies/page.tsx`**

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { io, Socket } from 'socket.io-client'
import { getBrowserSocketUrl } from '@/lib/socket-url'
import { resolveSocketClientAuth } from '@/lib/socket-client-auth'
import { clientLogger } from '@/lib/client-logger'
import { useTranslation } from '@/lib/i18n-helpers'
import { showToast } from '@/lib/i18n-toast'
import { useGuest } from '@/contexts/GuestContext'
import { fetchWithGuest } from '@/lib/fetch-with-guest'

let socket: Socket | null = null

interface Lobby {
  id: string
  code: string
  name: string
  maxPlayers: number
  gameType: string
  creator: {
    username: string | null
    email: string | null
  }
  games: {
    id: string
    status: string
    _count: {
      players: number
    }
  }[]
}

export default function LiarsPartyLobbiesPage() {
  const router = useRouter()
  const { status } = useSession()
  const { isGuest, guestToken } = useGuest()
  const { t } = useTranslation()
  const [lobbies, setLobbies] = useState<Lobby[]>([])
  const [loading, setLoading] = useState(true)
  const [joinCode, setJoinCode] = useState('')
  const isAuthenticated = status === 'authenticated' || isGuest

  const loadLobbies = useCallback(async () => {
    try {
      const res = await fetchWithGuest('/api/lobby?gameType=liars_party')

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      if (data.error) {
        clientLogger.warn("Liar's Party lobbies loaded with error:", data.error)
      }

      setLobbies(data.lobbies || [])
    } catch (error) {
      clientLogger.error("Failed to load Liar's Party lobbies:", error)
      showToast.error('errors.failedToLoad')
      setLobbies([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated' && !isGuest) {
      setLoading(false)
      return
    }

    if (isGuest && !guestToken) {
      return
    }

    if (status === 'authenticated' || isGuest) {
      loadLobbies()
      let isMounted = true

      const refreshInterval = setInterval(() => {
        loadLobbies()
      }, 5000)

      const initSocket = async () => {
        if (socket) {
          return
        }

        const url = getBrowserSocketUrl()
        clientLogger.log("🔌 Connecting to Socket.IO for Liar's Party lobby list:", url)

        const useGuestAuth = isGuest && status !== 'authenticated'
        const socketAuth = await resolveSocketClientAuth({
          isGuest: useGuestAuth,
          guestToken: useGuestAuth ? guestToken : null,
        })

        if (!socketAuth) {
          clientLogger.warn("Skipping Liar's Party lobby socket connection: auth payload unavailable")
          return
        }

        if (!isMounted) {
          return
        }

        socket = io(url, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          auth: socketAuth.authPayload,
          query: socketAuth.queryPayload,
        })

        socket.on('connect', () => {
          clientLogger.log("✅ Socket connected for Liar's Party lobby list")
          socket?.emit('join-lobby-list')
        })

        socket.on('lobby-list-update', () => {
          clientLogger.log("📡 Liar's Party lobby list update received")
          loadLobbies()
        })

        socket.on('disconnect', () => {
          clientLogger.log("❌ Socket disconnected from Liar's Party lobby list")
        })
      }
      void initSocket()

      return () => {
        isMounted = false
        clearInterval(refreshInterval)
        if (socket && socket.connected) {
          clientLogger.log("🔌 Disconnecting socket from Liar's Party lobby list")
          socket.emit('leave-lobby-list')
          socket.disconnect()
        }
        socket = null
      }
    }
  }, [status, isGuest, guestToken, loadLobbies])

  const handleJoinByCode = () => {
    if (!isAuthenticated) {
      router.push('/')
      return
    }
    if (joinCode) {
      router.push(`/lobby/${joinCode.toUpperCase()}`)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="page-shell flex items-center justify-center">
        <p className="text-xl">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="page-shell bg-gradient-to-br from-rose-500 via-red-500 to-orange-500">
      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* Breadcrumbs */}
        <div className="mb-4 sm:mb-6 flex items-center gap-1.5 sm:gap-2 text-white/80 text-xs sm:text-sm overflow-x-auto">
          <button
            onClick={() => router.push('/')}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            🏠 <span className="hidden xs:inline">{t('breadcrumbs.home')}</span>
          </button>
          <span>›</span>
          <button
            onClick={() => router.push('/games')}
            className="hover:text-white transition-colors whitespace-nowrap"
          >
            🎮 <span className="hidden xs:inline">{t('breadcrumbs.games')}</span>
          </button>
          <span>›</span>
          <span className="text-white font-semibold whitespace-nowrap">🎭 <span className="hidden xs:inline">{t('games.liars_party.name')}</span></span>
        </div>

        {/* Header */}
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2 drop-shadow-lg">
              🎭 {t('games.liars_party.lobbies.title')}
            </h1>
            <p className="text-sm sm:text-base lg:text-xl text-white/90">
              {isAuthenticated ? t('games.liars_party.lobbies.subtitle') : t('games.liars_party.lobbies.subtitleGuest')}
            </p>
          </div>
          <button
            onClick={() => router.push('/games')}
            className="px-4 sm:px-6 py-2 sm:py-3 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-xl font-semibold transition-all duration-300 hover:scale-105 text-sm sm:text-base w-full sm:w-auto"
          >
            ← {t('games.liars_party.lobbies.backToGames')}
          </button>
        </div>

        {!isAuthenticated && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-white/10 border border-white/20 rounded-xl text-white/90">
            <p className="font-semibold text-sm sm:text-base">{t('games.liars_party.lobbies.wantToPlay')}</p>
            <p className="text-xs sm:text-sm mt-1">
              {t('games.liars_party.lobbies.wantToPlayDesc')}
            </p>
            <div className="mt-3 flex flex-col xs:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => router.push('/auth/login?returnUrl=/games/liars-party/lobbies')}
                className="px-4 py-2 bg-white text-rose-600 rounded-lg font-bold hover:bg-rose-50 transition-colors text-sm sm:text-base"
              >
                {t('games.liars_party.lobbies.signIn')}
              </button>
              <button
                onClick={() => router.push('/auth/register?returnUrl=/games/liars-party/lobbies')}
                className="px-4 py-2 border border-white/40 rounded-lg font-semibold hover:bg-white/10 transition-colors text-sm sm:text-base"
              >
                {t('games.liars_party.lobbies.createAccount')}
              </button>
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Create Lobby Card */}
          <div
            className="bg-gradient-to-br from-rose-600 to-orange-600 rounded-2xl shadow-2xl p-5 sm:p-8 text-white hover:shadow-3xl transition-all hover:scale-105 cursor-pointer border-2 sm:border-4 border-white/20"
            onClick={() => {
              if (!isAuthenticated) {
                router.push(`/auth/login?returnUrl=${encodeURIComponent('/lobby/create?gameType=liars_party')}`)
                return
              }
              router.push('/lobby/create?gameType=liars_party')
            }}
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="text-4xl sm:text-6xl">🎭</div>
              <div className="px-2 sm:px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-bold">
                {t('games.liars_party.lobbies.newGame')}
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-2 sm:mb-3">{t('games.liars_party.lobbies.createNewLobby')}</h2>
            <p className="text-white/90 mb-4 sm:mb-6 text-sm sm:text-base lg:text-lg">{t('games.liars_party.lobbies.createDescription')}</p>
            <div className="flex items-center text-white font-bold text-base sm:text-lg">
              <span>{t('games.liars_party.lobbies.createNow')}</span>
              <svg className="w-5 h-5 sm:w-6 sm:h-6 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>

          {/* Quick Join Card */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-lg p-5 sm:p-8 hover:shadow-xl transition-shadow border-2 border-white/20">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 sm:mb-4">🔍 {t('games.liars_party.lobbies.quickJoin')}</h2>
            <p className="text-xs sm:text-sm text-white/80 mb-4 sm:mb-6">
              {t('games.liars_party.lobbies.quickJoinDesc')}
            </p>
            <div className="flex flex-col xs:flex-row gap-2 sm:gap-3">
              <input
                type="text"
                placeholder={t('games.liars_party.lobbies.enterCode')}
                className="flex-1 px-3 sm:px-4 py-2 sm:py-3 border-2 border-white/30 rounded-xl focus:ring-2 focus:ring-white focus:border-transparent bg-white/20 backdrop-blur-sm text-white placeholder-white/60 font-mono text-base sm:text-lg"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                onKeyPress={(e) => e.key === 'Enter' && handleJoinByCode()}
              />
              <button
                onClick={handleJoinByCode}
                disabled={!joinCode || joinCode.length !== 4 || !isAuthenticated}
                className="px-6 sm:px-8 py-2 sm:py-3 bg-white text-rose-600 rounded-xl font-bold hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 shadow-lg text-sm sm:text-base"
              >
                {t('lobby.join')}
              </button>
            </div>
            {!isAuthenticated && (
              <p className="text-xs text-white/70 mt-3">
                {t('games.liars_party.lobbies.signInToJoin')}
              </p>
            )}
          </div>
        </div>

        {/* Active Lobbies */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 shadow-xl border border-white/20">
          <h2 className="text-white text-2xl font-bold mb-6 flex items-center justify-between">
            <span>🎮 {t('games.liars_party.lobbies.activeLobbies')}</span>
            <span className="text-lg font-normal text-white/80">({lobbies.length})</span>
          </h2>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white/10 rounded-xl p-6">
                  <div className="h-6 bg-white/20 rounded mb-4"></div>
                  <div className="h-4 bg-white/20 rounded mb-3"></div>
                  <div className="h-10 bg-white/20 rounded"></div>
                </div>
              ))}
            </div>
          ) : lobbies.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🎭</div>
              <p className="text-white/70 text-lg mb-6">
                {t('games.liars_party.lobbies.noLobbiesTitle')}
              </p>
              {isAuthenticated && (
                <button
                  onClick={() => router.push('/lobby/create?gameType=liars_party')}
                  className="px-6 py-3 bg-gradient-to-r from-rose-600 to-orange-500 text-white rounded-xl font-bold hover:shadow-lg transition-all hover:scale-105"
                >
                  {t('games.liars_party.lobbies.createFirstLobby')}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lobbies.map((lobby) => {
                const game = lobby.games[0]
                const playerCount = game?._count?.players || 0
                const isWaiting = game?.status === 'waiting'
                const isPlaying = game?.status === 'playing'
                const isFull = playerCount >= lobby.maxPlayers

                return (
                  <div
                    key={lobby.id}
                    className="bg-gradient-to-br from-white/20 to-white/10 backdrop-blur-sm border border-white/30 rounded-xl p-5 hover:from-white/30 hover:to-white/20 hover:border-white/40 transition-all duration-300 cursor-pointer transform hover:scale-105 hover:shadow-2xl"
                    onClick={() => router.push(`/lobby/${lobby.code}`)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="text-white font-bold text-lg truncate pr-2 flex-1">
                        {lobby.name}
                      </h3>
                      <span className="text-xs bg-rose-500 text-white px-3 py-1 rounded-full font-mono font-bold shadow-lg">
                        {lobby.code}
                      </span>
                    </div>

                    <div className="text-white/80 text-sm mb-4 flex items-center">
                      <span className="mr-2">👤</span>
                      <span className="truncate">
                        {t('games.liars_party.lobbies.host')}: {lobby.creator.username || lobby.creator.email?.split('@')[0] || 'Anonymous'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-white/20">
                      <div className="flex items-center text-white font-semibold">
                        <span className="mr-2">👥</span>
                        <span className={isFull ? 'text-yellow-300' : ''}>
                          {playerCount}/{lobby.maxPlayers}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isWaiting && (
                          <span className="flex items-center text-xs bg-yellow-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                            <span className="w-2 h-2 bg-white rounded-full mr-1.5 animate-ping"></span>
                            {t('games.liars_party.lobbies.waiting')}
                          </span>
                        )}
                        {isPlaying && (
                          <span className="flex items-center text-xs bg-green-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                            <span className="w-2 h-2 bg-white rounded-full mr-1.5"></span>
                            {t('games.liars_party.lobbies.playing')}
                          </span>
                        )}
                        {isFull && (
                          <span className="text-xs bg-red-500 text-white px-3 py-1 rounded-full font-semibold shadow-md">
                            {t('games.liars_party.lobbies.full')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npm run ci:quick
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/games/liars-party/lobbies/page.tsx
git commit -m "feat(#259): add Liar's Party lobbies hub page"
```

---

## Task 7: Update app/games/page.tsx

**Files:**
- Modify: `app/games/page.tsx`

Change the `liars-party` entry from `status: 'coming-soon'` to `status: 'available'` with a route.

- [ ] **Step 1: Update the liars-party entry in `app/games/page.tsx`**

Find (around line 138):
```typescript
    {
      id: 'liars-party',
      nameKey: 'games.liars_party.name',
      emoji: '🎭',
      descriptionKey: 'games.liars_party.description',
      players: '4-12',
      difficultyKey: 'games.liars_party.difficulty',
      status: 'coming-soon',
      color: 'from-rose-500 to-orange-500'
    },
```

Replace with:
```typescript
    {
      id: 'liars-party',
      nameKey: 'games.liars_party.name',
      emoji: '🎭',
      descriptionKey: 'games.liars_party.description',
      players: '4-12',
      difficultyKey: 'games.liars_party.difficulty',
      status: 'available',
      route: '/games/liars-party/lobbies',
      color: 'from-rose-500 to-orange-500'
    },
```

- [ ] **Step 2: Verify TypeScript and lint**

```bash
npm run ci:quick
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test -- --no-coverage
```

Expected: all tests pass including `liars-party-page.test.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/games/page.tsx
git commit -m "feat(#259): make Liar's Party available in games hub"
```

---

## Self-Review Checklist

### Spec coverage
- ✅ `LiarsPartyPage` follows `alias-page.tsx` pattern: own socket, `loadLobby`, `applyAuthoritativeState`, `handleMove`
- ✅ All statuses handled: `waiting` → `WaitingScreen`, `playing/claim` → `ClaimScreen`, `playing/challenge` → `ChallengeScreen`, `playing/reveal` → `RevealScreen`, `finished` → `GameOverScreen`
- ✅ Eliminated players see `EliminatedClaimScreen` / `EliminatedChallengeScreen` with `data-testid="eliminated-banner"`
- ✅ `isBluff` in state for all clients — UI renders it only in claimant's ClaimScreen
- ✅ Host-only `advance-round` enforcement in UI (`RevealScreen` shows active button for host, disabled for others)
- ✅ `WaitingScreen` data-testid: `liars-party-waiting-room` ✅
- ✅ `ClaimScreen` data-testid: `liars-party-claim-screen` ✅
- ✅ `ChallengeScreen` data-testid: `liars-party-challenge-screen` ✅
- ✅ `RevealScreen` data-testid: `liars-party-reveal-screen` ✅
- ✅ `GameOverScreen` data-testid: `liars-party-game-over-screen` ✅
- ✅ `LobbyPageClient.tsx` wires `gameType === 'liars_party'` to `LiarsPartyLobbyPage`
- ✅ `app/games/liars-party/page.tsx` SEO info page
- ✅ `app/games/liars-party/lobbies/page.tsx` lobbies hub
- ✅ `app/games/page.tsx` liars-party changed to `available`
- ✅ All 4 locale files updated with `liarsParty:` and `games.liars_party.lobbies.*`
- ✅ 3 tests: waiting room render, game-abandoned redirect, player-left redirect
- ✅ `handleMove` has no optimistic updates (spec: "No optimistic updates for Liar's Party")
- ✅ `handleStartGame` config: `{ maxPlayers: 12, minPlayers: 4 }`
- ✅ `triggerLifecycleRedirect` toastId: `liars-party-lifecycle-redirect`
- ✅ `player-left` min threshold: 4

### Type consistency
- `LiarsPartyGame` imported from `@/lib/games/liars-party-game` — matches file at `lib/games/liars-party-game.ts` ✅
- `LiarsPartyGameData` type used consistently across all screen components ✅
- `handleMove('submit-claim', { claim, isBluff })` — matches engine's `getStringField(move.data, 'claim')` + `move.data.isBluff` ✅
- `handleMove('submit-challenge', { decision })` — matches engine's `move.data.decision` ✅
- `handleMove('advance-round', {})` — no payload needed per spec ✅
