import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { TicTacToeGuideBody } from './en'

const no: LocalizedGuideCopy<TicTacToeGuideBody> = {
  seo: {
    title: 'Slik spiller du tre på rad online – regler og strategi',
    description:
      'Komplett guide til tre på rad (bondesjakk) – regler, alle 8 vinnerlinjene og strategien som gjør at du aldri taper. Gratis mot en bot eller med 2 spillere.',
    ogTitle: 'Slik spiller du tre på rad online',
    ogDescription: 'Komplett guide til tre på rad – regler, vinnerlinjer og strategien som gjør at du aldri taper. Gratis mot en bot eller med 2 spillere.',
    headline: 'Slik spiller du Tre på rad online – komplett guide',
    articleDescription: 'Regler, vinnerlinjer og strategi for Tre på rad.',
    breadcrumbLabel: 'Slik spiller du Tre på rad',
  },
  title: 'Slik spiller du Tre på rad online',
  subtitle: '5 min lesetid · Gratis å spille på Boardly · 2 spillere eller mot en bot',
  question: 'Hvordan spiller man tre på rad online?',
  answer: 'To spillere bytter på å sette merket sitt i en rute på et rutenett på 3×3, X begynner, og den som først får tre av sine egne merker på rad – i en av de tre radene, tre kolonnene eller to diagonalene – vinner runden.',
  cta: { label: 'Spill Tre på rad nå', detail: 'Klar til å sette strategien din på prøve?' },
  related: [
    { href: '/guides/how-to-play-yahtzee-online', label: 'Slik spiller du Yatzy på nett med venner' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'Slik spiller du Hukommelse – memory-spill på nett' },
    { href: '/guides/how-to-play-spy-game-online', label: 'Slik spiller du Gjett spionen på nett' },
    { href: '/guides/best-2-player-games-online', label: 'Beste spill for 2 spillere på nett – gratis, uten nedlasting' },
  ],
  body: {
    need: {
      title: 'Dette trenger du',
      items: [
        '2 spillere – eller spill alene mot en bot',
        'En nettleser – på PC, nettbrett eller mobil',
        'Ingen konto (du kan spille som gjest)',
        'Gratis – ingenting å laste ned',
      ],
    },
    rules: {
      title: 'Reglene',
      steps: [
        { title: 'Velg merke', detail: 'Den ene spilleren er X, den andre O. X åpner første runde; i en serie bytter de to merkene på å begynne.' },
        { title: 'Bytt på', detail: 'Spillerne setter annenhver gang merket sitt i en ledig rute på rutenettet på 3×3.' },
        { title: 'Vinn med tre på rad', detail: 'Få tre av merkene dine på rad – vannrett, loddrett eller diagonalt – så vinner du.' },
        { title: 'Uavgjort', detail: 'Er alle 9 rutene fylt uten at noen har tre på rad, blir det uavgjort. Spiller begge feilfritt, ender hvert eneste spill uavgjort.' },
      ],
    },
    lines: {
      title: 'Alle de 8 vinnerlinjene',
      intro: 'Det finnes nøyaktig 8 måter å vinne på. Tre merker i en av disse linjene vinner spillet:',
      items: [
        'Øverste rad (1-2-3)',
        'Midterste rad (4-5-6)',
        'Nederste rad (7-8-9)',
        'Venstre kolonne (1-4-7)',
        'Midterste kolonne (2-5-8)',
        'Høyre kolonne (3-6-9)',
        'Diagonal (1-5-9)',
        'Diagonal (3-5-7)',
      ],
    },
    strategy: {
      title: 'Strategi – slik taper du aldri',
      tips: [
        { tip: 'Start i midten (som X)', detail: 'Midtruten er med i 4 vinnerlinjer – flere enn noen annen rute. Tar du den først, får du flest muligheter til å vinne.' },
        { tip: 'Ta et hjørne hvis midten er tatt', detail: 'Hvert hjørne er med i 3 vinnerlinjer. Tar motstanderen midten, setter du merket i et hjørne og bygger opp trusler på diagonalen.' },
        { tip: 'Blokker før du angriper', detail: 'Har motstanderen to på rad, blokkerer du den tredje ruten med en gang. En glemt blokkering koster nesten alltid spillet.' },
        { tip: 'Lag to vinnertrusler på én gang', detail: 'Kan du stå ett trekk fra seier på to forskjellige steder samtidig, kan motstanderen bare stoppe den ene. Du vinner på den andre.' },
        { tip: 'Hindre motstanderen i å gjøre det samme', detail: 'Ser du at motstanderen bygger mot to trusler samtidig, blokkerer du – enten ved å ta ruten de trenger, eller ved å lage en egen trussel som de må svare på.' },
      ],
    },
    onBoardly: {
      title: 'Slik spiller du på Boardly',
      modes: [
        { label: 'Mot en bot:', text: 'Spill alene mot en bot – fint for å øve på strategi uten å vente på en motstander.' },
        { label: 'Mot en venn:', text: 'Del en lobbylenke og spill i sanntid. Ingen av dere trenger konto.' },
        { label: 'Kampmodus:', text: 'Spill en serie runder for å kåre en samlet vinner – best av 3 eller best av 5.' },
      ],
      more: 'Alt dette velger du når du oppretter et spill fra [siden for Tre på rad](/games/tic-tac-toe).',
    },
  },
  faqTitle: 'Spørsmål om Tre på rad',
  faq: [
    {
      question: 'Hvor mange måter kan man vinne på?',
      answer: 'Åtte: tre rader, tre kolonner og to diagonaler. Midtruten ligger på fire av dem, hvert hjørne på tre og hver kantrute på bare to – og det er egentlig hele åpningsteorien.',
    },
    {
      question: 'Kan man alltid vinne i tre på rad?',
      answer: 'Nei. To spillere som begge vet hva de gjør, spiller uavgjort hver gang – spillet er løst. Det du kan gjøre, er å aldri tape: ta midten når den er ledig, og svar på hver to-på-rad før du bygger din egen.',
    },
    {
      question: 'Hvorfor ender så mange spill uavgjort?',
      answer: 'Fordi brettet er så lite at begge spillerne ser alle truslene. Uavgjort er det normale resultatet mellom to like gode spillere, og derfor avgjøres det som regel i en serie på best av tre eller best av fem.',
    },
    {
      question: 'Kan jeg spille mot datamaskinen?',
      answer: 'Ja, på tre nivåer. Den lette boten overser trusler, den middels blokkerer, men planlegger ikke, og den vanskelige spiller det løste spillet – mot den er uavgjort det beste noen kan oppnå.',
    },
    {
      question: 'Hvor lang tid tar en runde?',
      answer: 'Under et minutt. Det er derfor det er det beste spillet her for en revansj: dere to kan spille en serie på fem runder på den tiden én runde av noe større ville tatt.',
    },
    {
      question: 'Begynner X alltid?',
      answer: 'X åpner første runde, og å begynne er en reell fordel i et så lite spill. Spillet gir åpningstrekket til det andre merket hver runde, så ingen trenger å bytte plass for å dele det rettferdig. Over et oddetall runder går det likevel ikke helt opp: i en hel serie på best av tre åpner X to av rundene og O én.',
    },
  ],
}

export default no
