import type { GuideCopy } from '../../components/guide-definition'

const body = {
  comparison: {
    title: 'Quick Comparison',
    columns: { game: 'Game', length: 'Round length', skill: 'Skill type' },
    rows: [
      { name: 'Tic Tac Toe', length: '<1 min', skill: 'Pattern recognition' },
      { name: 'Memory', length: '5–10 min', skill: 'Memory & attention' },
      { name: 'Connect Four', length: '3–5 min', skill: 'Planning ahead' },
      { name: 'Yahtzee', length: '15–20 min', skill: 'Dice + strategy' },
    ],
  },
  games: {
    title: 'The Best 2 Player Games',
    tipLabel: 'Tip:',
    fullGuide: 'Full guide',
    /** Tic Tac Toe, Memory, Connect Four, Yahtzee – the order `guide.tsx` ranks them in. */
    items: [
      {
        name: 'Tic Tac Toe',
        play: 'Play Tic Tac Toe',
        tagline: 'Best for: Quick 1v1 matches · <1 min · Pattern recognition',
        why: 'The fastest 2 player game online. A round takes under a minute. Play best-of-3 or best-of-5 for a real competitive series — rematch ready in seconds. Supports an AI opponent if your friend is not available.',
        tip: 'Take the center square first — it is part of 4 winning lines, more than any other cell.',
      },
      {
        name: 'Memory Card Game',
        play: 'Play Memory Card Game',
        tagline: 'Best for: Competitive matching · 5–10 min · Memory & attention',
        why: 'Flip cards, find pairs, beat your opponent. Both players see the same board — when your opponent misses a pair, you see exactly where it is. Three difficulty levels: Easy (4×4, 8 pairs), Medium (5×4, 10 pairs), Hard (6×6, 18 pairs).',
        tip: 'Pay attention when your opponent flips — their misses are hints for your next turn.',
      },
      {
        name: 'Connect Four',
        play: 'Play Connect Four',
        tagline: 'Best for: Tactical head to head · 3–5 min · Planning ahead',
        why: 'Two seats, no dice, and nothing hidden from either of you. Drop a disc, block your opponent, get four in a row. It is the shortest game here that still punishes a careless move, which makes it the best of the four for a long rematch series.',
        tip: 'Play the middle column first – it belongs to more winning lines than any other column on the board.',
      },
      {
        name: 'Yahtzee',
        play: 'Play Yahtzee',
        tagline: 'Best for: Longer strategy sessions · 15–20 min · Dice + strategy',
        why: 'Roll five dice and fill the scorecard, then outscore your opponent. A new lobby opens in short mode – nine categories – and classic opens all fifteen for a 15–20 minute game. More strategic than the others – the dice create variance, but smart category choices win games.',
        tip: 'In classic mode, chase the upper section bonus early: 35 points for scoring 63+ in Ones through Sixes. Short mode has no upper section, so the bonus never applies.',
      },
    ],
  },
  tips: {
    title: 'Tips for Playing Online with One Friend',
    items: [
      'Share the lobby link directly — no account needed for either player',
      'Play on any device — desktop, mobile, and tablet all work',
      'Rematch in one click — no need to set up a new game after each round',
      'Every turn runs on a clock, 60 seconds by default and 30 to 120 where the lobby lets you pick',
    ],
  },
}

export type Best2PlayerGuideBody = typeof body

const en: GuideCopy<Best2PlayerGuideBody> = {
  title: 'Best 2 Player Games Online — Free, No Download',
  subtitle: '5 min read · All games free on Boardly · No account required',
  question: 'What are the best 2 player games to play online?',
  answer: 'Tic Tac Toe for a round that ends in under a minute, Connect Four for something tactical that still ends fast, Memory for a close contest of attention, and Yahtzee when you have twenty minutes – all four free in the browser, with no download and no account for either player.',
  cta: { label: 'Browse All Games', detail: 'Pick a game and challenge your friend now.' },
  related: [
    { href: '/guides/how-to-play-tic-tac-toe-online', label: 'How to Play Tic Tac Toe Online' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
    { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
    { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
    { href: '/guides/how-to-play-connect-four-online', label: 'How to Play Connect Four Online' },
  ],
  body,
  faqTitle: '2 Player Games: Common Questions',
  faq: [
    {
      question: 'What are the best free 2 player games online?',
      answer: 'Tic Tac Toe for a one-minute round, Memory when you want a real contest of attention, Connect Four for something tactical that still ends fast, and Yahtzee when you have twenty minutes. All four are free on Boardly, in the browser, with no download and no account.',
    },
    {
      question: 'Can I play 2 player games online for free with no download?',
      answer: 'Yes. Every game here runs in the browser on desktop, tablet and mobile. One player opens a lobby, shares the link, and the second player is in the same game a few seconds later – there is nothing to install on either side.',
    },
    {
      question: 'What is the best quick 2 player game online?',
      answer: 'Tic Tac Toe. A single round is under a minute, and best-of-three or best-of-five still fits inside five. Connect Four is the next step up: the same one-screen simplicity, a real decision on every move, and rounds under five minutes.',
    },
    {
      question: 'What 2 player online game is best for competing with a friend?',
      answer: 'Memory, because both players look at the same board and nothing is hidden from one of you – the winner is whoever paid more attention. Yahtzee is the better pick for a longer session, where category choices matter more than any single roll.',
    },
    {
      question: 'Do both players need an account to play?',
      answer: 'No. Neither player needs one. One of you creates the lobby, shares the link, and the other joins as a guest by typing a name. An account only adds a saved profile and stats.',
    },
    {
      question: 'Can I play on my own if my friend is not around?',
      answer: 'Yes, against a bot: all four have one, on easy, medium and hard. Tic Tac Toe and Connect Four are the closest to the real thing, because a bot plays them exactly as a person would. The Memory bot is playing the same game of recall you are, and Yahtzee against a bot is really a race for the best scorecard.',
    },
  ],
}

export default en
