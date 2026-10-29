import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { SpyGuideBody } from './en'

const no: LocalizedGuideCopy<SpyGuideBody> = {
  seo: {
    title: 'Slik spiller du Gjett spionen på nett – regler og tips',
    description:
      'Lær å spille Gjett spionen på nett. Regler, tips for å avsløre spionen, hvordan du overlever som spion, og hvordan du får til en god spillkveld med venner.',
    ogTitle: 'Slik spiller du Gjett spionen på nett',
    ogDescription: 'Komplett guide til Gjett spionen – regler og tips for både vanlige spillere og spionen. Gratis for 3–10 spillere i nettleseren.',
    headline: 'Slik spiller du Gjett spionen på nett – komplett guide',
    articleDescription: 'Regler, tips for å finne spionen og råd for å overleve som spion.',
    breadcrumbLabel: 'Slik spiller du Gjett spionen',
  },
  title: 'Slik spiller du Gjett spionen på nett',
  subtitle: '5 min lesetid · Gratis å spille på Boardly · 3–10 spillere',
  question: 'Hvordan spiller man Gjett spionen på nett?',
  answer: 'Alle unntatt én spiller får se det samme hemmelige stedet, og gruppen stiller hverandre spørsmål til den kan stemme ut den som ikke vet hvor de er – mens spionen lytter etter svaret og kan vinne direkte ved å gjette stedet først.',
  cta: { label: 'Spill Gjett spionen', detail: 'Samle 3–10 venner og prøv nå.' },
  related: [
    { href: '/guides/how-to-play-yahtzee-online', label: 'Slik spiller du Yatzy på nett med venner' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'Slik spiller du Hukommelse – memory-spill på nett' },
    { href: '/guides/how-to-play-tic-tac-toe-online', label: 'Slik spiller du Tre på rad online' },
    { href: '/guides/how-to-play-alias-online', label: 'Slik spiller du Alias på nett' },
    { href: '/guides/best-online-games-for-game-night', label: 'De beste nettspillene til spillkvelden' },
  ],
  body: {
    setup: {
      title: 'Oppsett',
      players: '3–10 spillere – fungerer godt med hvor mange som helst i dette spennet',
      length: '~5–8 minutter per runde',
      location: 'Ett hemmelig sted per runde (f.eks. strand, sykehus, romstasjon)',
      spy: 'Én spion – trukket tilfeldig og skjult for de andre',
      more: 'Antall spillere, rundetid og listen over steder i nettversjonen finner du på [siden for Gjett spionen](/games/spy).',
    },
    round: {
      title: 'Slik foregår en runde',
      steps: [
        {
          title: 'Rollene deles ut i hemmelighet',
          detail: 'Alle unntatt spionen får se det hemmelige stedet (f.eks. «Jernbanestasjon»). Spionen ser bare «Du er spionen» – og aner ikke hvor de andre er.',
        },
        {
          title: 'Spørsmålsrunden starter',
          detail: 'Spillerne bytter på å stille hverandre ett spørsmål om stedet. Hold spørsmålene vage nok til at spionen ikke skjønner hvor dere er, men konkrete nok til å vise at du selv vet det.',
        },
        {
          title: 'Verten kan starte avstemningen',
          detail: 'Verten kan avslutte spørsmålene og åpne avstemningen tidlig. Alle stemmer samtidig, og den med flest stemmer blir stemt ut – står det likt, går ingen ut. Peker gruppen ut noen andre enn spionen, taper gruppen runden.',
        },
        {
          title: 'Spionen kan gjette stedet',
          detail: 'Mens spørsmålene fortsatt pågår, kan spionen si «Jeg vet hvor vi er!» og velge stedet fra listen. Riktig gjett vinner runden direkte; feil gjett avslutter den på flekken, og runden går til gruppen. Når avstemningen først er åpnet, er sjansen borte.',
        },
      ],
    },
    findTheSpy: {
      title: 'Tips for vanlige spillere – slik finner du spionen',
      tips: [
        { tip: 'Still spørsmål som tester kunnskap uten å røpe stedet', detail: 'På stranda: «Hvor fullt er det her?» setter spionen på prøve uten å fortelle hvor dere er. Unngå «Hva lukter det her?» – det er altfor lett å bløffe seg gjennom.' },
        { tip: 'Se etter nøling og vage svar', detail: 'De som vet stedet, svarer raskt og naturlig. Spionen tar gjerne en pause, gir korte svar eller bruker uttrykk som «det kommer an på» og «kanskje».' },
        { tip: 'Ikke forhast avstemningen', detail: 'Spionen vil at dere skal peke ut feil person. La noen runder med spørsmål avsløre et mønster før dere bestemmer dere – peker dere ut feil spiller, taper gruppen runden.' },
        { tip: 'Sammenlign svarene', detail: 'Gir de fleste omtrent like svar, og én svarer noe helt annet – da har du sannsynligvis funnet spionen.' },
      ],
    },
    asTheSpy: {
      title: 'Tips for spionen – slik overlever du',
      tips: [
        { tip: 'Gi selvsikre, vage svar', detail: 'Det verste du kan gjøre er å høres usikker ut. Vær bestemt – «Det er alltid mer folk her enn man skulle tro» passer på mange steder.' },
        { tip: 'Utelukk steder raskt', detail: 'Lytt nøye til de andres spørsmål og svar – de lekker informasjon. Innen runde 3–4 bør du ha snevret inn hvor dere kan være.' },
        { tip: 'Anklag noen tidlig', detail: 'Det høres bakvendt ut, men å peke ut en annen spiller flytter mistanken bort fra deg. Velg en som er stille, og si det høyt.' },
        { tip: 'Vit når du skal gjette', detail: 'Vinduet lukkes i det øyeblikket noen åpner avstemningen, så gjett stedet mens spørsmålene fortsatt pågår. Gjetter du riktig, er runden din uansett hva bordet trodde; gjetter du feil, gir du den bort.' },
      ],
    },
  },
  faqTitle: 'Spørsmål om Gjett spionen',
  faq: [
    {
      question: 'Hvor mange må vi være?',
      answer: 'Minst tre og høyst ti. Tre er tettere enn det høres ut, fordi spionen ikke har noen å gjemme seg bak, og det er med fem eller seks at bløffingen blir skikkelig spennende.',
    },
    {
      question: 'Kan jeg spille mot en bot i stedet for en person?',
      answer: 'Nei, og det er med vilje. Hele spillet handler om at folk leser hverandre – en bot som stiller et ferdigskrevet spørsmål, forteller deg ingenting, og en bot som trekker spionrollen, ville tømt runden for innhold. Inviter heller en tredje person.',
    },
    {
      question: 'Hva skjer hvis gruppen peker ut feil spiller?',
      answer: 'Da går runden til spionen, og det samme gjør en uavgjort avstemning, som ikke stemmer ut noen. Det er prisen som holder spørsmålene ærlige: en gruppe som anklager på magefølelsen, taper like sikkert som en som aldri anklager noen.',
    },
    {
      question: 'Kan spionen vinne etter å ha blitt mistenkt?',
      answer: 'Ja, men bare mens spørsmålene fortsatt pågår. Spionen velger stedet fra listen, og et riktig gjett tar runden uansett hvilken vei bordet heller. Det er et ekte veddemål: et feil gjett gir runden til gruppen der og da, og når noen har åpnet avstemningen, er det ikke lenger mulig å gjette i det hele tatt.',
    },
    {
      question: 'Hvor konkrete bør spørsmålene mine være?',
      answer: 'Konkrete nok til at en som vet stedet kan svare naturlig, vage nok til at en som ikke vet det, ikke kan regne det ut fra spørsmålet. Den balansen er hele kunsten i spillet.',
    },
    {
      question: 'Hvor lang er en runde?',
      answer: 'Fem til åtte minutter, så kort at dere kan spille flere på rad. Det vanlige er å bytte på hvem som er spion over noen runder, og det er også slik en stille spiller slutter å virke mistenkelig bare fordi den er stille.',
    },
  ],
}

export default no
