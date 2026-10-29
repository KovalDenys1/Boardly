import best2Player from '../best-2-player-games-online/guide'
import zoom from '../best-games-to-play-on-zoom/guide'
import gameNight from '../best-online-games-for-game-night/guide'
import alias from '../how-to-play-alias-online/guide'
import connectFour from '../how-to-play-connect-four-online/guide'
import memory from '../how-to-play-memory-card-game-online/guide'
import rockPaperScissors from '../how-to-play-rock-paper-scissors-online/guide'
import spy from '../how-to-play-spy-game-online/guide'
import ticTacToe from '../how-to-play-tic-tac-toe-online/guide'
import yahtzee from '../how-to-play-yahtzee-online/guide'
import type { RegisteredGuide } from './guide-definition'

/** Every guide by slug, for the /ru, /uk and /no routes that render them from one dynamic segment. */
export const GUIDE_PAGES: Record<string, RegisteredGuide> = Object.fromEntries(
  [yahtzee, spy, ticTacToe, memory, connectFour, rockPaperScissors, alias, best2Player, gameNight, zoom].map(
    (guide) => [guide.slug, guide],
  ),
)
