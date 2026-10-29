import type { GuideCopy } from '../../components/guide-definition'

const body = {
  goodGame: {
    title: 'What Makes a Good Game Night Game?',
    items: [
      'Easy to explain — everyone should be playing within 2 minutes',
      'Works for your group size — check the player count before picking',
      'No download needed — you lose half the group at that step',
      'Rounds are short enough to play again if someone wants a rematch',
    ],
  },
  games: {
    title: 'The Best Games for Game Night',
    noteLabel: 'Best for:',
    /** Guess the Spy, Alias, Yahtzee, Memory, Connect Four – the order `guide.tsx` ranks them in. */
    items: [
      {
        name: 'Guess the Spy',
        play: 'Play Guess the Spy',
        players: '3–10 players',
        why: 'The best game night opener. One player is secretly the spy, everyone else knows the location. Players ask each other questions and try to figure out who does not belong. Rounds take 5–8 minutes, so you can play several back to back.',
        note: 'Groups of 5 or more who want laughs and arguments',
      },
      {
        name: 'Alias',
        play: 'Play Alias',
        players: '3–16 players',
        why: "Split into two teams and race to guess words from your teammate's descriptions. High energy, fast-paced, and gets louder as the night goes on. Works great when you have a bigger group to split.",
        note: 'Competitive groups, team-based fun, 6+ players',
      },
      {
        name: 'Yahtzee',
        play: 'Play Yahtzee',
        players: '2–4 players',
        why: 'The classic dice game everyone knows. Roll five dice and fill the scorecard: nine categories in short mode, which is what a new lobby opens with, or all fifteen in classic. A classic game takes 15–20 minutes. Slower than the others but great for more relaxed sessions where you want to chat between turns.',
        note: 'Smaller groups, laid-back sessions, Yahtzee fans',
      },
      {
        name: 'Memory Card Game',
        play: 'Play Memory Card Game',
        players: '2–4 players',
        why: 'Everyone flips the same cards — when your opponent misses a pair, you see exactly where it went. Fast rounds, three difficulty levels. Easy to teach anyone in 30 seconds.',
        note: 'Smaller groups, quick filler rounds between bigger games',
      },
      {
        name: 'Connect Four',
        play: 'Play Connect Four',
        players: '2 players',
        why: 'Great for head-to-head matchups while the rest of the group watches. Run a bracket tournament and let the winner take on the next challenger. Rounds take under 5 minutes.',
        note: 'Tournaments, 1v1 while others watch, quick elimination rounds',
      },
    ],
  },
  groupSizes: {
    title: 'Which Games Work at Which Group Size',
    intro: 'Group size decides the night more than anything else on this list. A social deduction game with three people is a different game from the same one with nine, and a dice game that is tense at four drags at eight. Pick from the row that matches who actually turned up, not from who said they would.',
    sizes: [
      {
        size: '2 players',
        pick: 'Connect Four, Memory, Yahtzee',
        why: 'Head to head, no teams, no waiting. Connect Four is the shortest of the three and the easiest to replay until somebody stops losing.',
      },
      {
        size: '3 players',
        pick: 'Guess the Spy, Yahtzee, Memory',
        why: 'Three is the minimum for Guess the Spy and it plays tighter than a big table: every question counts and the spy has nowhere to hide. Yahtzee at three runs 20–25 minutes, and Alias takes three as well – each of you is your own team.',
      },
      {
        size: '4–6 players',
        pick: 'Alias, Guess the Spy',
        why: 'The sweet spot for a party. Four is the smallest Alias lobby that splits into two teams, and Guess the Spy at five or six gives the spy room to bluff without the round dragging.',
      },
      {
        size: '7 or more',
        pick: 'Guess the Spy, Alias',
        why: 'Both scale up – Guess the Spy to ten, Alias to sixteen. Run the quieter games as a side bracket so nobody is stuck watching for twenty minutes.',
      },
    ],
  },
  hosting: {
    title: 'Tips for Hosting an Online Game Night',
    items: [
      'Pick 2–3 games in advance and share the links before the call starts',
      'Start with Guess the Spy — it gets everyone talking immediately',
      'Switch games every 2–3 rounds to keep the energy up',
      'Let the group vote on the next game between rounds',
      'Keep a group chat open to share lobby links easily',
    ],
  },
}

export type GameNightGuideBody = typeof body

const en: GuideCopy<GameNightGuideBody> = {
  title: 'Best Online Games for Game Night',
  subtitle: '6 min read · All games free on Boardly · No download required',
  question: 'What are the best online games for game night?',
  answer: 'Guess the Spy for a group of five or more, Alias once you have enough people for two teams, and Yahtzee, Memory or Connect Four for a smaller or quieter night – all five run in the browser, need no account, and start from a link you paste into the group chat.',
  cta: { label: 'Browse All Games', detail: 'Pick your first game and share the link.' },
  related: [
    { href: '/guides/best-games-to-play-on-zoom', label: 'Best Games to Play on Zoom — Free, No Download' },
    { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
    { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
    { href: '/guides/how-to-play-alias-online', label: 'How to Play Alias Online' },
  ],
  body,
  faqTitle: 'Game Night Questions',
  faq: [
    {
      question: 'What can we play with exactly three people?',
      answer: 'Guess the Spy works at three and is sharper than it sounds – with nobody to hide behind, every question a player asks is evidence. Yahtzee and Memory also seat three, and both finish fast enough that the loser gets a rematch. Alias takes three too, played as three teams of one with the describer rotating, though it is a livelier game once there are enough of you for two proper teams.',
    },
    {
      question: 'Which of these is the best online party game?',
      answer: 'Alias, once you have six or more people. Two teams, a word to describe, a clock running – it is the loudest game on the list and the one that needs the least explaining. Guess the Spy is the better opener when the group is still warming up.',
    },
    {
      question: 'Do we need a video call to play?',
      answer: 'No. Guess the Spy and Alias are better with voice, because the whole game is people talking, and any call works – Zoom, Discord, Meet, a group phone call. Yahtzee, Memory and Connect Four need no voice at all; the in-game chat is enough.',
    },
    {
      question: 'Does everyone need an account?',
      answer: 'No. The host opens a lobby and shares the link, and everyone else joins as a guest with a name they type in. An account only buys you a saved profile and stats, and nobody needs one to sit down at the table.',
    },
    {
      question: 'How long does an online game night usually run?',
      answer: 'Two hours covers a good one: a couple of rounds of Guess the Spy to start, a longer stretch of Alias once everyone is warm, and a short game while people drop off. Switching every two or three rounds keeps the energy up better than one long session of anything.',
    },
    {
      question: 'What if someone drops out halfway through?',
      answer: 'Pick the next game around the people still there rather than waiting. Connect Four for the two who are left and Memory for up to four are the useful fallbacks – both start instantly and give a shrinking group something to do without restarting the night.',
    },
  ],
}

export default en
