import {
  isFakeArtistEnabled,
  isInDevelopmentGamePlayEnabled,
  isSketchAndGuessEnabled,
  isTelephoneDoodleEnabled,
} from './feature-flags'
import type { TranslationKeys } from './i18n-helpers'

export type RegisteredGameType =
  | 'yahtzee'
  | 'guess_the_spy'
  | 'tic_tac_toe'
  | 'rock_paper_scissors'
  | 'memory'
  | 'connect_four'
  | 'alias'
  | 'liars_party'
  // Registered since #1035: the engine, the lobby route and the metadata are
  // all permanent now, so nothing about the game itself depends on
  // ENABLE_SKETCH_AND_GUESS any more. What the flag still decides is whether
  // the catalog entry is promoted to `available`, which is the product
  // decision #873 makes.
  | 'sketch_and_guess'
export type ExperimentalGameType =
  | 'telephone_doodle'
  | 'fake_artist'
export type SupportedCatalogGameType = RegisteredGameType | ExperimentalGameType
export type GameCatalogAvailability = 'available' | 'in-development' | 'planned'

export type LobbyCreateConfig = {
  gradient: string
  allowedPlayers: number[]
  defaultMaxPlayers: number
  turnTimer?: { options: number[]; default: number }
  gameModes?: { options: string[]; default: string }
  rounds?: { options: number[]; default: number | null }
  difficulty?: { options: string[]; default: string }
}

/**
 * Everything the game's own page needs to be found and to answer the query it
 * was found on (#929). It lives on the catalog entry so a game's title,
 * description and answer sit with the game instead of being hand-copied into
 * `app/games/<game>/page.tsx` – eight pages were carrying their own near
 * identical block before this.
 *
 * `title`, `description`, `synonyms`, `genre` and `schemaDescription` are the
 * crawler's copy and stay English, the way `lib/guides-catalog.ts` does: a
 * <title> has no locale until the localized URLs of #928 exist. The question
 * and the answer are read by visitors, so they are translation keys and the
 * page renders them through `t()`.
 */
export type GameSeo = {
  /** The <title>. The root layout appends " | Boardly", and the pair stays under 60 characters. */
  title: string
  /** The meta description, ~150 characters, written for the query the page targets. */
  description: string
  /** The other names people type for this game. Feeds `keywords`. */
  synonyms: string[]
  /** schema.org VideoGame genres. */
  genre: string[]
  /** What the game is, for the VideoGame JSON-LD – a definition, not a pitch. */
  schemaDescription: string
  /**
   * The question the page answers, drawn as its first <h2> above the fold and
   * used as the FAQPage question. One question: if it needs two, the page
   * needs two answers.
   */
  questionKey: TranslationKeys
  /**
   * One short paragraph directly under it, in the product's own voice, and the
   * same text the FAQPage JSON-LD carries – schema whose answer is nowhere on
   * the page is a violation, which is what `/guides/best-2-player-games-online`
   * shipped until #923.
   */
  answerKey: TranslationKeys
}

type GameCatalogEntryBase = {
  id: string
  nameKey: string
  descriptionKey: string
  players: string
  difficultyKey: string
  color: string
  /** Present on every game that has a page under `app/games/`. */
  seo?: GameSeo
}

/** A game that is live and playable — gameType, route, and lobbyCreateConfig are all required. */
export type AvailableGameCatalogEntry = GameCatalogEntryBase & {
  availability: 'available'
  gameType: SupportedCatalogGameType
  route: string
  lobbyCreateConfig: LobbyCreateConfig
}

/** A game that is not yet available — all fields beyond the base are optional. */
export type NonAvailableGameCatalogEntry = GameCatalogEntryBase & {
  availability: 'in-development' | 'planned'
  gameType?: SupportedCatalogGameType
  route?: string
  lobbyCreateConfig?: LobbyCreateConfig
}

export type GameCatalogEntry = AvailableGameCatalogEntry | NonAvailableGameCatalogEntry

/** Type guard — narrows to AvailableGameCatalogEntry (static available + has lobbyCreateConfig). */
export function isAvailableCatalogEntry(game: GameCatalogEntry): game is AvailableGameCatalogEntry {
  return game.availability === 'available' && game.lobbyCreateConfig !== undefined
}

/**
 * Is this `in-development` entry structurally finished enough for ENABLE_IN_DEVELOPMENT_GAMES
 * to promote it (#1054)?
 *
 * The question is asked of the entry, never of its name. `AvailableGameCatalogEntry` requires
 * `gameType`, `route` and `lobbyCreateConfig`, and promotion writes `availability: 'available'`
 * without adding any of them - so an entry missing one is promoted into a shape the rest of the
 * app already believes it has. `route` is the sharper of the two: `isAvailableCatalogEntry` does
 * not check it, and `components/HomePage/GameRibbon.tsx` reads `game.route` off everything that
 * guard admits, so a routeless promotion is a crash there and a link to a 404 wherever it is not.
 *
 * Today this excludes exactly `fake_artist` and `telephone_doodle`, which #975 stripped of their
 * routes because the pages do not exist - the same two a hardcoded denylist used to name. The
 * difference is the next entry: a game added `in-development` before its pages exist is kept out
 * by its own shape instead of by someone remembering to extend a list.
 */
export function isFlagPromotableEntry(game: GameCatalogEntry): boolean {
  return (
    game.gameType !== undefined &&
    game.route !== undefined &&
    game.lobbyCreateConfig !== undefined
  )
}

export const DEFAULT_GAME_TYPE: RegisteredGameType = 'yahtzee'

export interface GameMetadata {
  type: SupportedCatalogGameType
  name: string
  svgId: string
  accentColor: string
  minPlayers: number
  maxPlayers: number
  supportsBots: boolean
  translationKey: string
  /** Advance currentPlayerIndex when the current player leaves a live game */
  advanceTurnOnLeave: boolean
  /** Delegate player-leave state mutation to the game engine's handlePlayerLeave() */
  engineHandlesLeave: boolean
  /** Bot turn is triggered by checking currentPlayerIndex (turn-based games) */
  usesTurnIndex: boolean
  /**
   * Abandon the game when the player holding this state.data role leaves —
   * some games cannot meaningfully continue without a specific role (#759).
   * `stateDataKey` names the state.data field holding that player's id;
   * `reason` goes into terminalMetadata and the game-abandoned broadcast.
   */
  abandonWhenRoleLeaves?: { stateDataKey: string; reason: string }
  /**
   * state.data fields to reset when advanceTurnOnLeave skips past the
   * departed player, so the next player starts a clean turn (#759 — was
   * duck-typed per-game inside lobby-leave.ts). A value of undefined
   * deletes the key; other values are assigned when the key exists.
   */
  turnResetOnLeave?: Record<string, unknown>
}

const GAME_METADATA: Record<RegisteredGameType, GameMetadata> = {
  yahtzee: {
    type: 'yahtzee',
    name: 'Yahtzee',
    svgId: 'yahtzee',
    accentColor: 'var(--bd-sky)',
    minPlayers: 1,
    maxPlayers: 4,
    supportsBots: true,
    translationKey: 'yahtzee',
    advanceTurnOnLeave: true,
    engineHandlesLeave: false,
    usesTurnIndex: true,
    turnResetOnLeave: { rollsLeft: 3, held: [false, false, false, false, false], lastRoll: undefined },
  },
  guess_the_spy: {
    type: 'guess_the_spy',
    name: 'Guess the Spy',
    svgId: 'spy',
    accentColor: 'var(--bd-lav)',
    minPlayers: 3,
    maxPlayers: 10,
    supportsBots: false,
    translationKey: 'spy',
    advanceTurnOnLeave: false,
    engineHandlesLeave: false,
    usesTurnIndex: false,
    // The game is unwinnable without its spy; a non-spy leave continues
    // (phase-based — no currentPlayerIndex to advance).
    abandonWhenRoleLeaves: { stateDataKey: 'spyPlayerId', reason: 'spy_left' },
  },
  tic_tac_toe: {
    type: 'tic_tac_toe',
    name: 'Tic Tac Toe',
    svgId: 'tic-tac-toe',
    accentColor: 'var(--bd-coral)',
    minPlayers: 2,
    maxPlayers: 2,
    supportsBots: true,
    translationKey: 'tictactoe',
    advanceTurnOnLeave: false,
    engineHandlesLeave: false,
    usesTurnIndex: true,
  },
  rock_paper_scissors: {
    type: 'rock_paper_scissors',
    name: 'Rock Paper Scissors',
    svgId: 'rps',
    accentColor: 'var(--bd-sun)',
    minPlayers: 2,
    maxPlayers: 2,
    supportsBots: true,
    translationKey: 'rps',
    advanceTurnOnLeave: false,
    engineHandlesLeave: false,
    usesTurnIndex: false,
  },
  memory: {
    type: 'memory',
    name: 'Memory',
    svgId: 'memory',
    accentColor: 'var(--bd-mint)',
    minPlayers: 2,
    maxPlayers: 4,
    supportsBots: true,
    translationKey: 'memory',
    advanceTurnOnLeave: true,
    engineHandlesLeave: false,
    usesTurnIndex: true,
    turnResetOnLeave: { flippedCardIds: [], pendingMismatchCardIds: [], advanceTurnAfterMove: false },
  },
  connect_four: {
    type: 'connect_four',
    name: 'Connect Four',
    svgId: 'connect-four',
    accentColor: 'var(--bd-coral)',
    minPlayers: 2,
    maxPlayers: 2,
    supportsBots: true,
    translationKey: 'connect_four',
    advanceTurnOnLeave: false,
    engineHandlesLeave: false,
    usesTurnIndex: true,
  },

  alias: {
    type: 'alias',
    name: 'Alias',
    svgId: 'alias',
    accentColor: 'var(--bd-coral)',
    minPlayers: 3,
    maxPlayers: 16,
    supportsBots: false,
    translationKey: 'alias',
    advanceTurnOnLeave: false,
    engineHandlesLeave: true,
    usesTurnIndex: false,
  },

  liars_party: {
    type: 'liars_party',
    name: "Liar's Party",
    svgId: 'liars-party',
    accentColor: 'var(--bd-lav)',
    minPlayers: 4,
    maxPlayers: 12,
    supportsBots: false,
    translationKey: 'liars_party',
    advanceTurnOnLeave: false,
    engineHandlesLeave: true,
    usesTurnIndex: false,
  },

  sketch_and_guess: {
    type: 'sketch_and_guess',
    name: 'Sketch & Guess',
    svgId: 'guess-my-drawing',
    accentColor: 'var(--bd-mint)',
    minPlayers: 3,
    maxPlayers: 10,
    supportsBots: false,
    translationKey: 'guess_my_drawing',
    advanceTurnOnLeave: false,
    engineHandlesLeave: false,
    usesTurnIndex: false,
  },
}

const TELEPHONE_DOODLE_METADATA: GameMetadata = {
  type: 'telephone_doodle',
  name: 'Telephone Doodle',
  svgId: 'telephone-doodle',
  accentColor: 'var(--bd-sky)',
  minPlayers: 3,
  maxPlayers: 12,
  supportsBots: false,
  translationKey: 'telephone_doodle',
  advanceTurnOnLeave: false,
  engineHandlesLeave: false,
  usesTurnIndex: false,
}

const FAKE_ARTIST_METADATA: GameMetadata = {
  type: 'fake_artist',
  name: 'Fake Artist',
  svgId: 'fake-artist',
  accentColor: 'var(--bd-lav)',
  minPlayers: 4,
  maxPlayers: 10,
  supportsBots: false,
  translationKey: 'fake_artist',
  advanceTurnOnLeave: false,
  engineHandlesLeave: false,
  usesTurnIndex: false,
}

const FEATURED_GAME_CATALOG: readonly GameCatalogEntry[] = [
  {
    id: 'yahtzee',
    gameType: 'yahtzee',
    nameKey: 'games.yahtzee.name',
    descriptionKey: 'games.yahtzee.description',
    players: '1-4',
    difficultyKey: 'games.yahtzee.difficulty',
    seo: {
      title: 'Play Yahtzee Online Free with Friends or Bots',
      description: 'Play Yahtzee online free in your browser. Roll five dice, fill the scorecard and play with up to three friends in real time, or against a bot.',
      synonyms: [
        'yahtzee online',
        'yahtzee online free',
        'play yahtzee online',
        'yahtzee online with friends',
        'yahtzee multiplayer',
        'yatzy online',
        'free yahtzee game',
        'dice game online',
      ],
      genre: [
        'Dice Game',
        'Strategy',
        'Multiplayer',
      ],
      schemaDescription: 'Dice game for one to four players. Roll five dice up to three times a turn, then commit the result to a scoring category: short mode fills nine categories, classic fifteen.',
      questionKey: 'games.yahtzee.seo.question',
      answerKey: 'games.yahtzee.seo.answer',
    },
    availability: 'available',
    route: '/games/yahtzee/lobbies',
    color: 'from-blue-500 to-purple-600',
    lobbyCreateConfig: {
      gradient: 'from-purple-600 via-pink-500 to-orange-400',
      allowedPlayers: [2, 3, 4],
      defaultMaxPlayers: 4,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
      gameModes: { options: ['short', 'classic'], default: 'short' },
    },
  },
  {
    id: 'spy',
    gameType: 'guess_the_spy',
    nameKey: 'games.spy.name',
    descriptionKey: 'games.spy.description',
    players: '3-10',
    difficultyKey: 'games.spy.difficulty',
    seo: {
      title: 'Play Guess the Spy Online Free – Social Deduction',
      description: 'Play Guess the Spy online free with 3 to 10 players. Everyone gets the location except the spy: ask questions, catch the bluff and vote. No download needed.',
      synonyms: [
        'guess the spy online',
        'spy game online',
        'who is the spy game',
        'find the imposter game',
        'spyfall online free',
        'spyfall style game online',
        'social deduction game online',
        'online spy game with friends',
      ],
      genre: [
        'Social Deduction',
        'Party Game',
        'Multiplayer',
      ],
      schemaDescription: 'Social deduction party game where each player receives a secret location and a role in it, except the spy, who must blend in without knowing where they are.',
      questionKey: 'games.spy.seo.question',
      answerKey: 'games.spy.seo.answer',
    },
    availability: 'available',
    route: '/games/spy/lobbies',
    color: 'from-red-500 to-pink-600',
    lobbyCreateConfig: {
      gradient: 'from-blue-600 via-cyan-500 to-green-400',
      allowedPlayers: [3, 4, 5, 6, 7, 8],
      defaultMaxPlayers: 6,
    },
  },
  {
    id: 'tic-tac-toe',
    gameType: 'tic_tac_toe',
    nameKey: 'games.tictactoe.name',
    descriptionKey: 'games.tictactoe.description',
    players: '1-2',
    difficultyKey: 'games.tictactoe.difficulty',
    seo: {
      title: 'Play Tic Tac Toe Online Free with Friends',
      description: 'Play Tic Tac Toe online free in the browser. Take the 3×3 grid against a friend or a bot, one round or a best of 3, 5 or 10. No download, no account needed.',
      synonyms: [
        'tic tac toe online',
        'tic tac toe online free',
        'play tic tac toe with friends',
        'tic tac toe 2 player',
        'noughts and crosses online',
        'xs and os game online',
      ],
      genre: [
        'Strategy',
        'Puzzle',
        'Multiplayer',
      ],
      schemaDescription: 'Classic 3×3 grid strategy game where two players alternate placing X and O marks, aiming to get three in a row.',
      questionKey: 'games.tictactoe.seo.question',
      answerKey: 'games.tictactoe.seo.answer',
    },
    availability: 'available',
    route: '/games/tic-tac-toe/lobbies',
    color: 'from-red-500 to-coral-500',
    lobbyCreateConfig: {
      gradient: 'from-indigo-600 via-blue-500 to-sky-400',
      allowedPlayers: [2],
      defaultMaxPlayers: 2,
      rounds: { options: [3, 5, 10], default: null },
    },
  },
  {
    id: 'memory',
    gameType: 'memory',
    nameKey: 'games.memory.name',
    descriptionKey: 'games.memory.description',
    players: '1-4',
    difficultyKey: 'games.memory.difficulty',
    seo: {
      title: 'Play Memory Game Online Free – Multiplayer',
      description: 'Play the Memory matching game online free with 2 to 4 players. Flip cards, keep the pairs you match and race on 4×4, 5×4 or 6×6 boards. No download needed.',
      synonyms: [
        'memory game online multiplayer',
        'memory card game online',
        'memory game online free',
        'matching pairs game online',
        'concentration card game online',
        'memory game with friends',
      ],
      genre: [
        'Puzzle',
        'Memory',
        'Multiplayer',
      ],
      schemaDescription: 'Matching pairs card game for two to four players. Every card starts face down; flip two on your turn and keep the pair when they match. Easy is 4×4, hard is 6×6.',
      questionKey: 'games.memory.seo.question',
      answerKey: 'games.memory.seo.answer',
    },
    availability: 'available',
    route: '/games/memory/lobbies',
    color: 'from-green-400 to-teal-500',
    lobbyCreateConfig: {
      gradient: 'from-emerald-500 via-teal-500 to-cyan-400',
      allowedPlayers: [2, 3, 4],
      defaultMaxPlayers: 4,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
      difficulty: { options: ['easy', 'medium', 'hard'], default: 'easy' },
    },
  },
  {
    id: 'connect-four',
    gameType: 'connect_four',
    nameKey: 'games.connect_four.name',
    descriptionKey: 'games.connect_four.description',
    players: '1-2',
    difficultyKey: 'games.connect_four.difficulty',
    seo: {
      title: 'Play Connect 4 Online Free with a Friend',
      description: 'Play Connect 4 online free. Drop discs on a seven by six board and be first to line up four, against a friend or a bot. Real time in the browser, no download.',
      synonyms: [
        'connect 4 online',
        'connect four online',
        'connect four online free',
        'connect 4 online free',
        'four in a row online',
        'connect 4 with friends',
        'connect four 2 player',
        'connect four multiplayer',
      ],
      genre: [
        'Strategy',
        'Puzzle',
        'Multiplayer',
      ],
      schemaDescription: 'Two-player strategy game on a 6-row, 7-column grid. Drop coloured discs into columns and be the first to connect four in a row, horizontally, vertically or diagonally.',
      questionKey: 'games.connect_four.seo.question',
      answerKey: 'games.connect_four.seo.answer',
    },
    availability: 'available',
    route: '/games/connect-four/lobbies',
    color: 'from-red-500 to-yellow-400',
    lobbyCreateConfig: {
      gradient: 'from-red-500 via-orange-400 to-yellow-400',
      allowedPlayers: [2],
      defaultMaxPlayers: 2,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
    },
  },
  {
    id: 'alias',
    gameType: 'alias',
    nameKey: 'games.alias.name',
    descriptionKey: 'games.alias.description',
    players: '3-16',
    difficultyKey: 'games.alias.difficulty',
    seo: {
      title: 'Play Alias Online Free – Team Word Game',
      description: 'Play Alias online free with 3 to 16 players. Describe the word without saying it, guess against the clock, and the higher score wins. No download.',
      synonyms: [
        'alias game online',
        'alias word game online',
        'alias online free',
        'team word game online',
        'describe the word game online',
        'word guessing game with friends',
      ],
      genre: [
        'Party Game',
        'Word Game',
        'Multiplayer',
        'Team Game',
      ],
      schemaDescription: 'Team word description game where players describe words to their teammates without saying the word itself, racing against a timer to score points.',
      questionKey: 'games.alias.seo.question',
      answerKey: 'games.alias.seo.answer',
    },
    availability: 'available',
    route: '/games/alias/lobbies',
    color: 'from-coral-400 to-red-500',
    lobbyCreateConfig: {
      gradient: 'from-coral-500 via-red-500 to-pink-500',
      allowedPlayers: [4, 6, 8, 10, 12, 16],
      defaultMaxPlayers: 8,
      turnTimer: { options: [30, 60, 90, 120], default: 60 },
    },
  },
  {
    id: 'liars-party',
    gameType: 'liars_party',
    nameKey: 'games.liars_party.name',
    descriptionKey: 'games.liars_party.description',
    players: '4-12',
    difficultyKey: 'games.liars_party.difficulty',
    seo: {
      title: "Play Liar's Party Online Free – Bluffing Game",
      description: "Play Liar's Party online free with 4 to 12 players. Make a claim, decide who is bluffing and let the vote settle it. In the browser, no download needed.",
      synonyms: [
        "liar's party online",
        'bluffing game online',
        'online party game for groups',
        'social deduction game online free',
      ],
      genre: [
        'Party Game',
        'Social Deduction',
        'Multiplayer',
        'Bluffing',
      ],
      schemaDescription: 'Social bluffing party game where players make claims (true or bluff), others vote to challenge or believe, and players are eliminated after too many caught bluffs.',
      questionKey: 'games.liars_party.seo.question',
      answerKey: 'games.liars_party.seo.answer',
    },
    availability: 'available',
    route: '/games/liars-party/lobbies',
    color: 'from-violet-500 to-purple-600',
    lobbyCreateConfig: {
      gradient: 'from-violet-600 via-purple-500 to-fuchsia-400',
      allowedPlayers: [4, 5, 6, 7, 8, 9, 10, 11, 12],
      defaultMaxPlayers: 8,
    },
  },
  {
    id: 'rps',
    gameType: 'rock_paper_scissors',
    nameKey: 'games.rock_paper_scissors.name',
    descriptionKey: 'games.rock_paper_scissors.description',
    players: '1-2',
    difficultyKey: 'games.rock_paper_scissors.difficulty',
    seo: {
      title: 'Play Rock Paper Scissors Online Free',
      description: 'Play Rock Paper Scissors online free against a friend or a bot. Both players pick at the same time and the reveal is instant. In the browser, no download.',
      synonyms: [
        'rock paper scissors online',
        'rps online',
        'rock paper scissors online free',
        'rock paper scissors 2 player online',
        'rock paper scissors with friends',
      ],
      genre: [
        'Casual Game',
        'Multiplayer',
        'Strategy',
      ],
      schemaDescription: 'Classic two-player simultaneous-choice game. Both players pick Rock, Paper or Scissors at the same time. Rock beats Scissors, Scissors beats Paper, Paper beats Rock.',
      questionKey: 'games.rock_paper_scissors.seo.question',
      answerKey: 'games.rock_paper_scissors.seo.answer',
    },
    availability: 'available',
    route: '/games/rock-paper-scissors/lobbies',
    color: 'from-indigo-400 to-purple-500',
    lobbyCreateConfig: {
      gradient: 'from-indigo-500 via-purple-500 to-pink-400',
      allowedPlayers: [2],
      defaultMaxPlayers: 2,
    },
  },
  {
    id: 'guess-my-drawing',
    gameType: 'sketch_and_guess',
    nameKey: 'games.guess_my_drawing.name',
    descriptionKey: 'games.guess_my_drawing.description',
    players: '3-10',
    difficultyKey: 'games.guess_my_drawing.difficulty',
    seo: {
      title: 'Play Sketch & Guess Online Free – Draw and Guess',
      description: 'Play Sketch & Guess online free with 3 to 10 players. One player draws a secret prompt, everyone else races to guess it. In the browser, no download.',
      synonyms: [
        'sketch and guess online',
        'draw and guess game online',
        'online drawing and guessing game',
        'pictionary style game online',
        'multiplayer drawing game',
        'drawing game with friends online',
      ],
      genre: [
        'Party Game',
        'Drawing Game',
        'Multiplayer',
      ],
      schemaDescription: 'Drawing and guessing party game for three to ten players. Each round one player draws a secret prompt on a shared canvas while everyone else types guesses, scored on how quickly they land it.',
      questionKey: 'games.guess_my_drawing.seo.question',
      answerKey: 'games.guess_my_drawing.seo.answer',
    },
    // Still in-development: #873 is where the product decision to feature it
    // publicly is taken, and the flip belongs to that ticket alone. #1035 only
    // removes the two things that made the flip impossible – no seo block and
    // no lobbyCreateConfig, which `isAvailableCatalogEntry` requires.
    availability: 'available',
    route: '/games/sketch-and-guess/lobbies',
    color: 'from-cyan-500 to-blue-600',
    lobbyCreateConfig: {
      gradient: 'from-cyan-500 via-sky-500 to-indigo-500',
      // The engine's own range (SketchAndGuessGame's default GameConfig), so the
      // form cannot offer a lobby the game refuses to start.
      allowedPlayers: [3, 4, 5, 6, 7, 8, 9, 10],
      defaultMaxPlayers: 6,
      // No turnTimer and no rounds on purpose. The game runs on its own phase
      // clock (SKETCH_PHASE_SECONDS in lib/games/sketch-and-guess-phases.ts) and
      // ignores the lobby's turn timer, and the create form's round picker is
      // wired to `ticTacToeRounds`, which the lobby route drops for every other
      // game. Either one would render a control that changes nothing.
    },
  },
  {
    id: 'fake-artist',
    gameType: 'fake_artist',
    nameKey: 'games.fake_artist.name',
    descriptionKey: 'games.fake_artist.description',
    players: '4-10',
    difficultyKey: 'games.fake_artist.difficulty',
    availability: 'in-development',
    // No `route`: nothing exists under app/games/fake-artist, so a route here
    // is a link to a 404 the moment the flag promotes the entry (#975). The
    // field goes back once the pages do.
    color: 'from-fuchsia-500 to-violet-600',
  },
  {
    id: 'telephone-doodle',
    gameType: 'telephone_doodle',
    nameKey: 'games.telephone_doodle.name',
    descriptionKey: 'games.telephone_doodle.description',
    players: '3-12',
    difficultyKey: 'games.telephone_doodle.difficulty',
    availability: 'in-development',
    // No `route`, for the same reason as fake-artist above (#975).
    color: 'from-sky-500 to-indigo-600',
  },
  {
    id: 'words-mines',
    nameKey: 'games.wordsmines.name',
    descriptionKey: 'games.wordsmines.description',
    players: '2-8',
    difficultyKey: 'games.wordsmines.difficulty',
    availability: 'planned',
    color: 'from-gray-400 to-black',
  },
  {
    id: 'anagrams',
    nameKey: 'games.anagrams.name',
    descriptionKey: 'games.anagrams.description',
    players: '2-8',
    difficultyKey: 'games.anagrams.difficulty',
    availability: 'planned',
    color: 'from-blue-300 to-indigo-500',
  },
  {
    id: 'crocodile',
    nameKey: 'games.crocodile.name',
    descriptionKey: 'games.crocodile.description',
    players: '3-12',
    difficultyKey: 'games.crocodile.difficulty',
    availability: 'planned',
    color: 'from-green-600 to-lime-400',
  },
  {
    id: 'alibi-night',
    nameKey: 'games.alibi_night.name',
    descriptionKey: 'games.alibi_night.description',
    players: '4-12',
    difficultyKey: 'games.alibi_night.difficulty',
    availability: 'planned',
    color: 'from-amber-500 to-red-600',
  },
]

/**
 * The catalog entry with this id, straight from the static list – no feature
 * flags, because everything read off it here (route, player range, SEO copy)
 * is the same whether the game is promoted or not.
 */
export function getCatalogEntryById(id: string): GameCatalogEntry | null {
  return FEATURED_GAME_CATALOG.find((game) => game.id === id) ?? null
}

/** The SEO block for a game's own page, or null for a game that has no page. */
export function getGameSeo(id: string): GameSeo | null {
  return getCatalogEntryById(id)?.seo ?? null
}

export function isRegisteredGameType(value: string): value is RegisteredGameType {
  return value in GAME_METADATA
}

export function isSupportedGameType(value: string): value is SupportedCatalogGameType {
  return (
    isRegisteredGameType(value) ||
    (value === 'telephone_doodle' && isTelephoneDoodleEnabled()) ||
    (value === 'fake_artist' && isFakeArtistEnabled())
  )
}

export function getGameMetadata(gameType: string): GameMetadata | null {
  if (isRegisteredGameType(gameType)) {
    return GAME_METADATA[gameType]
  }
  if (gameType === 'telephone_doodle' && isTelephoneDoodleEnabled()) {
    return TELEPHONE_DOODLE_METADATA
  }
  if (gameType === 'fake_artist' && isFakeArtistEnabled()) {
    return FAKE_ARTIST_METADATA
  }
  return null
}

export function hasBotSupport(gameType: string): boolean {
  const metadata = getGameMetadata(gameType)
  return metadata?.supportsBots ?? false
}

/**
 * Returns all registered (always-on) game types.
 * Use this instead of hardcoding game type lists.
 */
export function getAllRegisteredGameTypes(): RegisteredGameType[] {
  return Object.keys(GAME_METADATA) as RegisteredGameType[]
}

/**
 * Returns all currently enabled game types (registered + feature-flagged).
 * Use this for UI lists, filters, and validation.
 */
export function getAllEnabledGameTypes(): SupportedCatalogGameType[] {
  const types: SupportedCatalogGameType[] = getAllRegisteredGameTypes()
  if (isTelephoneDoodleEnabled()) types.push('telephone_doodle')
  if (isFakeArtistEnabled()) types.push('fake_artist')
  return types
}

/**
 * Returns all enabled game types that support bots (usable for quick play).
 */
export function getBotSupportedGameTypes(): SupportedCatalogGameType[] {
  return getAllEnabledGameTypes().filter(hasBotSupport)
}

export function isAvailableGameType(
  gameType: string | null | undefined
): gameType is SupportedCatalogGameType {
  return (
    typeof gameType === 'string' &&
    getAvailableGameTypes().includes(gameType as SupportedCatalogGameType)
  )
}

/**
 * How a catalog read is asked for.
 *
 * `enabledExperimental` is the product option: the ids `/dev` and the per-game flags open
 * by name.
 *
 * `catalog` is a seam, and the only callers that pass it are tests. Every rule in this
 * module is about a *shape* of entry - `in-development` and carrying the three fields
 * `isFlagPromotableEntry` asks for - and since #873 released Liar's Party and Sketch &
 * Guess the shipped catalog has no entry of that shape at all: `fake_artist` and
 * `telephone_doodle` have no `route` (#975). Deleting the promotion branch below is
 * therefore invisible to every assertion that reads `FEATURED_GAME_CATALOG`, which is how
 * three suites went quiet rather than red. Handing the function a synthetic entry gives it
 * something to say no about while the function itself - the flag read, the shape check, the
 * filter - stays the code under test. It defaults to the shipped catalog, so nothing in the
 * app passes it.
 */
export type CatalogReadOptions = {
  enabledExperimental?: readonly string[]
  catalog?: readonly GameCatalogEntry[]
}

export function getAvailableGameTypes(options?: CatalogReadOptions): SupportedCatalogGameType[] {
  return getCatalogAvailableGames(options).flatMap((game) =>
    game.gameType !== undefined ? [game.gameType] : []
  )
}

/**
 * The catalog with every `in-development` entry its flags have promoted to `available`.
 *
 * This is the single chokepoint the whole gate hangs off: `getCatalogAvailableGames` filters
 * this list, `getAvailableGameTypes` maps that, and `isTemporarilyUnavailableGameType` - the
 * 400 on POST /api/lobby and POST /api/game/create - is the negation of it. So the one place
 * to open an unreleased game for local and preview work is here, and one place is why the
 * production guard can be argued about at all.
 *
 * `isInDevelopmentGamePlayEnabled()` returns false on production unconditionally, so on
 * boardly.online this branch is the same as it was before #1054.
 */
export function getCatalogGames(options?: CatalogReadOptions): GameCatalogEntry[] {
  const enabledExperimental = new Set(options?.enabledExperimental ?? [])

  return (options?.catalog ?? FEATURED_GAME_CATALOG).map((game) => {
    if (!game.gameType || game.availability !== 'in-development') {
      return { ...game }
    }

    const isEnabled =
      enabledExperimental.has(game.id) ||
      (isInDevelopmentGamePlayEnabled() && isFlagPromotableEntry(game)) ||
      (game.gameType === 'sketch_and_guess' && isSketchAndGuessEnabled()) ||
      (game.gameType === 'fake_artist' && isFakeArtistEnabled()) ||
      (game.gameType === 'telephone_doodle' && isTelephoneDoodleEnabled())

    // Promoted experimental games may lack lobbyCreateConfig — isAvailableCatalogEntry guards this.
    return {
      ...game,
      availability: isEnabled ? 'available' : game.availability,
    } as GameCatalogEntry
  })
}

export function getCatalogAvailableGames(options?: CatalogReadOptions): GameCatalogEntry[] {
  return getCatalogGames(options).filter((game) => game.availability === 'available')
}
