import type { ReactNode } from 'react'
import type { GuideLocale } from '@/lib/seo-locales'

/**
 * The words around a guide and on the guides index, in the four languages the guides are
 * written in. Site-wide words (Home, Guides, game names) come from `locales/*` instead.
 */
export interface GuideUi {
  /** BCP 47 tag for the "Last updated" date. */
  dateLocale: string
  lastUpdated: (date: ReactNode) => ReactNode
  rulesLink: (link: ReactNode) => ReactNode
  gamePage: (game: string) => string
  readFirst: (link: ReactNode) => ReactNode
  aboutGame: (game: string) => string
  moreGuides: string
  index: GuideIndexUi
}

export interface GuideIndexUi {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  heading: string
  intro: string
  howToPlay: string
  bestOf: string
  count: (count: number) => string
  readTime: (readTime: string) => string
  aboutTitle: string
  about: [string, string]
  unguided: string
  listSeparator: string
  lastSeparator: string
}

/** Russian and Ukrainian count nouns three ways: 1 гайд, 3 гайда, 7 гайдов. */
function slavicPlural(count: number, [one, few, many]: [string, string, string]): string {
  const tens = count % 100
  const units = count % 10
  if (units === 1 && tens !== 11) return one
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few
  return many
}

/** "Alias-spill" is the site's Norwegian name; in running text it takes the definite form. */
const norwegianDefinite = (game: string) => game.replace(/-spill$/, '-spillet')

export const GUIDE_UI: Record<GuideLocale, GuideUi> = {
  en: {
    dateLocale: 'en-GB',
    lastUpdated: (date) => <>Last updated {date}</>,
    rulesLink: (link) => <>Rules, modes and player counts:{' '}{link}</>,
    gamePage: (game) => `${game} game page`,
    readFirst: (link) => <>Or read about{' '}{link}{' '}first.</>,
    aboutGame: (game) => `${game} on Boardly`,
    moreGuides: 'More guides',
    index: {
      title: 'Board Game Guides & Tips - How to Play Online',
      description:
        'Learn how to play popular board games online. Step-by-step guides for Yahtzee, Spy, Memory, Tic Tac Toe and more. Free multiplayer games in your browser.',
      ogTitle: 'Board Game Guides & Tips',
      ogDescription: 'Step-by-step guides for playing board games online with friends.',
      heading: 'Tips & How-to-Play',
      intro: 'Everything you need to understand the rules, learn the strategy, and win.',
      howToPlay: 'How to Play',
      bestOf: 'Best Of',
      count: (count) => `${count} guides`,
      readTime: (readTime) => `${readTime} read`,
      aboutTitle: 'Guides and game pages',
      about: [
        'Every game on Boardly has its own page with the full rules, strategy and a FAQ. A how-to-play guide is the shorter way in for someone new to a game: what you need, how a round works and the first tips worth knowing, and most of them say how to start a game with friends on Boardly. Read the guide before a first game, and the game page when a rule is in doubt or you want to get better at it.',
        'The best-of guides compare games instead of explaining one. They start from what a group actually has – two players, a game night with a bigger group, or friends on a video call – and point to the games that fit. Every guide links to the games it mentions, and every game here is free in the browser, with no download.',
      ],
      unguided:
        'Some games have no separate guide, because their game page already covers how a turn works, the strategy and the common questions:',
      listSeparator: ', ',
      lastSeparator: ' and ',
    },
  },
  ru: {
    dateLocale: 'ru-RU',
    lastUpdated: (date) => <>Обновлено {date}</>,
    rulesLink: (link) => <>Правила, режимы и число игроков – на{' '}{link}</>,
    gamePage: (game) => `странице игры «${game}»`,
    readFirst: (link) => <>Или сначала почитайте{' '}{link}.</>,
    aboutGame: (game) => `об игре «${game}» на Boardly`,
    moreGuides: 'Ещё гайды',
    index: {
      title: 'Гайды по настольным играм – как играть онлайн',
      description:
        'Как играть в настольные игры онлайн: пошаговые гайды по Ятзи, «Шпиону», «Памяти», крестикам-ноликам и другим играм. Бесплатно, с друзьями, прямо в браузере.',
      ogTitle: 'Гайды и советы по настольным играм',
      ogDescription: 'Пошаговые гайды: как играть в настольные игры онлайн с друзьями.',
      heading: 'Советы и правила игр',
      intro: 'Всё, чтобы разобраться в правилах, освоить стратегию и выигрывать.',
      howToPlay: 'Как играть',
      bestOf: 'Подборки',
      count: (count) => `${count} ${slavicPlural(count, ['гайд', 'гайда', 'гайдов'])}`,
      readTime: (readTime) => `${readTime} чтения`,
      aboutTitle: 'Гайды и страницы игр',
      about: [
        'У каждой игры на Boardly есть своя страница с полными правилами, стратегией и ответами на частые вопросы. Гайд «Как играть» – короткий путь для новичка: что понадобится, как проходит раунд и какие советы пригодятся в первой партии, а в большинстве гайдов ещё и рассказано, как начать игру с друзьями на Boardly. Прочитайте гайд перед первой партией, а на страницу игры заходите, когда сомневаетесь в правиле или хотите играть лучше.',
        'Подборки не объясняют одну игру, а сравнивают несколько. Они исходят из того, что есть у компании, – два игрока, вечер настолок с большой компанией или друзья на видеозвонке – и подсказывают подходящие игры. Каждый гайд ссылается на игры, о которых говорит, и все они бесплатны в браузере, ничего не нужно скачивать.',
      ],
      unguided:
        'Для некоторых игр отдельного гайда нет: их страницы уже рассказывают, как проходит ход, о стратегии и отвечают на частые вопросы:',
      listSeparator: ', ',
      lastSeparator: ' и ',
    },
  },
  uk: {
    dateLocale: 'uk-UA',
    lastUpdated: (date) => <>Оновлено {date}</>,
    rulesLink: (link) => <>Правила, режими й кількість гравців – на{' '}{link}</>,
    gamePage: (game) => `сторінці гри «${game}»`,
    readFirst: (link) => <>Або спершу почитайте{' '}{link}.</>,
    aboutGame: (game) => `про гру «${game}» на Boardly`,
    moreGuides: 'Більше гайдів',
    index: {
      title: 'Гайди з настільних ігор – як грати онлайн',
      description:
        'Як грати в настільні ігри онлайн: покрокові гайди з Ятці, «Шпигуна», Меморі, хрестиків-ноликів та інших ігор. Безкоштовно, з друзями, просто в браузері.',
      ogTitle: 'Гайди й поради з настільних ігор',
      ogDescription: 'Покрокові гайди: як грати в настільні ігри онлайн із друзями.',
      heading: 'Поради та правила ігор',
      intro: 'Усе, щоб розібратися в правилах, опанувати стратегію й вигравати.',
      howToPlay: 'Як грати',
      bestOf: 'Добірки',
      count: (count) => `${count} ${slavicPlural(count, ['гайд', 'гайди', 'гайдів'])}`,
      readTime: (readTime) => `${readTime} читання`,
      aboutTitle: 'Гайди та сторінки ігор',
      about: [
        'Кожна гра на Boardly має власну сторінку з повними правилами, стратегією та відповідями на часті запитання. Гайд «Як грати» – коротший шлях для новачка: що знадобиться, як минає раунд і які поради стануть у пригоді в першій партії, а більшість гайдів ще й пояснює, як почати гру з друзями на Boardly. Прочитайте гайд перед першою партією, а на сторінку гри заходьте, коли сумніваєтеся в правилі або хочете грати краще.',
        'Добірки не пояснюють одну гру, а порівнюють кілька. Вони виходять із того, що є в компанії, – двоє гравців, вечір настолок із великою компанією чи друзі на відеодзвінку – і підказують ігри, які пасують. Кожен гайд посилається на ігри, про які розповідає, і всі вони безкоштовні в браузері, нічого не треба завантажувати.',
      ],
      unguided:
        'Для деяких ігор окремого гайда немає: їхні сторінки вже розповідають, як минає хід, про стратегію й відповідають на часті запитання:',
      listSeparator: ', ',
      lastSeparator: ' і ',
    },
  },
  no: {
    dateLocale: 'nb-NO',
    lastUpdated: (date) => <>Sist oppdatert {date}</>,
    rulesLink: (link) => <>Regler, spillmoduser og antall spillere finner du på{' '}{link}</>,
    gamePage: (game) => `siden om ${norwegianDefinite(game)}`,
    readFirst: (link) => <>Eller les først om{' '}{link}.</>,
    aboutGame: (game) => `${norwegianDefinite(game)} på Boardly`,
    moreGuides: 'Flere guider',
    index: {
      title: 'Guider til brettspill – slik spiller du på nett',
      description:
        'Lær å spille populære brettspill på nett. Steg-for-steg-guider til Yatzy, Gjett spionen, Hukommelse, tre på rad og flere. Gratis med venner, rett i nettleseren.',
      ogTitle: 'Guider og tips til brettspill',
      ogDescription: 'Steg-for-steg-guider til brettspill du kan spille på nett med venner.',
      heading: 'Tips og spilleregler',
      intro: 'Alt du trenger for å forstå reglene, lære strategien og vinne.',
      howToPlay: 'Slik spiller du',
      bestOf: 'Beste spill',
      count: (count) => `${count} ${count === 1 ? 'guide' : 'guider'}`,
      readTime: (readTime) => `${readTime} lesetid`,
      aboutTitle: 'Guider og spillsider',
      about: [
        'Hvert spill på Boardly har sin egen side med alle reglene, strategi og svar på vanlige spørsmål. En slik-spiller-du-guide er den korte veien inn for den som er ny i spillet: hva du trenger, hvordan en runde foregår og de første tipsene som er verdt å kunne, og de fleste forteller også hvordan du starter et spill med venner på Boardly. Les guiden før første spill, og spillsiden når du er usikker på en regel eller vil bli bedre.',
        'Guidene om de beste spillene sammenligner spill i stedet for å forklare ett. De tar utgangspunkt i hva gjengen faktisk har – to spillere, en spillkveld med flere, eller venner på videosamtale – og peker på spillene som passer. Hver guide lenker til spillene den nevner, og alle spillene her er gratis i nettleseren, uten nedlasting.',
      ],
      unguided:
        'Noen spill har ingen egen guide, fordi spillsiden allerede forklarer hvordan en tur foregår, strategien og de vanlige spørsmålene:',
      listSeparator: ', ',
      lastSeparator: ' og ',
    },
  },
}
