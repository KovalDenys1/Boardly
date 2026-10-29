import type { GuideCopy } from '../../components/guide-definition'

const body = {
  need: {
    title: 'What You Need',
    items: [
      '2 players — or play solo against AI',
      'A browser — desktop, tablet, or mobile',
      'No account required (guest play available)',
      'Free — no download',
    ],
  },
  rules: {
    title: 'The Rules',
    steps: [
      { title: 'The board', detail: 'The board has 7 columns and 6 rows. One player uses red discs, the other uses yellow.' },
      { title: 'Take turns dropping a disc', detail: 'On your turn, pick any column and drop your disc in. It falls to the lowest empty row in that column.' },
      { title: 'Get four in a row to win', detail: 'Connect four of your discs in a straight line — left to right, top to bottom, or diagonally. First to do it wins.' },
      { title: 'Draw', detail: 'If all 42 spaces fill up and nobody has four in a row, the game ends in a draw.' },
    ],
  },
  directions: {
    title: 'Winning Directions',
    intro: 'Four in a row counts in any of these directions:',
    /** In the order the arrows turn: 0°, 90°, 45°, 135°. */
    items: ['Left to right', 'Top to bottom', 'Diagonal down-right', 'Diagonal down-left'],
  },
  strategy: {
    title: 'Strategy Tips',
    tips: [
      { tip: 'Start in the middle column', detail: 'The center column (column 4) touches more winning lines than any other. Drop your first disc there — it gives you the most options.' },
      { tip: 'Build from the bottom', detail: 'Stacking discs high early limits your options. Build your lines low first — the board fills up fast and low pieces are harder to block.' },
      { tip: 'Watch the diagonals', detail: 'Diagonal wins are the easiest to miss. Before you drop a disc, check if you are accidentally helping your opponent complete a diagonal line.' },
      { tip: 'Set up two threats at once', detail: 'If you can create a situation where you have two different ways to win, your opponent can only block one. This wins almost every time.' },
      { tip: 'Do not fill a column prematurely', detail: 'Once a column is full, it is gone. If filling a column gives your opponent a winning space on top, avoid it until the time is right.' },
    ],
    more: 'These five cover the basics. For the deeper plan – keeping two threats in separate columns, why odd and even rows matter and how to play the hard bot – read the [strategy section of the Connect Four game page](/games/connect-four#strategy).',
  },
  onBoardly: {
    title: 'Playing on Boardly',
    modes: [
      { label: 'vs AI:', text: 'Play solo at any time. Great for practicing before challenging a friend.' },
      { label: 'vs Friend:', text: 'Share a lobby link — your friend joins in seconds, no account needed.' },
      { label: 'Turn timer:', text: 'Every turn is on a countdown, and running out forfeits the round. Choose 30, 60, 90, or 120 seconds when you create the lobby.' },
    ],
    more: 'All of these are chosen when you create a game from the [Connect Four game page](/games/connect-four).',
  },
}

export type ConnectFourGuideBody = typeof body

const en: GuideCopy<ConnectFourGuideBody> = {
  title: 'How to Play Connect Four Online',
  subtitle: '5 min read · Free to play on Boardly · 2 players or vs AI',
  question: 'How do you play Connect Four online?',
  answer: 'Two players take turns dropping a disc into one of seven columns, where it falls to the lowest free row, and the first to line up four of their own colour – across, up, or along a diagonal – wins.',
  cta: { label: 'Play Connect Four Now', detail: 'Ready to drop your first disc?' },
  related: [
    { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
    { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
    { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
    { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
  ],
  body,
  faqTitle: 'Connect Four Questions',
  faq: [
    {
      question: 'How big is the Connect Four board?',
      answer: 'Seven columns by six rows, 42 spaces in all. You choose a column rather than a square, and the disc falls to the lowest empty row in it – which is why the move you would like to make is often not available yet.',
    },
    {
      question: 'Who goes first, and does it matter?',
      answer: 'The lobby host plays first, and keeps the opening move in every round of a series. It matters: with perfect play the first player wins, which is why the opening move in the middle column is worth so much. If you want an even series, swap who creates the lobby.',
    },
    {
      question: 'What happens if the board fills up?',
      answer: 'If all 42 spaces are taken and nobody has four in a row, the game is a draw and neither player scores. Draws are rare between players of different strength and common between two careful ones.',
    },
    {
      question: 'Can I play Connect Four against the computer?',
      answer: 'Yes, on three difficulty levels. The easy bot drops into a random open column, and the hard one searches six moves ahead and will punish a column you drop without checking the diagonals.',
    },
    {
      question: 'Is there a time limit on a turn?',
      answer: 'Yes, on every turn. The host picks 30, 60, 90 or 120 seconds when creating the lobby and 60 is the default, but there is no setting that turns the clock off. Letting it run out forfeits the round, so it is worth watching even on the long settings.',
    },
    {
      question: 'Do diagonal lines count?',
      answer: 'Yes, in both directions, and they are what most lost games come down to. A vertical or horizontal threat is easy to see; a diagonal builds one disc at a time across four different columns and is easy to miss.',
    },
  ],
}

export default en
