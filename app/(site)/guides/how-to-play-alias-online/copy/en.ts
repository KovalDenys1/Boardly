import type { GuideCopy } from '../../components/guide-definition'

const body = {
  need: {
    title: 'What You Need',
    items: [
      '3–16 players – two teams from four up, three teams of one at exactly three',
      'A browser — desktop, tablet, or mobile',
      'No account required (guest play available)',
      'Free — no download',
    ],
  },
  round: {
    title: 'How a Round Works',
    steps: [
      { title: 'Teams take turns', detail: 'Teams alternate. At the start of each turn, one player from the active team becomes the Describer.' },
      { title: 'The Describer sees a word', detail: 'Only the Describer can see the word on screen. The clock starts ticking — usually 30 to 60 seconds depending on your settings.' },
      { title: 'Describe the word — without saying it', detail: 'Use any words, comparisons, stories, or gestures to help your team guess. What you cannot do is say the word itself, any part of it, or anything that rhymes with it.' },
      { title: 'Team guesses out loud', detail: 'Your teammates shout their guesses. If someone gets it right, the Describer marks it correct and moves to the next word. Wrong guesses are fine — keep going.' },
      { title: 'Score and swap', detail: 'When the timer runs out, your team scores one point per correct word. Then the other team takes their turn with a new Describer.' },
      { title: 'Three turns each, then count up', detail: 'There is no score limit to race to. Every team gets three turns, and when the last one ends the highest total wins – two teams level on points finish tied.' },
    ],
  },
  cannotSay: {
    title: 'What You Cannot Say',
    rules: [
      { rule: 'The word itself', example: 'Word: Elephant → cannot say "Elephant"' },
      { rule: 'Any part of the word', example: 'Word: Football → cannot say "foot" or "ball"' },
      { rule: 'Sound-alike words', example: 'Word: Knight → cannot say "night"' },
    ],
  },
  describers: {
    title: 'Tips for Describers',
    tips: [
      { tip: 'Start with easy words', detail: "Do not get stuck on the first hard word. Skip it and come back — collecting easy points first builds your score and your team's confidence." },
      { tip: 'Use comparisons', detail: '"Like a car but you ride it and it has two wheels" works well. Compare the unknown thing to something your team definitely knows.' },
      { tip: 'Move fast, do not overthink', detail: 'The timer is your enemy. A rough description said quickly is worth more than a perfect one that takes 10 seconds to build.' },
      { tip: 'Use gestures for tricky words', detail: 'Gestures are allowed. If you cannot find the right words, show what you mean — mime it, point at things in the room.' },
    ],
  },
  guessers: {
    title: 'Tips for the Guessing Team',
    tips: [
      { tip: 'Shout everything', detail: 'Wrong guesses do not cost points. Say whatever comes to mind — you might land on the right word by accident.' },
      { tip: 'Listen for clues in the description', detail: 'Sometimes the way a word is described tells you its category — animal, place, action. Use that to narrow down your guesses.' },
      { tip: 'Build on each other', detail: "If a teammate guesses \"bird\" and the Describer reacts positively, try specific birds. Team guessing works best when players build on each other's ideas." },
    ],
  },
  onBoardly: {
    title: 'Playing on Boardly',
    modes: [
      { label: 'Team setup:', text: 'Split your group into 2 teams before the game. The game supports 3 to 16 players total, and at exactly three everyone is their own team.' },
      { label: 'Turn timer:', text: 'Choose 30, 60, 90, or 120 seconds per turn depending on how fast-paced you want the game.' },
      { label: 'No account needed:', text: 'Share a lobby link — everyone joins as a guest. Works on any device.' },
    ],
    more: 'Player counts, timers and everything else about the game are on the [Alias game page](/games/alias).',
  },
}

export type AliasGuideBody = typeof body

const en: GuideCopy<AliasGuideBody> = {
  title: 'How to Play Alias Online',
  subtitle: '5 min read · Free to play on Boardly · 3–16 players',
  question: 'How do you play Alias online?',
  answer: 'The group splits into two teams – or into three teams of one, when exactly three of you play – and on each turn one player describes words on their screen to their own side against the clock without using the word itself, where a guessed word is a point and a skipped one costs a point, and after three turns each the highest score wins.',
  cta: { label: 'Play Alias Now', detail: 'Gather your teams and start describing.' },
  related: [
    { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
    { href: '/guides/how-to-play-yahtzee-online', label: 'How to Play Yahtzee Online with Friends' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'How to Play Memory Card Game Online' },
    { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
  ],
  body,
  faqTitle: 'Alias Questions',
  faq: [
    {
      question: 'How many players does Alias need?',
      answer: 'Three to sixteen. Three is the odd one out: there is no team to describe to, so each player is their own team, the describer rotates, and the other two both guess. From four up it is two teams, and six or eight is where it comes alive, because a bigger team means more voices shouting guesses and a describer who has to cut through them.',
    },
    {
      question: 'Do we need a voice call?',
      answer: 'It is much better with one. Guessing is done out loud and at speed, and typing guesses into a chat box slows the game to the rhythm of the slowest typist. Any call works – the game itself runs in the browser beside it.',
    },
    {
      question: 'What counts as cheating when describing?',
      answer: 'Saying the word, or any part of it, in any language. Rhymes, letter counts and the first letter are also off – if your team could reconstruct the word from the shape of it rather than the meaning, the clue does not count.',
    },
    {
      question: 'Can I skip a word I cannot describe?',
      answer: "You can, but it is not free: a skip takes a point off your team's score for the turn, so it is only worth it when the word would otherwise eat more of the clock than one point is worth.",
    },
    {
      question: 'Are there bots for Alias?',
      answer: 'No. The game is one person describing something to another person, which is exactly what a bot cannot do – a canned clue is not a clue. If you are short a player, pick a game that supports bots instead.',
    },
    {
      question: 'How long does a game last?',
      answer: 'Three turns for every team, so six turns in a two-team game and about ten minutes at the default 60-second timer, closer to twenty at 120 seconds. The host picks the turn length when creating the lobby, from 30 up to 120 seconds.',
    },
  ],
}

export default en
