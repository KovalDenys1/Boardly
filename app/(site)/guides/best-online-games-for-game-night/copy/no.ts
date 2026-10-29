import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { GameNightGuideBody } from './en'

const no: LocalizedGuideCopy<GameNightGuideBody> = {
  seo: {
    title: 'Spill på nett med venner til spillkvelden – gratis',
    description:
      'De beste spillene å spille på nett med venner på spillkvelden, fra tre spillere til et helt selskap. Ingen app, del en lenke og sett i gang. Gratis for 2–10.',
    ogTitle: 'De beste nettspillene til spillkvelden',
    ogDescription: 'Gratis nettleserspill til neste spillkveld på nett – uten nedlasting og uten konto.',
    headline: 'De beste nettspillene til spillkvelden – gratis og uten nedlasting',
    articleDescription: 'Gratis nettleserspill til spillkvelder på nett med venner.',
    breadcrumbLabel: 'Nettspill til spillkvelden',
  },
  title: 'De beste nettspillene til spillkvelden',
  subtitle: '6 min lesetid · Alle spillene er gratis på Boardly · Ingen nedlasting',
  question: 'Hva er de beste spillene til en spillkveld på nett?',
  answer: 'Gjett spionen for en gjeng på fem eller flere, Alias når dere er nok til to lag, og Yatzy, Hukommelse eller Fire på rad for en mindre eller roligere kveld – alle fem kjører i nettleseren, krever ingen konto og starter fra en lenke du limer inn i gruppechatten.',
  cta: { label: 'Se alle spillene', detail: 'Velg det første spillet og del lenken.' },
  related: [
    { href: '/guides/best-games-to-play-on-zoom', label: 'De beste spillene til Zoom-samtaler – gratis, uten nedlasting' },
    { href: '/guides/best-2-player-games-online', label: 'Beste spill for 2 spillere på nett – gratis, uten nedlasting' },
    { href: '/guides/how-to-play-spy-game-online', label: 'Slik spiller du Gjett spionen på nett' },
    { href: '/guides/how-to-play-alias-online', label: 'Slik spiller du Alias på nett' },
  ],
  body: {
    goodGame: {
      title: 'Hva gjør et spill godt til en spillkveld?',
      items: [
        'Lett å forklare – alle bør være i gang i løpet av 2 minutter',
        'Passer for gruppen deres – sjekk antall spillere før dere velger',
        'Ingen nedlasting – det er der halve gjengen faller fra',
        'Rundene er korte nok til å ta en til hvis noen vil ha revansj',
      ],
    },
    games: {
      title: 'De beste spillene til spillkvelden',
      noteLabel: 'Passer for:',
      items: [
        {
          name: 'Gjett spionen',
          play: 'Spill Gjett spionen',
          players: '3–10 spillere',
          why: 'Den beste åpningen på en spillkveld. Én spiller er i hemmelighet spion, alle andre vet hvor dere er. Spillerne stiller hverandre spørsmål og prøver å finne ut hvem som ikke hører hjemme. En runde tar 5–8 minutter, så dere kan spille flere på rad.',
          note: 'Grupper på 5 eller flere som vil ha latter og diskusjon',
        },
        {
          name: 'Alias',
          play: 'Spill Alias',
          players: '3–16 spillere',
          why: 'Del dere i to lag og kjemp om å gjette ord ut fra lagkameratens forklaringer. Høy energi, høyt tempo, og det blir bare mer støy utover kvelden. Fungerer best når gjengen er stor nok til å deles.',
          note: 'Konkurranselystne grupper, lagspill, 6+ spillere',
        },
        {
          name: 'Yatzy',
          play: 'Spill Yatzy',
          players: '2–4 spillere',
          why: 'Terningklassikeren alle kjenner. Kast fem terninger og fyll poenglisten: ni kategorier i kort modus, som er det en ny lobby starter med, eller alle femten i klassisk modus. Et klassisk spill tar 15–20 minutter. Roligere enn de andre, men perfekt for avslappede kvelder der dere vil prate mellom turene.',
          note: 'Mindre grupper, rolige kvelder, Yatzy-fans',
        },
        {
          name: 'Hukommelse',
          play: 'Spill Hukommelse',
          players: '2–4 spillere',
          why: 'Alle snur de samme kortene – når motstanderen bommer på et par, ser du nøyaktig hvor kortene havnet. Raske runder, tre vanskelighetsnivåer. Hvem som helst lærer det på 30 sekunder.',
          note: 'Mindre grupper, raske runder mellom de større spillene',
        },
        {
          name: 'Fire på rad',
          play: 'Spill Fire på rad',
          players: '2 spillere',
          why: 'Perfekt for dueller én mot én mens resten av gjengen ser på. Kjør en utslagsturnering og la vinneren ta imot neste utfordrer. En runde tar under 5 minutter.',
          note: 'Turneringer, 1 mot 1 mens andre ser på, raske utslagsrunder',
        },
      ],
    },
    groupSizes: {
      title: 'Hvilke spill passer for hvor mange',
      intro: 'Hvor mange dere er, avgjør kvelden mer enn noe annet på denne listen. Et deduksjonsspill med tre personer er et annet spill enn det samme med ni, og et terningspill som er spennende med fire, drar ut med åtte. Velg fra raden som passer til dem som faktisk dukket opp, ikke dem som sa de skulle komme.',
      sizes: [
        {
          size: '2 spillere',
          pick: 'Fire på rad, Hukommelse, Yatzy',
          why: 'Én mot én, ingen lag, ingen venting. Fire på rad er det korteste av de tre og det letteste å spille om igjen til noen slutter å tape.',
        },
        {
          size: '3 spillere',
          pick: 'Gjett spionen, Yatzy, Hukommelse',
          why: 'Tre er minimum for Gjett spionen, og spillet blir tettere enn ved et stort bord: hvert spørsmål teller, og spionen har ingen steder å gjemme seg. Yatzy med tre tar 20–25 minutter, og Alias går også med tre – da er hver av dere sitt eget lag.',
        },
        {
          size: '4–6 spillere',
          pick: 'Alias, Gjett spionen',
          why: 'Det perfekte antallet for en fest. Fire er den minste Alias-lobbyen som kan deles i to lag, og Gjett spionen med fem eller seks gir spionen rom til å bløffe uten at runden drar ut.',
        },
        {
          size: '7 eller flere',
          pick: 'Gjett spionen, Alias',
          why: 'Begge tåler mange – Gjett spionen opptil ti, Alias opptil seksten. Kjør de roligere spillene som en egen turnering ved siden av, så ingen blir sittende og se på i tjue minutter.',
        },
      ],
    },
    hosting: {
      title: 'Tips til deg som arrangerer spillkveld på nett',
      items: [
        'Velg 2–3 spill på forhånd og del lenkene før samtalen starter',
        'Start med Gjett spionen – det får alle til å prate med en gang',
        'Bytt spill hver 2–3 runde for å holde energien oppe',
        'La gruppen stemme over neste spill mellom rundene',
        'Ha en gruppechat åpen så det er lett å dele lobbylenker',
      ],
    },
  },
  faqTitle: 'Spørsmål om spillkvelden',
  faq: [
    {
      question: 'Hva kan vi spille når vi er nøyaktig tre?',
      answer: 'Gjett spionen fungerer med tre og er skarpere enn det høres ut – når ingen kan gjemme seg bak andre, er hvert spørsmål et bevis. Yatzy og Hukommelse har også plass til tre, og begge er raske nok til at taperen får revansj. Alias går også med tre, som tre lag på én person der beskriveren går på rundgang, men spillet tar seg opp når dere er nok til to ordentlige lag.',
    },
    {
      question: 'Hvilket av disse er det beste festspillet på nett?',
      answer: 'Alias, når dere er seks eller flere. To lag, et ord som skal forklares, en klokke som tikker – det er det mest høylytte spillet på listen og det som trenger minst forklaring. Gjett spionen er en bedre åpning mens gjengen fortsatt varmer opp.',
    },
    {
      question: 'Trenger vi en videosamtale for å spille?',
      answer: 'Nei. Gjett spionen og Alias er bedre med lyd, fordi hele spillet går ut på å snakke sammen, og hvilken som helst samtale fungerer – Zoom, Discord, Meet, en gruppesamtale på telefon. Yatzy, Hukommelse og Fire på rad trenger ingen lyd i det hele tatt; chatten i spillet holder.',
    },
    {
      question: 'Må alle ha en konto?',
      answer: 'Nei. Verten oppretter en lobby og deler lenken, og alle andre blir med som gjester med et navn de skriver inn. En konto gir deg bare en lagret profil og statistikk, og ingen trenger en for å sette seg ved bordet.',
    },
    {
      question: 'Hvor lenge varer en spillkveld på nett vanligvis?',
      answer: 'To timer holder til en god kveld: et par runder Gjett spionen til å begynne med, en lengre økt med Alias når alle er varme, og et kort spill mens folk begynner å falle fra. Å bytte hver andre eller tredje runde holder energien oppe bedre enn én lang økt med hva som helst.',
    },
    {
      question: 'Hva gjør vi hvis noen faller fra midt i kvelden?',
      answer: 'Velg neste spill ut fra dem som fortsatt er der, i stedet for å vente. Fire på rad for de to som er igjen og Hukommelse for opptil fire er de nyttige reservene – begge starter med en gang og gir en krympende gjeng noe å gjøre uten at kvelden må starte på nytt.',
    },
  ],
}

export default no
