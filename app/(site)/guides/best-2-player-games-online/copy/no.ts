import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { Best2PlayerGuideBody } from './en'

const no: LocalizedGuideCopy<Best2PlayerGuideBody> = {
  seo: {
    title: 'Spill for 2 på nett – gratis og uten nedlasting',
    description:
      'De beste gratis spillene for 2 på nett akkurat nå. Tre på rad, Hukommelse og flere – uten nedlasting og uten konto. Spill med en venn på sekunder.',
    ogTitle: 'Beste spill for 2 på nett – gratis',
    ogDescription: 'De beste gratis spillene for 2 som du kan spille i nettleseren akkurat nå – uten nedlasting og uten konto.',
    headline: 'Beste spill for 2 spillere på nett – gratis og uten nedlasting',
    articleDescription: 'Et utvalg av de beste gratis spillene for 2 spillere som du kan spille med en gang i hvilken som helst nettleser.',
    breadcrumbLabel: 'Beste spill for 2 på nett',
  },
  title: 'Beste spill for 2 spillere på nett – gratis, uten nedlasting',
  subtitle: '5 min lesetid · Alle spillene er gratis på Boardly · Ingen konto nødvendig',
  question: 'Hva er de beste spillene for 2 spillere på nett?',
  answer: 'Tre på rad når runden skal være over på under et minutt, Fire på rad for noe taktisk som likevel går fort, Hukommelse for en jevn kamp om oppmerksomhet, og Yatzy når dere har tjue minutter – alle fire er gratis i nettleseren, uten nedlasting og uten konto for noen av dere.',
  cta: { label: 'Se alle spillene', detail: 'Velg et spill og utfordre vennen din nå.' },
  related: [
    { href: '/guides/how-to-play-tic-tac-toe-online', label: 'Slik spiller du Tre på rad online' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'Slik spiller du Hukommelse – memory-spill på nett' },
    { href: '/guides/how-to-play-yahtzee-online', label: 'Slik spiller du Yatzy på nett med venner' },
    { href: '/guides/best-online-games-for-game-night', label: 'De beste nettspillene til spillkvelden' },
    { href: '/guides/how-to-play-connect-four-online', label: 'Slik spiller du Fire på rad online' },
  ],
  body: {
    comparison: {
      title: 'Rask sammenligning',
      columns: { game: 'Spill', length: 'Rundelengde', skill: 'Ferdighet' },
      rows: [
        { name: 'Tre på rad', length: '<1 min', skill: 'Mønstergjenkjenning' },
        { name: 'Hukommelse', length: '5–10 min', skill: 'Hukommelse og oppmerksomhet' },
        { name: 'Fire på rad', length: '3–5 min', skill: 'Å planlegge framover' },
        { name: 'Yatzy', length: '15–20 min', skill: 'Terninger + strategi' },
      ],
    },
    games: {
      title: 'De beste spillene for 2',
      tipLabel: 'Tips:',
      fullGuide: 'Hele guiden',
      items: [
        {
          name: 'Tre på rad',
          play: 'Spill Tre på rad',
          tagline: 'Best til: Raske dueller 1 mot 1 · <1 min · Mønstergjenkjenning',
          why: 'Det raskeste spillet for 2 på nett. En runde tar under et minutt. Spill best av 3 eller best av 5 for en ordentlig konkurranse – revansjen er klar på sekunder. Du kan spille mot en bot hvis vennen din ikke er ledig.',
          tip: 'Ta midtruten først – den er med i 4 vinnerlinjer, flere enn noen annen rute.',
        },
        {
          name: 'Hukommelse',
          play: 'Spill Hukommelse',
          tagline: 'Best til: Konkurranse om å finne par · 5–10 min · Hukommelse og oppmerksomhet',
          why: 'Snu kort, finn par, slå motstanderen. Begge ser det samme brettet – når motstanderen bommer på et par, ser du nøyaktig hvor kortene ligger. Tre vanskelighetsnivåer: Lett (4×4, 8 par), Middels (5×4, 10 par), Vanskelig (6×6, 18 par).',
          tip: 'Følg med når motstanderen snur kort – bommene deres er hint til din neste tur.',
        },
        {
          name: 'Fire på rad',
          play: 'Spill Fire på rad',
          tagline: 'Best til: Taktiske dueller · 3–5 min · Å planlegge framover',
          why: 'To plasser, ingen terninger og ingenting skjult for noen av dere. Slipp en brikke, blokker motstanderen, få fire på rad. Det er det korteste spillet her som likevel straffer et uforsiktig trekk, og det gjør det til det beste av de fire for en lang serie med revansjer.',
          tip: 'Spill i midtkolonnen først – den er med i flere vinnerlinjer enn noen annen kolonne på brettet.',
        },
        {
          name: 'Yatzy',
          play: 'Spill Yatzy',
          tagline: 'Best til: Lengre strategiøkter · 15–20 min · Terninger + strategi',
          why: 'Kast fem terninger og fyll poenglisten, og få flere poeng enn motstanderen. En ny lobby starter i kort modus – ni kategorier – og klassisk modus åpner alle femten for et spill på 15–20 minutter. Mer strategisk enn de andre – terningene gir variasjon, men det er smarte valg av kategori som vinner spill.',
          tip: 'I klassisk modus bør du jakte på bonusen i øvre seksjon tidlig: 35 poeng for 63+ fra Enere til Seksere. Kort modus har ingen øvre seksjon, så bonusen gjelder aldri.',
        },
      ],
    },
    tips: {
      title: 'Tips til å spille på nett med én venn',
      items: [
        'Del lobbylenken direkte – ingen av dere trenger konto',
        'Spill på hvilken som helst enhet – PC, mobil og nettbrett fungerer alle',
        'Revansj med ett klikk – ingen grunn til å sette opp et nytt spill etter hver runde',
        'Hver tur går på klokke, 60 sekunder som standard og 30 til 120 der lobbyen lar deg velge',
      ],
    },
  },
  faqTitle: 'Spill for 2: vanlige spørsmål',
  faq: [
    {
      question: 'Hva er de beste gratis spillene for 2 på nett?',
      answer: 'Tre på rad for en runde på ett minutt, Hukommelse når dere vil ha en skikkelig kamp om oppmerksomhet, Fire på rad for noe taktisk som likevel går fort, og Yatzy når dere har tjue minutter. Alle fire er gratis på Boardly, i nettleseren, uten nedlasting og uten konto.',
    },
    {
      question: 'Kan jeg spille spill for 2 gratis på nett uten å laste ned noe?',
      answer: 'Ja. Alle spillene her kjører i nettleseren på PC, nettbrett og mobil. Den ene oppretter en lobby og deler lenken, og noen sekunder senere er den andre med i samme spill – det er ingenting å installere for noen av dere.',
    },
    {
      question: 'Hva er det beste raske spillet for 2 på nett?',
      answer: 'Tre på rad. En runde tar under et minutt, og best av tre eller best av fem får plass på under fem. Fire på rad er neste steg: like oversiktlig på én skjerm, et reelt valg i hvert trekk og runder på under fem minutter.',
    },
    {
      question: 'Hvilket spill for 2 på nett er best for å konkurrere med en venn?',
      answer: 'Hukommelse, fordi begge ser på det samme brettet og ingenting er skjult for noen av dere – vinneren er den som fulgte best med. Yatzy er bedre for en lengre økt, der valg av kategori betyr mer enn et enkelt kast.',
    },
    {
      question: 'Må begge spillerne ha en konto?',
      answer: 'Nei. Ingen av dere trenger det. Den ene oppretter lobbyen og deler lenken, og den andre blir med som gjest ved å skrive inn et navn. En konto gir bare en lagret profil og statistikk.',
    },
    {
      question: 'Kan jeg spille alene hvis vennen min ikke er der?',
      answer: 'Ja, mot en bot: alle fire spillene har en, på lett, middels og vanskelig. Tre på rad og Fire på rad ligger nærmest det ekte, fordi en bot spiller dem akkurat som et menneske ville gjort. Boten i Hukommelse spiller det samme hukommelsesspillet som deg, og Yatzy mot en bot er egentlig et kappløp om den beste poenglisten.',
    },
  ],
}

export default no
