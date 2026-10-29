import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { YahtzeeGuideBody } from './en'

const no: LocalizedGuideCopy<YahtzeeGuideBody> = {
  seo: {
    title: 'Slik spiller du Yatzy på nett med venner – regler og tips',
    description:
      'Lær å spille Yatzy på nett, steg for steg. Alle poengkategoriene forklart, strategitips for nye og erfarne spillere, og hvordan du starter et spill med venner.',
    ogTitle: 'Slik spiller du Yatzy på nett med venner',
    ogDescription: 'Komplett Yatzy-guide – regler, poengkategorier og strategitips. Gratis flerspiller i nettleseren.',
    headline: 'Slik spiller du Yatzy på nett med venner – komplett guide',
    articleDescription: 'Steg-for-steg-guide til Yatzy på nett – regler, poeng og strategitips.',
    breadcrumbLabel: 'Slik spiller du Yatzy på nett',
  },
  title: 'Slik spiller du Yatzy på nett med venner',
  subtitle: '6 min lesetid · Gratis å spille på Boardly · 1–4 spillere',
  question: 'Hvordan spiller man Yatzy på nett med venner?',
  answer: 'Når det er din tur, kaster du fem terninger opptil tre ganger og holder de du vil beholde mellom kastene, og så fører du resultatet i en av rutene på poenglisten – når alle rutene er fylt, vinner høyeste sum, og står flere likt, blir det delt seier.',
  cta: { label: 'Spill Yatzy nå', detail: 'Klar til å prøve det i praksis?' },
  related: [
    { href: '/guides/best-online-games-for-game-night', label: 'De beste nettspillene til spillkvelden' },
    { href: '/guides/how-to-play-spy-game-online', label: 'Slik spiller du Gjett spionen på nett' },
    { href: '/guides/how-to-play-connect-four-online', label: 'Slik spiller du Fire på rad online' },
    { href: '/guides/best-2-player-games-online', label: 'Beste spill for 2 spillere på nett – gratis, uten nedlasting' },
  ],
  body: {
    need: {
      title: 'Dette trenger du',
      items: [
        '1–4 spillere (spill alene mot en bot eller med venner)',
        'En nettleser – på PC, nettbrett eller mobil',
        'Ingen konto (du kan spille som gjest)',
        'Gratis – ingenting å laste ned',
      ],
    },
    rules: {
      title: 'De grunnleggende reglene',
      paragraphs: [
        'I hver tur kaster du fem terninger. Du kan kaste noen av dem eller alle på nytt opptil to ganger til (tre kast totalt). Etter kastene må du føre resultatet i én av de 15 poengkategoriene. En utfylt rute kan ikke endres, og det gjelder også selve Yatzy-ruten: fem like gir 50 poeng én gang, og en ny Yatzy må føres et annet sted. Spillet er slutt når alle spillerne har fylt alle 15 kategoriene, eller alle 9 i kort modus.',
        'Spilleren med høyest totalsum vinner, og står flere likt på topp, deler de seieren. Du får 35 bonuspoeng hvis summen i øvre seksjon blir 63 eller mer. Kort modus, turtid og bot-motstandere velger du når du oppretter et spill fra [Yatzy-siden](/games/yahtzee).',
      ],
    },
    categories: {
      title: 'Alle de 15 poengkategoriene',
      upperTitle: 'Øvre seksjon',
      upper: [
        { name: 'Enere (1)', desc: 'Summen av alle terninger som viser 1', example: '1+1+3+4+6 = 2 poeng' },
        { name: 'Toere (2)', desc: 'Summen av alle terninger som viser 2', example: '2+2+2+4+6 = 6 poeng' },
        { name: 'Treere (3)', desc: 'Summen av alle terninger som viser 3', example: '3+3+3+4+6 = 9 poeng' },
        { name: 'Firere (4)', desc: 'Summen av alle terninger som viser 4', example: '4+4+4+4+6 = 16 poeng' },
        { name: 'Femmere (5)', desc: 'Summen av alle terninger som viser 5', example: '5+5+5+5+6 = 20 poeng' },
        { name: 'Seksere (6)', desc: 'Summen av alle terninger som viser 6', example: '6+6+6+6+6 = 30 poeng' },
      ],
      lowerTitle: 'Nedre seksjon',
      lower: [
        { name: 'Ett par', desc: 'Summen av det høyeste paret', example: '5+5+1+2+3 = 10 poeng' },
        { name: 'To par', desc: 'Summen av begge parene', example: '5+5+3+3+1 = 16 poeng' },
        { name: 'Tre like', desc: 'Summen av alle 5 terningene', example: '3+3+3+5+6 = 20 poeng' },
        { name: 'Fire like', desc: 'Summen av alle 5 terningene', example: '4+4+4+4+2 = 18 poeng' },
        { name: 'Hus', desc: 'Tre like + to like av en annen verdi', example: 'Fast 25 poeng' },
        { name: 'Liten straight', desc: '4 terninger i rekkefølge', example: 'Fast 30 poeng' },
        { name: 'Stor straight', desc: '5 terninger i rekkefølge', example: 'Fast 40 poeng' },
        { name: 'Yatzy!', desc: 'Alle fem terningene like', example: 'Fast 50 poeng' },
        { name: 'Sjanse', desc: 'Hva som helst – summen av alle 5 terningene', example: 'Grei nødløsning' },
      ],
    },
    strategy: {
      title: 'Strategitips',
      tips: [
        { tip: 'Jakt på bonusen i øvre seksjon', detail: 'Sikt mot minst 3 av hvert tall i øvre seksjon – da kommer du opp i 63 poeng og får 35 i bonus.' },
        { tip: 'Hold Yatzy-sjansen i live', detail: 'Har du 3 eller 4 like etter første kast, lønner det seg som regel å gå for Yatzy i stedet for å nøye deg med tre like.' },
        { tip: 'Spar Sjanse til nødstilfeller', detail: 'Sjanse gir summen av alle terningene – spar den til turer der ingenting annet passer. En god Sjanse ligger gjerne på 20+.' },
        { tip: 'Stryk de lave rutene tidlig', detail: 'Får du et dårlig kast, kan du stryke Enere eller Toere tidlig – de er uansett verdt lite.' },
        { tip: 'Prioriter stor straight over liten', detail: 'Stor straight gir 40 poeng, liten gir 30. Har du 4 terninger i rekkefølge etter kast 1, går du for den store.' },
      ],
      more: 'Disse fem dekker det grunnleggende. Den dypere planen – når femti poeng er verdt å jakte, hvor en ny Yatzy skal føres og feilene som koster bonusen – finner du i [strategidelen på Yatzy-siden](/games/yahtzee#strategy).',
    },
  },
  faqTitle: 'Spørsmål om Yatzy',
  faq: [
    {
      question: 'Hvor mange ganger kan jeg kaste terningene i én tur?',
      answer: 'Tre. Første kast tar alle fem terningene; før hvert av de to neste velger du hvilke du vil holde, og kaster resten på nytt. Du kan også stoppe tidlig og føre det du har.',
    },
    {
      question: 'Hva er bonusen i øvre seksjon?',
      answer: 'Trettifem ekstra poeng hvis du får 63 eller mer til sammen fra Enere til Seksere. Sekstitre tilsvarer tre like i hver av de seks rutene, så mangler du noe i én rute, må du ta det igjen i en annen.',
    },
    {
      question: 'Må jeg føre poeng i hver tur?',
      answer: 'Ja. Hver tur slutter med at du fører et tall i en tom rute, også når kastet er dårlig – det er derfor man stryker Enere eller Sjanse med en null. Du kan ikke hoppe over en tur eller bruke en rute du allerede har fylt.',
    },
    {
      question: 'Er stor straight verdt mer enn liten straight?',
      answer: 'Ja: 40 mot 30. Ligger fire terninger allerede i rekkefølge etter første kast, er den store som regel verdt forsøket, fordi den lille står igjen som reserve.',
    },
    {
      question: 'Kan jeg spille Yatzy alene?',
      answer: 'Ja. Yatzy har plass til én til fire spillere, så et spill alene er en helt vanlig lobby, og vil du heller ha en motstander, finnes det en bot på tre vanskelighetsnivåer.',
    },
    {
      question: 'Hvor lang tid tar et spill?',
      answer: 'Femten til tjue minutter med to spillere og litt lenger med fire, fordi alle fyller den samme poenglisten. Det er det lengste spillet på Boardly, og det beste når folk vil prate litt mellom turene.',
    },
    {
      question: 'Hva er kort modus?',
      answer: 'Et spill med ni kategorier: bare nedre seksjon, fra Ett par til Sjanse, som kutter rundt 40 % av spilletiden. Kort modus har ingen øvre seksjon, så bonusen på 35 poeng gjelder aldri. Velg den når gjengen vil ha et spill som faktisk blir ferdig.',
    },
  ],
}

export default no
