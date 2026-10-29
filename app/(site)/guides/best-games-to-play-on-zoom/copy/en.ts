import type { GuideCopy } from '../../components/guide-definition'

const body = {
  why: {
    title: 'Why Browser Games Work So Well on Video Calls',
    paragraphs: [
      'The problem with most Zoom games is they require screen sharing, a separate app, or someone to run a host setup. Browser games solve all of this.',
      'With Boardly, the host creates a lobby and drops the link in the Zoom chat. Everyone clicks it and joins in their own browser tab — no screen sharing needed, no downloads, no accounts. The video call stays open for talking; the game runs in the browser.',
    ],
  },
  games: {
    title: 'The Best Games for Zoom Calls',
    noteLabel: 'On Zoom:',
    /** Guess the Spy, Alias, Yahtzee, Memory, Tic Tac Toe – the order `guide.tsx` ranks them in. */
    items: [
      {
        name: 'Guess the Spy',
        play: 'Play Guess the Spy',
        players: '3–10 players',
        why: 'Made for video calls. Players ask each other questions out loud — the conversation happens on Zoom, the roles happen in the browser. Nobody needs to share screens. Everyone just opens the same lobby link.',
        note: 'Ask questions verbally on the call, vote by speaking up',
      },
      {
        name: 'Alias',
        play: 'Play Alias',
        players: '3–16 players',
        why: 'The Describer talks, the team yells guesses — all of it happens naturally on the call. The browser just handles the words and the score. Great for groups who want something loud and energetic.',
        note: 'Describer talks, team shouts guesses — all on the call',
      },
      {
        name: 'Yahtzee',
        play: 'Play Yahtzee',
        players: '2–4 players',
        why: 'Each player controls their own dice on their own screen. No screen sharing needed. You can chat between turns, which is the best part of Yahtzee anyway. Works well for 2–4 people on a casual call.',
        note: 'Everyone plays on their own screen, chat between turns',
      },
      {
        name: 'Memory Card Game',
        play: 'Play Memory Card Game',
        players: '2–4 players',
        why: 'Everyone sees the same board in their browser. When someone flips cards, you can react out loud on the call. Short rounds mean you can easily fit multiple games into a call.',
        note: "React to each other's moves out loud — the game is in the browser",
      },
      {
        name: 'Tic Tac Toe',
        play: 'Play Tic Tac Toe',
        players: '2 players',
        why: 'Quick 1v1 rounds while everyone else watches on the call. Play a best-of-5 series and let the winner take on the next challenger. Each round takes under a minute.',
        note: 'Quick 1v1 while others watch and comment on the call',
      },
    ],
  },
  start: {
    title: 'How to Start Playing on a Zoom Call',
    steps: [
      '1. Open boardly.online and pick a game',
      '2. Create a lobby — takes about 10 seconds',
      '3. Copy the lobby link and paste it into your Zoom chat',
      '4. Everyone clicks the link and joins in their browser',
      '5. Start the game — no accounts, no downloads for anyone',
    ],
  },
  windows: {
    title: "Keeping the Call and the Game Out of Each Other's Way",
    paragraphs: [
      'The one thing that goes wrong on a video call is the window fight: the game takes the whole screen and the faces disappear, or the call stays maximised and half the group loses the board. Put the call in its small floating window and the game tab beside it, and tell everyone to do the same before the first round rather than during it.',
      'On a phone it is the other way round: the browser and the call cannot share the screen, so the call goes on speaker in the background and the game takes the display. That works for Guess the Spy and Alias, where all you need from the call is voice, and it is the reason those two are the picks for a group joining from phones.',
      'Do not share your screen for any of these games. Screen sharing shows everyone your view of the board, which spoils Guess the Spy outright, adds a second or two of lag to everything else, and puts one person in charge of what the group can see. Each player in their own tab is both simpler and fairer.',
    ],
  },
}

export type ZoomGuideBody = typeof body

const en: GuideCopy<ZoomGuideBody> = {
  title: 'Best Games to Play on Zoom — Free, No Download',
  subtitle: '5 min read · Works with Zoom, Google Meet, FaceTime, and any video call',
  question: 'What are the best games to play on a Zoom call?',
  answer: 'Guess the Spy and Alias, because the whole game is people talking and the call is already doing that work, with Yahtzee, Memory and Tic Tac Toe for a quieter call – the host pastes a lobby link into the Zoom chat and nobody screen shares, downloads or signs in.',
  cta: { label: 'Browse All Games', detail: 'Pick a game, share the link in your call chat, and start.' },
  related: [
    { href: '/guides/best-online-games-for-game-night', label: 'Best Online Games for Game Night' },
    { href: '/guides/best-2-player-games-online', label: 'Best 2 Player Games Online — Free, No Download' },
    { href: '/guides/how-to-play-alias-online', label: 'How to Play Alias Online' },
    { href: '/guides/how-to-play-spy-game-online', label: 'How to Play Guess the Spy Online' },
  ],
  body,
  faqTitle: 'Zoom Game Questions',
  faq: [
    {
      question: 'Do I need to share my screen to play?',
      answer: 'No, and you should not. Everyone opens the lobby link in their own browser and sees their own view of the game. Screen sharing would leak the spy in Guess the Spy and slow every other game down for no gain.',
    },
    {
      question: 'Does this work on Google Meet, Teams or FaceTime?',
      answer: 'Yes. Nothing here is specific to Zoom – the call only has to carry voice and a chat box you can paste a link into. Where there is no chat box, send the link in a group message instead.',
    },
    {
      question: 'What is the best Zoom game for a big work call?',
      answer: 'Guess the Spy. It seats up to ten, a round runs five to eight minutes, and it gets people who do not know each other talking without any warm-up. Alias is the better pick if the group is large enough to split into two teams and already knows one another.',
    },
    {
      question: 'Can people join from their phones?',
      answer: 'Yes. The games run in a mobile browser, so a player on a phone joins from the same link. Put the call on speaker and keep the game in the browser – on a phone the two cannot share the screen.',
    },
    {
      question: 'What happens if someone drops off the call mid-game?',
      answer: 'They reopen the lobby link and are back in the same game. The lobby stays open, so a short drop usually costs a turn – though a Tic Tac Toe turn whose clock runs out forfeits the round, so a long one can cost more than that.',
    },
  ],
}

export default en
