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
      { title: 'Choose your mark', detail: 'One player is X, the other is O. X opens the first round; in a best-of series the two marks take it in turns to start.' },
      { title: 'Take turns', detail: 'Players alternate placing their mark in any empty cell on the 3×3 grid.' },
      { title: 'Win with three in a row', detail: 'Get three of your marks in a row — horizontally, vertically, or diagonally — and you win.' },
      { title: 'Draw', detail: 'If all 9 cells are filled and neither player has three in a row, the game is a draw. With perfect play from both sides, every game ends in a draw.' },
    ],
  },
  lines: {
    title: 'All 8 Winning Lines',
    intro: 'There are exactly 8 ways to win. Three in any of these lines wins the game:',
    items: [
      'Top row (1-2-3)',
      'Middle row (4-5-6)',
      'Bottom row (7-8-9)',
      'Left column (1-4-7)',
      'Middle column (2-5-8)',
      'Right column (3-6-9)',
      'Diagonal (1-5-9)',
      'Diagonal (3-5-7)',
    ],
  },
  strategy: {
    title: 'Strategy — How to Never Lose',
    tips: [
      { tip: 'Start in the center (as X)', detail: 'The center square is part of 4 winning lines — more than any other cell. Taking it first gives you the most winning options.' },
      { tip: 'Take a corner if center is taken', detail: 'Corners are each part of 3 winning lines. If your opponent takes center, play a corner to set up diagonal threats.' },
      { tip: 'Block before attacking', detail: 'If your opponent has two in a row, block the third cell immediately. Missing a block almost always loses the game.' },
      { tip: 'Set up two winning threats at once', detail: 'If you can put yourself one move away from winning in two different places at the same time, your opponent can only stop one. You win the other.' },
      { tip: 'Stop your opponent from doing the same', detail: 'If you notice your opponent building toward two threats at once, block them — either take the square they need, or create your own threat so they have to respond to you.' },
    ],
  },
  onBoardly: {
    title: 'Playing on Boardly',
    modes: [
      { label: 'vs AI:', text: 'Play solo against a bot — great for practising strategy without waiting for an opponent.' },
      { label: 'vs Friend:', text: 'Share a lobby link and play in real time. No account needed for either player.' },
      { label: 'Match mode:', text: 'Play a series of rounds to determine the overall winner — best of 3 or best of 5.' },
    ],
    more: 'All of these are chosen when you create a game from the [Tic-Tac-Toe game page](/games/tic-tac-toe).',
  },
}

export type TicTacToeGuideBody = typeof body

const en: GuideCopy<TicTacToeGuideBody> = {
  title: 'How to Play Tic Tac Toe Online',
  subtitle: '5 min read · Free to play on Boardly · 2 players or vs AI',
  question: 'How do you play Tic Tac Toe online?',
  answer: 'Two players take turns claiming squares on a 3×3 grid, X first, and whoever gets three of their own mark in a row – along one of the three rows, three columns or two diagonals – wins the round.',
  cta: { label: 'Play Tic Tac Toe Now', detail: 'Ready to put your strategy to the test?' },
  related: [
    { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
    { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
    { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
  ],
  body,
  faqTitle: 'Tic Tac Toe Questions',
  faq: [
    {
      question: 'How many ways are there to win?',
      answer: 'Eight: three rows, three columns and two diagonals. The centre square sits on four of them, each corner on three, and each edge square on only two, which is the whole of the opening theory.',
    },
    {
      question: 'Can you always win at Tic Tac Toe?',
      answer: 'No. Two players who both know what they are doing draw every time – the game is solved. What you can do is never lose, by taking the centre when it is free and answering every two-in-a-row before building your own.',
    },
    {
      question: 'Why do so many games end in a draw?',
      answer: 'Because the board is small enough that both players can see every threat. Draws are the normal result between equals, which is why a best-of-three or best-of-five series is the usual way to settle it.',
    },
    {
      question: 'Can I play against the computer?',
      answer: 'Yes, on three levels. The easy bot misses threats, the medium one blocks but does not plan, and the hard one plays the solved game – against it a draw is the best result available to anyone.',
    },
    {
      question: 'How long does a round take?',
      answer: 'Under a minute. That is what makes it the best game here for a rematch: the two of you can play a five-round series in the time a single round of something larger would take.',
    },
    {
      question: 'Does X always go first?',
      answer: 'X opens the first round, and going first is a real advantage in a game this small. The game hands the opening move to the other mark each round, so nobody has to swap seats to share it out. It does not come out exactly level over an odd number of rounds, though: across a full best-of-three X opens two of them and O one.',
    },
  ],
}

export default en
