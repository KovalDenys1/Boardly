import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { ConnectFourGuideBody } from './en'

const no: LocalizedGuideCopy<ConnectFourGuideBody> = {
  seo: {
    title: 'Slik spiller du fire på rad online – regler og tips',
    description:
      'Lær å spille fire på rad online. Enkle regler, vinnermønstre og tips som hjelper deg å slå motstanderen gang på gang. Gratis spill for 2 i nettleseren.',
    ogTitle: 'Slik spiller du fire på rad online',
    ogDescription: 'Komplett guide til Fire på rad – regler, vinnermønstre og strategitips. Gratis spill for 2 i nettleseren.',
    headline: 'Slik spiller du Fire på rad online – komplett guide',
    articleDescription: 'Regler, vinnermønstre og strategi for Fire på rad.',
    breadcrumbLabel: 'Slik spiller du Fire på rad',
  },
  title: 'Slik spiller du Fire på rad online',
  subtitle: '5 min lesetid · Gratis å spille på Boardly · 2 spillere eller mot en bot',
  question: 'Hvordan spiller man fire på rad online?',
  answer: 'To spillere bytter på å slippe en brikke ned i en av sju kolonner, der den faller til den laveste ledige raden, og den første som får fire i sin egen farge på linje – vannrett, loddrett eller diagonalt – vinner.',
  cta: { label: 'Spill Fire på rad nå', detail: 'Klar til å slippe den første brikken?' },
  related: [
    { href: '/guides/how-to-play-yahtzee-online', label: 'Slik spiller du Yatzy på nett med venner' },
    { href: '/guides/how-to-play-tic-tac-toe-online', label: 'Slik spiller du Tre på rad online' },
    { href: '/guides/best-2-player-games-online', label: 'Beste spill for 2 spillere på nett – gratis, uten nedlasting' },
    { href: '/guides/best-online-games-for-game-night', label: 'De beste nettspillene til spillkvelden' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'Slik spiller du Hukommelse – memory-spill på nett' },
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
        { title: 'Brettet', detail: 'Brettet har 7 kolonner og 6 rader. Den ene spilleren har røde brikker, den andre gule.' },
        { title: 'Slipp en brikke etter tur', detail: 'Når det er din tur, velger du en kolonne og slipper brikken ned i den. Den faller til den laveste ledige raden i kolonnen.' },
        { title: 'Få fire på rad for å vinne', detail: 'Få fire av brikkene dine på en rett linje – vannrett, loddrett eller diagonalt. Den som klarer det først, vinner.' },
        { title: 'Uavgjort', detail: 'Blir alle 42 plassene fylt uten at noen har fire på rad, ender spillet uavgjort.' },
      ],
    },
    directions: {
      title: 'Vinnerretninger',
      intro: 'Fire på rad teller i alle disse retningene:',
      items: ['Vannrett', 'Loddrett', 'Diagonalt ned mot høyre', 'Diagonalt ned mot venstre'],
    },
    strategy: {
      title: 'Strategitips',
      tips: [
        { tip: 'Start i den midterste kolonnen', detail: 'Midtkolonnen (kolonne 4) er med i flere vinnerlinjer enn noen annen. Slipp den første brikken der – det gir deg flest muligheter.' },
        { tip: 'Bygg nedenfra', detail: 'Stabler du høyt tidlig, får du færre muligheter. Bygg linjene dine lavt først – brettet fylles fort, og lave brikker er vanskeligere å blokkere.' },
        { tip: 'Følg med på diagonalene', detail: 'Diagonale seire er de letteste å overse. Før du slipper en brikke, sjekk at du ikke tilfeldigvis hjelper motstanderen med å fullføre en diagonal.' },
        { tip: 'Lag to trusler på én gang', detail: 'Klarer du å få to forskjellige måter å vinne på samtidig, kan motstanderen bare blokkere den ene. Det vinner nesten hver gang.' },
        { tip: 'Ikke fyll en kolonne for tidlig', detail: 'Når en kolonne er full, er den borte. Gir det motstanderen en vinnerplass oppå hvis du fyller den, venter du til tiden er inne.' },
      ],
      more: 'Disse fem dekker det grunnleggende. Den dypere planen – å holde to trusler i hver sin kolonne, hvorfor oddetalls- og partallsrader betyr noe, og hvordan du spiller mot den vanskelige boten – finner du i [strategidelen på siden for Fire på rad](/games/connect-four#strategy).',
    },
    onBoardly: {
      title: 'Slik spiller du på Boardly',
      modes: [
        { label: 'Mot en bot:', text: 'Spill alene når som helst. Fint for å øve før du utfordrer en venn.' },
        { label: 'Mot en venn:', text: 'Del en lobbylenke – vennen din er med på sekunder, uten konto.' },
        { label: 'Turtid:', text: 'Hver tur går på nedtelling, og går tiden ut, taper du runden. Velg 30, 60, 90 eller 120 sekunder når du oppretter lobbyen.' },
      ],
      more: 'Alt dette velger du når du oppretter et spill fra [siden for Fire på rad](/games/connect-four).',
    },
  },
  faqTitle: 'Spørsmål om Fire på rad',
  faq: [
    {
      question: 'Hvor stort er brettet i Fire på rad?',
      answer: 'Sju kolonner og seks rader, 42 plasser i alt. Du velger en kolonne og ikke en rute, og brikken faller til den laveste ledige raden – og derfor er trekket du helst vil gjøre, ofte ikke tilgjengelig ennå.',
    },
    {
      question: 'Hvem begynner, og spiller det noen rolle?',
      answer: 'Lobbyverten begynner, og beholder åpningstrekket i hver runde av en serie. Det spiller en rolle: med perfekt spill vinner den som begynner, og derfor er åpningstrekket i midtkolonnen verdt så mye. Vil dere ha en jevn serie, bytter dere på hvem som oppretter lobbyen.',
    },
    {
      question: 'Hva skjer hvis brettet blir fullt?',
      answer: 'Er alle 42 plassene tatt uten at noen har fire på rad, blir spillet uavgjort, og ingen får poeng. Uavgjort er sjeldent mellom spillere på ulikt nivå og vanlig mellom to forsiktige spillere.',
    },
    {
      question: 'Kan jeg spille Fire på rad mot datamaskinen?',
      answer: 'Ja, på tre vanskelighetsnivåer. Den lette boten slipper brikken i en tilfeldig ledig kolonne, mens den vanskelige regner seks trekk fram og straffer en brikke du slipper uten å sjekke diagonalene.',
    },
    {
      question: 'Er det tidsbegrensning på hver tur?',
      answer: 'Ja, på hver eneste tur. Verten velger 30, 60, 90 eller 120 sekunder når lobbyen opprettes, og 60 er standard, men det finnes ingen innstilling som slår av klokka. Går tiden ut, taper du runden, så det lønner seg å følge med selv på de lange innstillingene.',
    },
    {
      question: 'Teller diagonale linjer?',
      answer: 'Ja, i begge retninger, og det er dem de fleste tapte spill handler om. En loddrett eller vannrett trussel er lett å se; en diagonal bygges opp én brikke om gangen over fire forskjellige kolonner og er lett å overse.',
    },
  ],
}

export default no
