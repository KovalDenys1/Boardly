import type { LocalizedGuideCopy } from '../../components/guide-definition'
import type { RockPaperScissorsGuideBody } from './en'

const no: LocalizedGuideCopy<RockPaperScissorsGuideBody> = {
  seo: {
    title: 'Slik spiller du stein, saks, papir på nett – regler og tips',
    description:
      'Lær å spille stein, saks, papir på nett. Regler, best av tre, hvordan du leser motstanderen og hvordan du slår boten. Gratis spill for 2 i nettleseren.',
    ogTitle: 'Slik spiller du stein, saks, papir på nett',
    ogDescription: 'Komplett guide til Stein, saks, papir – regler, best av tre og strategi som faktisk virker. Gratis spill for 2 i nettleseren.',
    headline: 'Slik spiller du Stein, saks, papir på nett – komplett guide',
    articleDescription: 'Regler, best av tre og strategi for Stein, saks, papir.',
    breadcrumbLabel: 'Slik spiller du Stein, saks, papir',
  },
  title: 'Slik spiller du Stein, saks, papir på nett',
  subtitle: '6 min lesetid · Gratis å spille på Boardly · 2 spillere eller mot en bot',
  question: 'Hvordan spiller man stein, saks, papir på nett?',
  answer: 'Begge spillerne velger stein, saks eller papir samtidig, de to valgene vises på én gang, og den som først vinner to runder, tar kampen – stein slår saks, saks slår papir, og papir slår stein.',
  cta: { label: 'Spill Stein, saks, papir nå', detail: 'Klar for ditt første trekk?' },
  related: [
    { href: '/guides/how-to-play-tic-tac-toe-online', label: 'Slik spiller du Tre på rad online' },
    { href: '/guides/how-to-play-connect-four-online', label: 'Slik spiller du Fire på rad online' },
    { href: '/guides/how-to-play-memory-card-game-online', label: 'Slik spiller du Hukommelse – memory-spill på nett' },
    { href: '/guides/best-2-player-games-online', label: 'Beste spill for 2 spillere på nett – gratis, uten nedlasting' },
    { href: '/guides/best-games-to-play-on-zoom', label: 'De beste spillene til Zoom-samtaler – gratis, uten nedlasting' },
  ],
  body: {
    need: {
      title: 'Dette trenger du',
      items: [
        '2 spillere – eller spill alene mot en bot',
        'En nettleser – på PC, nettbrett eller mobil',
        'Ingen konto (du kan spille som gjest)',
        'Gratis – ingenting å laste ned eller installere',
      ],
    },
    rules: {
      title: 'Reglene',
      steps: [
        {
          title: 'To spillere, én lobby',
          detail: 'Et rom i Stein, saks, papir har plass til nøyaktig to. Opprett en lobby og send koden til en venn, eller gi den andre plassen til en bot og spill alene.',
        },
        {
          title: 'Begge velger samtidig',
          detail: 'Det finnes ingen turer i dette spillet. Du velger stein, saks eller papir når du er klar, og det samme gjør motstanderen. Å låse først røper ingenting: valget ditt er skjult til motstanderens også er inne.',
        },
        {
          title: 'Avsløringen avgjør runden',
          detail: 'Begge valgene vises samtidig. Stein slår saks, saks slår papir, papir slår stein, og vinneren av runden får ett poeng.',
        },
        {
          title: 'Samme valg, ingen poeng',
          detail: 'Velger dere det samme, blir runden uavgjort. Ingen av poengsummene endres, ingenting tas med videre, og runden spilles på nytt fra start.',
        },
        {
          title: 'Først til to vinner kampen',
          detail: 'En kamp er best av tre, så to rundeseire avgjør den. Fordi uavgjorte runder spilles om i stedet for å telle, varer en jevn kamp ofte mer enn tre runder før noen kommer dit.',
        },
      ],
    },
    beats: {
      title: 'Hva slår hva',
      intro: 'Tre trekk, og hvert av dem slår nøyaktig ett av de to andre og taper mot det siste:',
      items: ['Stein knuser saks', 'Saks klipper papir', 'Papir pakker inn stein'],
    },
    strategy: {
      title: 'Strategi mot et menneske',
      tips: [
        {
          tip: 'Tilfeldig er det eneste ingen kan slå',
          detail: 'Velg hvert av de tre helt tilfeldig, og ingen motstander i verden kan gjøre det bedre enn å gå i null mot deg over tid. Det er utgangspunktet, og det er verdt å vite før alt annet: hver idé nedenfor handler om å slå en spiller som ikke gjør det – og det er nesten alle.',
        },
        {
          tip: 'Se hva de gjør etter å ha tapt en runde',
          detail: 'Etter et tap dropper de fleste trekket som nettopp tapte. Ble steinen deres pakket inn av papiret ditt, er stein det minst sannsynlige neste trekket, så trekket som slår stein, er det du trygt kan legge vekk.',
        },
        {
          tip: 'Se hva de gjør etter å ha vunnet en',
          detail: 'Den motsatte vanen er like vanlig. Et trekk som nettopp vant, føles heldig, og mange spiller det igjen. Pakket papiret deres inn steinen din, kan du vente papir en gang til og svare med saks.',
        },
        {
          tip: 'Bryt ditt eget mønster før de leser det',
          detail: 'Alt dette virker på deg også. Merker du at du har åpnet med det samme trekket to ganger, bytt – ikke fordi trekket er dårlig, men fordi to ganger er nok til at en oppmerksom motstander begynner å gjette.',
        },
        {
          tip: 'Best av tre belønner én god lesning',
          detail: 'Du trenger ikke et forsprang som lønner seg over femti runder. To riktige lesninger vinner kampen direkte, og derfor betyr det mye mer å følge med i første runde her enn i et lengre spill.',
        },
        {
          tip: 'Ikke la klokka velge for deg',
          detail: 'Lar du de 60 sekundene renne ut, sendes et tilfeldig trekk inn på dine vegne. Det er ingen katastrofe, men du kaster bort runden du kanskje kunne vunnet på en god lesning, og motstanderen får en ren runde med informasjon om deg helt gratis.',
        },
      ],
    },
    bot: {
      title: 'Slik spiller boten egentlig',
      intro: 'Det lønner seg å forstå boten, for to av de tre nivåene følger en regel du kan finne ut av og så bruke mot den. Ingen av dem kan se valget ditt før du låser det – de gjetter ut fra historikken din, akkurat som du ville gjort.',
      tips: [
        {
          tip: 'Lett – rent myntkast',
          detail: 'Den lette boten velger ett av de tre tilfeldig hver runde og ser aldri på hva du har spilt. Det finnes ikke noe mønster, så det er ingenting å utnytte: du vinner omtrent en tredjedel, taper omtrent en tredjedel og spiller uavgjort omtrent en tredjedel, uansett hva du prøver.',
        },
        {
          tip: 'Middels – leser deg, men ikke hver runde',
          detail: 'Den middels boten finner ut hvilket trekk du spiller oftest og svarer på det, men bare omtrent sju av ti ganger. De tre andre velger den tilfeldig. Det er nok støy til at den føles uforutsigbar, samtidig som den straffer en tydelig vane.',
        },
        {
          tip: 'Vanskelig – leser deg hver eneste runde',
          detail: 'Den vanskelige boten spiller alltid motsvaret til trekket du har spilt oftest, og den teller den siste runden din dobbelt, så den svinger raskt mot det du nettopp gjorde. Den blander aldri inn et tilfeldig trekk.',
        },
        {
          tip: 'Og det er nettopp derfor den vanskelige boten kan slås',
          detail: 'En regel uten tilfeldighet kan besvares. Finn ut hvilket trekk du har spilt oftest, og spill trekket som taper mot det. Har du kjørt på med stein, venter boten stein og spiller papir, så saks tar runden. Fortsetter du, øker antallet saks til saks er ditt mest brukte trekk, og da begynner boten å vente det i stedet, og svaret blir papir. Du ligger hele tiden et steg foran en spådom bygd på runder som allerede er spilt.',
        },
        {
          tip: 'Alle botene åpner i blinde',
          detail: 'I første runde av en kamp finnes det ingen historikk å lese, så alle tre nivåene velger tilfeldig. Ingenting du gjør i runde én røper noe, og ingenting boten gjør der, forteller deg noe heller.',
        },
      ],
    },
    onBoardly: {
      title: 'Slik spiller du på Boardly',
      modes: [
        { label: 'Mot en bot:', text: 'Gi den andre plassen til en bot på lett, middels eller vanskelig og start med en gang, uten å vente på en motstander.' },
        { label: 'Mot en venn:', text: 'Del lobbylenken, så er vennen din inne på sekunder. Ingen av dere trenger konto.' },
        { label: 'Skjult til avsløringen:', text: 'Lås så tidlig du vil. Valget ditt holdes skjult for motstanderen til deres er inne, så du har ingenting å tjene på å vente dem ut.' },
        { label: 'Rundetid:', text: 'Hver runde gir deg 60 sekunder. Går tiden ut, sendes et tilfeldig valg inn for deg, og runden telles som vanlig.' },
        { label: 'Chat:', text: 'Chatpanelet vises når det er to mennesker i rommet. En kamp mot en bot hopper over det og gir plassen til rundehistorikken i stedet.' },
        { label: 'Tilskuere:', text: 'Av, med mindre verten slår dem på når lobbyen opprettes. Når de er på, ser tilskuerne brettet og chatten, men kan ikke delta.' },
        { label: 'Omkamp:', text: 'Når en kamp er over, kan verten starte en ny med en gang, med begge spillerne i samme rom.' },
      ],
      more: 'Alt på denne siden beskriver versjonen du kan spille akkurat nå på [siden for Stein, saks, papir](/games/rock-paper-scissors).',
    },
  },
  faqTitle: 'Spørsmål om Stein, saks, papir',
  faq: [
    {
      question: 'Hvor mange runder er en kamp?',
      answer: 'En kamp er best av tre: den som først vinner to runder, tar den. En uavgjort runde gir ingen poeng til noen og spilles bare om igjen, så en kamp kan vare i fire eller fem runder og likevel avgjøres av den som først kommer til to.',
    },
    {
      question: 'Hva skjer hvis vi begge velger det samme?',
      answer: 'Runden blir uavgjort. Ingen av poengsummene endres, ingenting tas med videre, og samme runde spilles på nytt med begge valgene nullstilt. Uavgjort skjer ofte – når to spillere velger tilfeldig, ender én av tre runder slik.',
    },
    {
      question: 'Er det tidsbegrensning på en runde?',
      answer: 'Ja, 60 sekunder til å låse et valg. Går tiden ut, taper du ikke runden: spillet velger ett av de tre tilfeldig for deg, og runden telles som vanlig. Det koster deg likevel, for et tilfeldig valg er det eneste en motstander som leser deg, ikke kan ta feil av.',
    },
    {
      question: 'Kan jeg spille stein, saks, papir mot datamaskinen?',
      answer: 'Ja, på tre nivåer. Den lette boten velger tilfeldig hver runde og kan ikke leses. Den middels og den vanskelige boten teller hva du har spilt og svarer på trekket du bruker oftest – den vanskelige gjør det hver runde, den middels bare rundt sju av ti runder og velger tilfeldig resten av tiden.',
    },
    {
      question: 'Er stein, saks, papir et spill om ferdighet eller flaks?',
      answer: 'Mot en som velger tilfeldig er det ren flaks, og ingen strategi slår et myntkast med tre sider. Mot et menneske er det ferdighet, fordi folk ikke velger tilfeldig – de gjentar et trekk som vant, de dropper et trekk som tapte, og hver av de vanene kan du svare på.',
    },
    {
      question: 'Kan andre se på en kamp?',
      answer: 'Bare hvis verten slår på tilskuere når lobbyen opprettes – innstillingen er av som standard. Tilskuerne ser brettet og chatten, men kan bare lese, og de kan ikke velge trekk eller påvirke kampen på noen måte.',
    },
    {
      question: 'Trenger jeg en konto for å spille?',
      answer: 'Nei. Du kan opprette en lobby eller bli med i en fra en delt lenke som gjest, på PC eller mobil, uten å laste ned eller installere noe.',
    },
  ],
}

export default no
