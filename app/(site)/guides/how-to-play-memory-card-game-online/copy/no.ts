import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { MemoryGuideBody } from './en'

const no: LocalizedGuideCopy<MemoryGuideBody> = {
  seo: {
    title: 'Slik spiller du memory på nett – regler for Hukommelse',
    description:
      'Regler, vanskelighetsnivåer og strategitips for Hukommelse, det klassiske memory-spillet der du finner par. Gratis flerspiller i nettleseren, uten nedlasting.',
    ogTitle: 'Slik spiller du memory på nett',
    ogDescription: 'Komplett guide til Hukommelse – regler, vanskelighetsnivåer og strategitips. Gratis memory-spill for 2–4 spillere i nettleseren.',
    headline: 'Slik spiller du Hukommelse (memory) på nett – komplett guide',
    articleDescription: 'Regler, vanskelighetsnivåer og strategitips for Hukommelse.',
    breadcrumbLabel: 'Slik spiller du Hukommelse',
  },
  title: 'Slik spiller du Hukommelse – memory-spill på nett',
  subtitle: '5 min lesetid · Gratis å spille på Boardly · 2–4 spillere',
  question: 'Hvordan spiller man memory på nett?',
  answer: 'Alle kortene ligger med baksiden opp; når det er din tur, snur du to, og er de like, beholder du paret og går igjen, ellers snus de tilbake – når det siste paret er tatt, vinner den som har flest par.',
  cta: { label: 'Spill Hukommelse nå', detail: 'Klar til å teste hukommelsen?' },
  related: [
    { href: '/guides/how-to-play-yahtzee-online', label: 'Slik spiller du Yatzy på nett med venner' },
    { href: '/guides/how-to-play-spy-game-online', label: 'Slik spiller du Gjett spionen på nett' },
    { href: '/guides/how-to-play-tic-tac-toe-online', label: 'Slik spiller du Tre på rad online' },
    { href: '/guides/best-2-player-games-online', label: 'Beste spill for 2 spillere på nett – gratis, uten nedlasting' },
  ],
  body: {
    need: {
      title: 'Dette trenger du',
      items: [
        '2–4 spillere',
        'En nettleser – på PC, nettbrett eller mobil',
        'Ingen konto (du kan spille som gjest)',
        'Gratis – ingenting å laste ned',
      ],
    },
    steps: {
      title: 'Slik spiller du – steg for steg',
      steps: [
        { title: 'Start spillet', detail: 'Alle kortene legges med baksiden opp i et rutenett. Hvor stort rutenettet er, avhenger av vanskelighetsnivået du har valgt.' },
        { title: 'Snu to kort', detail: 'Når det er din tur, klikker du på et kort for å snu det, og deretter på et kort til. Begge kortene vises for alle spillerne et lite øyeblikk.' },
        { title: 'Par eller bom', detail: 'Er de to kortene like, får du paret og en tur til. Er de ikke like, snus begge tilbake, og turen går videre til neste spiller.' },
        { title: 'Husk plasseringene', detail: 'Her ligger ferdigheten – husk hvor kortene uten par ligger, så du kan fullføre parene i senere turer.' },
        { title: 'Vinn spillet', detail: 'Når alle parene er funnet, vinner spilleren med flest par.' },
      ],
    },
    levels: {
      title: 'Vanskelighetsnivåer',
      intro: '[Hukommelse på Boardly](/games/memory) har tre vanskelighetsnivåer som endrer størrelsen på rutenettet og antall par.',
      levels: [
        { level: 'Lett', size: '4×4 ruter · 8 par', best: 'Raske spill, spill med de minste eller for å lære seg spillet' },
        { level: 'Middels', size: '5×4 ruter · 10 par', best: 'Vanlig konkurransespill – det beste valget for de fleste grupper' },
        { level: 'Vanskelig', size: '6×6 ruter · 18 par', best: 'Erfarne spillere som vil ha et lengre og mer krevende spill' },
      ],
    },
    strategy: {
      title: 'Strategitips',
      tips: [
        { tip: 'Se før du klikker', detail: 'Ikke forhast det første kortet. Ta et øyeblikk til å se over hele brettet – et raskt overblikk slår tilfeldig klikking hver gang.' },
        { tip: 'Bruk rutenettet som et kart', detail: 'Del rutenettet i soner i hodet. Rydd én sone om gangen – da er det lettere å holde styr på plasseringene.' },
        { tip: 'Følg med på motstanderne', detail: 'Når andre spillere snur kort, ser du dem også. Bommene deres er hint om hvor parene gjemmer seg.' },
        { tip: 'Ikke ta et par i det øyeblikket du finner det', detail: 'Når du vet hvor et par ligger, kan du vente. Snu heller et nytt kort først for å få mer informasjon – og ta paret i neste tur.' },
        { tip: 'Spill trygt når du er i siget', detail: 'Et par gir deg en tur til. Når du har en god rekke, bør du ta par du er sikker på, i stedet for å gjette og risikere å miste turen.' },
      ],
    },
  },
  faqTitle: 'Spørsmål om Hukommelse',
  faq: [
    {
      question: 'Hvor mange kan spille memory på nett?',
      answer: 'To til fire. Med to er spillet skarpest, fordi hvert kort motstanderen snur, er gratis informasjon for deg. Med fire endrer brettet seg så mye mellom turene dine at flaks begynner å bety mer enn hukommelse.',
    },
    {
      question: 'Hva er forskjellen på de tre vanskelighetsnivåene?',
      answer: 'Bare størrelsen på brettet. Lett er et rutenett på 4×4 med 8 par, Middels er 5×4 med 10, og Vanskelig er 6×6 med 18. Flere par betyr flere plasseringer å holde i hodet, så Vanskelig belønner konsentrasjon der Lett belønner fart.',
    },
    {
      question: 'Hvor lang tid tar et spill?',
      answer: 'Rundt fem minutter på Lett og ti til femten på Vanskelig med fullt bord. Hver tur går på en klokke som verten setter til 30, 60, 90 eller 120 sekunder når lobbyen opprettes; går tiden ut, snus kortene dine tilbake og turen går videre, så et bord som prater mellom turene, mister en tur her og der, ikke hele spillet.',
    },
    {
      question: 'Kan jeg spille memory mot datamaskinen?',
      answer: 'Ja. Hukommelse har en bot på tre vanskelighetsnivåer, så du kan spille et helt spill alene når ingen andre er tilgjengelige. Den vanskelige boten husker et kort den har sett omtrent tre av fire ganger, som tilsvarer et svært oppmerksomt menneske og er en god test på din egen hukommelse.',
    },
    {
      question: 'Får man alltid de samme kortene?',
      answer: 'Nei. Kortstokken stokkes for hvert spill, så et brett du nettopp har ryddet, hjelper deg ikke i det neste. Det du tar med deg, er vanen med å se over hele rutenettet før du snur det første kortet.',
    },
    {
      question: 'Trenger jeg en konto for å spille?',
      answer: 'Nei. Opprett en lobby, del lenken, så blir de andre med som gjester ved å skrive inn et navn. En konto gir deg bare en lagret profil og en oversikt over resultatene dine.',
    },
  ],
}

export default no
