import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { AliasGuideBody } from './en'

const no: LocalizedGuideCopy<AliasGuideBody> = {
  seo: {
    title: 'Slik spiller du Alias på nett med venner – regler og tips',
    description:
      'Lær å spille Alias på nett med venner. Regler, hvordan du forklarer ord, tips til laget og hvordan dere vinner. Gratis ordspill for gjengen i nettleseren.',
    ogTitle: 'Slik spiller du Alias på nett',
    ogDescription: 'Komplett Alias-guide – regler, hvordan du forklarer ord godt, og tips som hjelper laget ditt å vinne. Gratis flerspiller i nettleseren.',
    headline: 'Slik spiller du Alias på nett – komplett guide',
    articleDescription: 'Regler, tips til å forklare ord og hvordan du vinner i Alias.',
    breadcrumbLabel: 'Slik spiller du Alias på nett',
  },
  title: 'Slik spiller du Alias på nett',
  subtitle: '5 min lesetid · Gratis å spille på Boardly · 3–16 spillere',
  question: 'Hvordan spiller man Alias på nett?',
  answer: 'Gruppen deles i to lag – eller i tre lag på én person når dere er nøyaktig tre – og i hver tur forklarer én spiller ordene på skjermen for sitt eget lag mot klokka uten å si selve ordet; et gjettet ord gir ett poeng, et ord du hopper over, koster ett, og etter tre turer hver vinner høyeste poengsum.',
  cta: { label: 'Spill Alias nå', detail: 'Samle lagene og begynn å forklare.' },
  related: [
    { href: '/guides/how-to-play-spy-game-online', label: 'Slik spiller du Gjett spionen på nett' },
    { href: '/guides/how-to-play-yahtzee-online', label: 'Slik spiller du Yatzy på nett med venner' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'Slik spiller du Hukommelse – memory-spill på nett' },
    { href: '/guides/best-online-games-for-game-night', label: 'De beste nettspillene til spillkvelden' },
  ],
  body: {
    need: {
      title: 'Dette trenger du',
      items: [
        '3–16 spillere – to lag fra fire og oppover, tre lag på én når dere er nøyaktig tre',
        'En nettleser – på PC, nettbrett eller mobil',
        'Ingen konto (du kan spille som gjest)',
        'Gratis – ingenting å laste ned',
      ],
    },
    round: {
      title: 'Slik foregår en runde',
      steps: [
        { title: 'Lagene bytter på', detail: 'Lagene tar annenhver tur. Når en tur starter, blir én spiller fra laget som står for tur, beskriver.' },
        { title: 'Beskriveren ser et ord', detail: 'Bare beskriveren ser ordet på skjermen. Klokka begynner å gå – som regel 30 til 60 sekunder, avhengig av innstillingene.' },
        { title: 'Forklar ordet – uten å si det', detail: 'Bruk hvilke ord, sammenligninger, historier eller bevegelser du vil for å hjelpe laget ditt å gjette. Det du ikke kan, er å si selve ordet, en del av det eller noe som rimer på det.' },
        { title: 'Laget gjetter høyt', detail: 'Lagkameratene roper ut forslagene sine. Treffer noen, markerer beskriveren ordet som riktig og går videre til neste. Feil gjett gjør ingenting – bare fortsett.' },
        { title: 'Poeng og bytte', detail: 'Når tiden er ute, får laget ett poeng per riktig ord. Så er det det andre lagets tur, med en ny beskriver.' },
        { title: 'Tre turer hver, så telles det opp', detail: 'Det finnes ingen poenggrense å kjempe mot. Hvert lag får tre turer, og når den siste er over, vinner høyeste sum – to lag med like mange poeng ender uavgjort.' },
      ],
    },
    cannotSay: {
      title: 'Dette kan du ikke si',
      rules: [
        { rule: 'Selve ordet', example: 'Ord: Elefant → du kan ikke si «elefant»' },
        { rule: 'En del av ordet', example: 'Ord: Snømann → du kan ikke si «snø» eller «mann»' },
        { rule: 'Ord som høres likt ut', example: 'Ord: Hjul → du kan ikke si «jul»' },
      ],
    },
    describers: {
      title: 'Tips til beskriveren',
      tips: [
        { tip: 'Ta de lette ordene først', detail: 'Ikke bli sittende fast på det første vanskelige ordet. Hopp over det og kom tilbake – å sanke lette poeng først gir både poeng og selvtillit til laget.' },
        { tip: 'Bruk sammenligninger', detail: '«Som en bil, men du tråkker selv og den har bare to hjul» fungerer godt. Sammenlign det ukjente med noe laget ditt garantert kjenner.' },
        { tip: 'Vær rask, ikke tenk for mye', detail: 'Klokka er fienden din. En grov forklaring sagt raskt er verdt mer enn en perfekt en som tar 10 sekunder å bygge opp.' },
        { tip: 'Bruk bevegelser på vanskelige ord', detail: 'Bevegelser er lov. Finner du ikke de rette ordene, vis hva du mener – mim det, eller pek på ting i rommet.' },
      ],
    },
    guessers: {
      title: 'Tips til laget som gjetter',
      tips: [
        { tip: 'Rop ut alt', detail: 'Feil gjett koster ikke poeng. Si det første du kommer på – kanskje treffer du det riktige ordet helt tilfeldig.' },
        { tip: 'Lytt etter hint i forklaringen', detail: 'Noen ganger avslører måten et ord forklares på, hvilken kategori det hører til – dyr, sted, handling. Bruk det til å snevre inn gjetningene.' },
        { tip: 'Bygg videre på hverandre', detail: 'Gjetter en lagkamerat «fugl» og beskriveren reagerer positivt, prøv bestemte fugler. Gjetting i lag fungerer best når spillerne bygger videre på hverandres ideer.' },
      ],
    },
    onBoardly: {
      title: 'Slik spiller du på Boardly',
      modes: [
        { label: 'Lagoppsett:', text: 'Del gruppen i 2 lag før spillet. Spillet har plass til 3 til 16 spillere totalt, og er dere nøyaktig tre, er alle sitt eget lag.' },
        { label: 'Turtid:', text: 'Velg 30, 60, 90 eller 120 sekunder per tur, alt etter hvor høyt tempo dere vil ha.' },
        { label: 'Ingen konto:', text: 'Del en lobbylenke – alle blir med som gjester. Fungerer på alle enheter.' },
      ],
      more: 'Antall spillere, tidsinnstillinger og alt annet om spillet finner du på [Alias-siden](/games/alias).',
    },
  },
  faqTitle: 'Spørsmål om Alias',
  faq: [
    {
      question: 'Hvor mange spillere trenger man til Alias?',
      answer: 'Tre til seksten. Tre er unntaket: det finnes ikke noe lag å forklare for, så hver spiller er sitt eget lag, beskriveren går på rundgang, og de to andre gjetter begge. Fra fire og oppover er det to lag, og med seks eller åtte tar det virkelig av, fordi et større lag betyr flere stemmer som roper ut forslag og en beskriver som må skjære gjennom dem.',
    },
    {
      question: 'Trenger vi en talesamtale?',
      answer: 'Det er mye bedre med en. Gjettingen skjer muntlig og i høyt tempo, og skriver dere forslagene i en chat, går spillet aldri fortere enn den som skriver tregest. Hvilken som helst samtale fungerer – selve spillet kjører i nettleseren ved siden av.',
    },
    {
      question: 'Hva regnes som juks når man forklarer?',
      answer: 'Å si ordet, eller en del av det, på hvilket som helst språk. Rim, antall bokstaver og forbokstaven er heller ikke lov – kan laget ditt gjenskape ordet ut fra formen i stedet for betydningen, teller ikke hintet.',
    },
    {
      question: 'Kan jeg hoppe over et ord jeg ikke klarer å forklare?',
      answer: 'Det kan du, men det er ikke gratis: å hoppe over trekker ett poeng fra lagets sum for turen, så det lønner seg bare når ordet ellers ville spist mer av klokka enn ett poeng er verdt.',
    },
    {
      question: 'Finnes det boter i Alias?',
      answer: 'Nei. Spillet går ut på at én person forklarer noe for en annen person, og det er akkurat det en bot ikke kan – et ferdigskrevet hint er ikke noe hint. Mangler dere en spiller, velg heller et spill som har boter.',
    },
    {
      question: 'Hvor lenge varer et spill?',
      answer: 'Tre turer for hvert lag, altså seks turer med to lag, og rundt ti minutter med standardtiden på 60 sekunder, nærmere tjue med 120 sekunder. Verten velger turlengden når lobbyen opprettes, fra 30 og opp til 120 sekunder.',
    },
  ],
}

export default no
