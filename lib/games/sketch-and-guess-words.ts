/**
 * Sketch & Guess word bank (#1082).
 *
 * Every entry is a noun a person can draw in a minute and a half, in all four
 * site languages. The first form of each language is the one shown to a drawer
 * whose UI is in that language; the rest are accepted as correct guesses too –
 * a plural, a common synonym, the everyday short form. A guess counts when it
 * matches any form in any language after `normalizeSketchGuess`, so a table of
 * Norwegians and Ukrainians can play the same round.
 *
 * The ids are stable: a game in progress stores the chosen entry whole (see
 * `SketchAndGuessRound.word`), so editing a form here never changes a round
 * that is already being played, but an id is what `choose-word` names.
 *
 * The first 25 entries are the English-only prompt pool this game started with.
 * They stay first and keep their English display form, because a game persisted
 * before #1082 stores only that English word in `round.prompt`, and
 * `findSketchWordByEnglish` is how such a round is given its other languages.
 */

export type SketchWordLocale = 'en' | 'no' | 'ru' | 'uk'

export const SKETCH_WORD_LOCALES: readonly SketchWordLocale[] = ['en', 'no', 'ru', 'uk']

export interface SketchWord {
  id: string
  en: string[]
  no: string[]
  ru: string[]
  uk: string[]
}

export const SKETCH_WORDS: readonly SketchWord[] = [
  // ── The original prompt pool ────────────────────────────────────────────
  { id: 'castle', en: ['castle', 'castles'], no: ['slott', 'borg'], ru: ['замок'], uk: ['замок'] },
  { id: 'spaceship', en: ['spaceship', 'spacecraft', 'space ship'], no: ['romskip'], ru: ['космический корабль', 'звездолёт', 'космолёт'], uk: ['космічний корабель', 'зореліт'] },
  { id: 'volcano', en: ['volcano', 'volcanoes'], no: ['vulkan'], ru: ['вулкан'], uk: ['вулкан'] },
  { id: 'pirate', en: ['pirate', 'pirates'], no: ['pirat'], ru: ['пират'], uk: ['пірат'] },
  { id: 'robot', en: ['robot', 'robots'], no: ['robot'], ru: ['робот'], uk: ['робот'] },
  { id: 'dragon', en: ['dragon', 'dragons'], no: ['drage'], ru: ['дракон'], uk: ['дракон'] },
  { id: 'island', en: ['island', 'islands'], no: ['øy', 'holme'], ru: ['остров'], uk: ['острів'] },
  { id: 'unicorn', en: ['unicorn', 'unicorns'], no: ['enhjørning'], ru: ['единорог'], uk: ['єдиноріг'] },
  { id: 'sheriff', en: ['sheriff'], no: ['sheriff'], ru: ['шериф'], uk: ['шериф'] },
  { id: 'treasure', en: ['treasure', 'treasure chest'], no: ['skatt', 'skattekiste'], ru: ['сокровище', 'клад', 'сокровища'], uk: ['скарб', 'скарби'] },
  { id: 'jungle', en: ['jungle'], no: ['jungel'], ru: ['джунгли'], uk: ['джунглі'] },
  { id: 'rainbow', en: ['rainbow'], no: ['regnbue'], ru: ['радуга'], uk: ['веселка', 'райдуга'] },
  { id: 'thunder', en: ['thunder', 'thunderstorm'], no: ['torden', 'tordenvær'], ru: ['гром', 'гроза'], uk: ['грім', 'гроза'] },
  { id: 'mermaid', en: ['mermaid'], no: ['havfrue'], ru: ['русалка'], uk: ['русалка'] },
  { id: 'tornado', en: ['tornado', 'twister'], no: ['tornado', 'virvelvind'], ru: ['торнадо', 'смерч'], uk: ['торнадо', 'смерч'] },
  { id: 'piano', en: ['piano', 'grand piano'], no: ['piano', 'flygel'], ru: ['пианино', 'рояль', 'фортепиано'], uk: ['піаніно', 'рояль', 'фортепіано'] },
  { id: 'astronaut', en: ['astronaut', 'cosmonaut'], no: ['astronaut'], ru: ['космонавт', 'астронавт'], uk: ['космонавт', 'астронавт'] },
  { id: 'whale', en: ['whale', 'whales'], no: ['hval'], ru: ['кит'], uk: ['кит'] },
  { id: 'viking', en: ['viking', 'vikings'], no: ['viking'], ru: ['викинг'], uk: ['вікінг'] },
  { id: 'waterfall', en: ['waterfall'], no: ['foss', 'fossefall'], ru: ['водопад'], uk: ['водоспад'] },
  { id: 'carnival', en: ['carnival'], no: ['karneval'], ru: ['карнавал'], uk: ['карнавал'] },
  { id: 'skateboard', en: ['skateboard'], no: ['skateboard', 'rullebrett'], ru: ['скейтборд', 'скейт'], uk: ['скейтборд', 'скейт'] },
  { id: 'mountain', en: ['mountain', 'mountains'], no: ['fjell'], ru: ['гора', 'горы'], uk: ['гора', 'гори'] },
  { id: 'submarine', en: ['submarine'], no: ['ubåt'], ru: ['подводная лодка', 'подлодка', 'субмарина'], uk: ['підводний човен', 'субмарина'] },
  { id: 'fireworks', en: ['fireworks', 'firework'], no: ['fyrverkeri'], ru: ['фейерверк', 'салют'], uk: ['феєрверк', 'салют'] },

  // ── Animals ──────────────────────────────────────────────────────────────
  { id: 'cat', en: ['cat', 'cats', 'kitten'], no: ['katt', 'pus', 'kattunge'], ru: ['кошка', 'кот', 'котёнок'], uk: ['кіт', 'кішка', 'кошеня'] },
  { id: 'dog', en: ['dog', 'dogs', 'puppy'], no: ['hund', 'valp'], ru: ['собака', 'пёс', 'щенок'], uk: ['собака', 'пес', 'цуценя'] },
  { id: 'fish', en: ['fish'], no: ['fisk'], ru: ['рыба', 'рыбка'], uk: ['риба', 'рибка'] },
  { id: 'bird', en: ['bird', 'birds'], no: ['fugl'], ru: ['птица', 'птичка'], uk: ['птах', 'пташка'] },
  { id: 'snake', en: ['snake', 'snakes'], no: ['slange', 'orm'], ru: ['змея'], uk: ['змія'] },
  { id: 'spider', en: ['spider', 'spiders'], no: ['edderkopp'], ru: ['паук'], uk: ['павук'] },
  { id: 'elephant', en: ['elephant', 'elephants'], no: ['elefant'], ru: ['слон'], uk: ['слон'] },
  { id: 'giraffe', en: ['giraffe', 'giraffes'], no: ['sjiraff'], ru: ['жираф'], uk: ['жираф'] },
  { id: 'lion', en: ['lion', 'lions'], no: ['løve'], ru: ['лев'], uk: ['лев'] },
  { id: 'monkey', en: ['monkey', 'monkeys', 'ape'], no: ['ape'], ru: ['обезьяна'], uk: ['мавпа'] },
  { id: 'horse', en: ['horse', 'horses', 'pony'], no: ['hest'], ru: ['лошадь', 'конь'], uk: ['кінь'] },
  { id: 'cow', en: ['cow', 'cows'], no: ['ku'], ru: ['корова'], uk: ['корова'] },
  { id: 'pig', en: ['pig', 'pigs'], no: ['gris'], ru: ['свинья', 'поросёнок'], uk: ['свиня', 'порося'] },
  { id: 'rabbit', en: ['rabbit', 'bunny'], no: ['kanin'], ru: ['кролик', 'зайчик'], uk: ['кролик', 'зайчик'] },
  { id: 'bear', en: ['bear', 'bears'], no: ['bjørn'], ru: ['медведь'], uk: ['ведмідь'] },
  { id: 'penguin', en: ['penguin', 'penguins'], no: ['pingvin'], ru: ['пингвин'], uk: ['пінгвін'] },
  { id: 'owl', en: ['owl', 'owls'], no: ['ugle'], ru: ['сова'], uk: ['сова'] },
  { id: 'butterfly', en: ['butterfly', 'butterflies'], no: ['sommerfugl'], ru: ['бабочка'], uk: ['метелик'] },
  { id: 'snail', en: ['snail', 'snails'], no: ['snegle'], ru: ['улитка'], uk: ['равлик', 'слимак'] },
  { id: 'frog', en: ['frog', 'frogs'], no: ['frosk'], ru: ['лягушка'], uk: ['жаба'] },
  { id: 'turtle', en: ['turtle', 'tortoise'], no: ['skilpadde'], ru: ['черепаха'], uk: ['черепаха'] },
  { id: 'shark', en: ['shark', 'sharks'], no: ['hai'], ru: ['акула'], uk: ['акула'] },
  { id: 'octopus', en: ['octopus'], no: ['blekksprut'], ru: ['осьминог'], uk: ['восьминіг'] },
  { id: 'chicken', en: ['chicken', 'hen'], no: ['høne', 'kylling'], ru: ['курица'], uk: ['курка'] },
  { id: 'duck', en: ['duck', 'ducks'], no: ['and'], ru: ['утка'], uk: ['качка'] },
  { id: 'dinosaur', en: ['dinosaur', 'dinosaurs'], no: ['dinosaur'], ru: ['динозавр'], uk: ['динозавр'] },
  { id: 'crocodile', en: ['crocodile', 'alligator'], no: ['krokodille'], ru: ['крокодил'], uk: ['крокодил'] },
  { id: 'kangaroo', en: ['kangaroo'], no: ['kenguru'], ru: ['кенгуру'], uk: ['кенгуру'] },
  { id: 'zebra', en: ['zebra'], no: ['sebra'], ru: ['зебра'], uk: ['зебра'] },
  { id: 'camel', en: ['camel'], no: ['kamel'], ru: ['верблюд'], uk: ['верблюд'] },
  { id: 'bee', en: ['bee', 'bees'], no: ['bie'], ru: ['пчела'], uk: ['бджола'] },
  { id: 'ant', en: ['ant', 'ants'], no: ['maur'], ru: ['муравей'], uk: ['мураха', 'мурашка'] },
  { id: 'mouse', en: ['mouse', 'mice'], no: ['mus'], ru: ['мышь', 'мышка'], uk: ['миша', 'мишка'] },
  { id: 'hedgehog', en: ['hedgehog'], no: ['pinnsvin'], ru: ['ёж', 'ёжик'], uk: ['їжак'] },
  { id: 'fox', en: ['fox'], no: ['rev'], ru: ['лиса', 'лисица'], uk: ['лисиця', 'лис'] },
  { id: 'wolf', en: ['wolf', 'wolves'], no: ['ulv'], ru: ['волк'], uk: ['вовк'] },
  { id: 'deer', en: ['deer', 'reindeer'], no: ['hjort', 'rådyr', 'reinsdyr'], ru: ['олень'], uk: ['олень'] },
  { id: 'squirrel', en: ['squirrel'], no: ['ekorn'], ru: ['белка'], uk: ['білка'] },

  // ── Food ─────────────────────────────────────────────────────────────────
  { id: 'apple', en: ['apple', 'apples'], no: ['eple'], ru: ['яблоко'], uk: ['яблуко'] },
  { id: 'banana', en: ['banana', 'bananas'], no: ['banan'], ru: ['банан'], uk: ['банан'] },
  { id: 'pizza', en: ['pizza'], no: ['pizza'], ru: ['пицца'], uk: ['піца'] },
  { id: 'cake', en: ['cake', 'birthday cake'], no: ['kake', 'bløtkake'], ru: ['торт', 'пирожное'], uk: ['торт', 'тістечко'] },
  { id: 'ice_cream', en: ['ice cream', 'icecream'], no: ['iskrem', 'is'], ru: ['мороженое'], uk: ['морозиво'] },
  { id: 'egg', en: ['egg', 'eggs'], no: ['egg'], ru: ['яйцо'], uk: ['яйце'] },
  { id: 'bread', en: ['bread', 'loaf'], no: ['brød'], ru: ['хлеб', 'батон'], uk: ['хліб', 'батон'] },
  { id: 'cheese', en: ['cheese'], no: ['ost'], ru: ['сыр'], uk: ['сир'] },
  { id: 'carrot', en: ['carrot', 'carrots'], no: ['gulrot'], ru: ['морковь', 'морковка'], uk: ['морква', 'морквина'] },
  { id: 'mushroom', en: ['mushroom', 'mushrooms'], no: ['sopp'], ru: ['гриб'], uk: ['гриб'] },
  { id: 'strawberry', en: ['strawberry', 'strawberries'], no: ['jordbær'], ru: ['клубника'], uk: ['полуниця'] },
  { id: 'lemon', en: ['lemon'], no: ['sitron'], ru: ['лимон'], uk: ['лимон'] },
  { id: 'watermelon', en: ['watermelon'], no: ['vannmelon'], ru: ['арбуз'], uk: ['кавун'] },
  { id: 'pineapple', en: ['pineapple'], no: ['ananas'], ru: ['ананас'], uk: ['ананас'] },
  { id: 'grapes', en: ['grapes', 'grape'], no: ['druer', 'drue'], ru: ['виноград'], uk: ['виноград'] },
  { id: 'cherry', en: ['cherry', 'cherries'], no: ['kirsebær'], ru: ['вишня', 'черешня'], uk: ['вишня', 'черешня'] },
  { id: 'hamburger', en: ['hamburger', 'burger'], no: ['hamburger', 'burger'], ru: ['гамбургер', 'бургер'], uk: ['гамбургер', 'бургер'] },
  { id: 'sandwich', en: ['sandwich'], no: ['smørbrød', 'sandwich'], ru: ['бутерброд', 'сэндвич'], uk: ['бутерброд', 'сендвіч'] },
  { id: 'popcorn', en: ['popcorn'], no: ['popkorn'], ru: ['попкорн'], uk: ['попкорн'] },

  // ── Around the house ─────────────────────────────────────────────────────
  { id: 'house', en: ['house', 'home'], no: ['hus'], ru: ['дом', 'домик'], uk: ['будинок', 'хата'] },
  { id: 'clock', en: ['clock', 'watch'], no: ['klokke', 'ur'], ru: ['часы'], uk: ['годинник'] },
  { id: 'key', en: ['key', 'keys'], no: ['nøkkel'], ru: ['ключ'], uk: ['ключ'] },
  { id: 'chair', en: ['chair', 'chairs'], no: ['stol'], ru: ['стул'], uk: ['стілець'] },
  { id: 'table', en: ['table'], no: ['bord'], ru: ['стол'], uk: ['стіл'] },
  { id: 'bed', en: ['bed'], no: ['seng'], ru: ['кровать'], uk: ['ліжко'] },
  { id: 'lamp', en: ['lamp'], no: ['lampe'], ru: ['лампа'], uk: ['лампа'] },
  { id: 'door', en: ['door'], no: ['dør'], ru: ['дверь'], uk: ['двері'] },
  { id: 'window', en: ['window'], no: ['vindu'], ru: ['окно'], uk: ['вікно'] },
  { id: 'umbrella', en: ['umbrella'], no: ['paraply'], ru: ['зонт', 'зонтик'], uk: ['парасолька', 'парасоля'] },
  { id: 'glasses', en: ['glasses', 'spectacles'], no: ['briller'], ru: ['очки'], uk: ['окуляри'] },
  { id: 'hat', en: ['hat'], no: ['hatt'], ru: ['шляпа'], uk: ['капелюх'] },
  { id: 'shoe', en: ['shoe', 'shoes', 'sneaker'], no: ['sko', 'joggesko'], ru: ['ботинок', 'туфля', 'кроссовок'], uk: ['черевик', 'туфля', 'кросівок'] },
  { id: 'sock', en: ['sock', 'socks'], no: ['sokk', 'strømpe'], ru: ['носок', 'носки'], uk: ['шкарпетка', 'шкарпетки'] },
  { id: 'shirt', en: ['shirt', 't-shirt'], no: ['skjorte', 't-skjorte'], ru: ['рубашка', 'футболка'], uk: ['сорочка', 'футболка'] },
  { id: 'crown', en: ['crown'], no: ['krone'], ru: ['корона'], uk: ['корона'] },
  { id: 'ring', en: ['ring'], no: ['ring'], ru: ['кольцо'], uk: ['каблучка', 'перстень', 'кільце'] },
  { id: 'book', en: ['book', 'books'], no: ['bok'], ru: ['книга', 'книжка'], uk: ['книга', 'книжка'] },
  { id: 'pencil', en: ['pencil', 'pen'], no: ['blyant'], ru: ['карандаш'], uk: ['олівець'] },
  { id: 'scissors', en: ['scissors'], no: ['saks'], ru: ['ножницы'], uk: ['ножиці'] },
  { id: 'phone', en: ['phone', 'telephone', 'mobile phone'], no: ['telefon', 'mobil'], ru: ['телефон'], uk: ['телефон'] },
  { id: 'computer', en: ['computer', 'laptop'], no: ['datamaskin', 'pc', 'laptop'], ru: ['компьютер', 'ноутбук'], uk: ['комп\'ютер', 'ноутбук'] },
  { id: 'television', en: ['television', 'tv'], no: ['tv', 'fjernsyn'], ru: ['телевизор'], uk: ['телевізор'] },
  { id: 'candle', en: ['candle', 'candles'], no: ['lys', 'stearinlys'], ru: ['свеча', 'свечка'], uk: ['свічка'] },
  { id: 'gift', en: ['gift', 'present'], no: ['gave', 'presang'], ru: ['подарок'], uk: ['подарунок'] },
  { id: 'cup', en: ['cup', 'mug'], no: ['kopp'], ru: ['чашка', 'кружка'], uk: ['чашка', 'кухоль'] },
  { id: 'bottle', en: ['bottle'], no: ['flaske'], ru: ['бутылка'], uk: ['пляшка'] },
  { id: 'fork', en: ['fork'], no: ['gaffel'], ru: ['вилка'], uk: ['виделка'] },
  { id: 'spoon', en: ['spoon'], no: ['skje'], ru: ['ложка'], uk: ['ложка'] },
  { id: 'knife', en: ['knife'], no: ['kniv'], ru: ['нож'], uk: ['ніж'] },
  { id: 'toothbrush', en: ['toothbrush'], no: ['tannbørste'], ru: ['зубная щётка', 'щётка'], uk: ['зубна щітка', 'щітка'] },
  { id: 'toilet', en: ['toilet'], no: ['toalett', 'do'], ru: ['туалет', 'унитаз'], uk: ['туалет', 'унітаз'] },
  { id: 'bathtub', en: ['bathtub', 'bath'], no: ['badekar'], ru: ['ванна'], uk: ['ванна'] },
  { id: 'light_bulb', en: ['light bulb', 'lightbulb', 'bulb'], no: ['lyspære', 'pære'], ru: ['лампочка'], uk: ['лампочка'] },
  { id: 'camera', en: ['camera'], no: ['kamera', 'fotoapparat'], ru: ['фотоаппарат', 'камера'], uk: ['фотоапарат', 'камера'] },
  { id: 'headphones', en: ['headphones', 'headset'], no: ['hodetelefoner', 'headset'], ru: ['наушники'], uk: ['навушники'] },
  { id: 'backpack', en: ['backpack', 'rucksack'], no: ['ryggsekk', 'sekk'], ru: ['рюкзак'], uk: ['рюкзак'] },
  { id: 'glove', en: ['glove', 'gloves', 'mitten'], no: ['hanske', 'vott'], ru: ['перчатка', 'варежка'], uk: ['рукавичка', 'рукавиця'] },
  { id: 'scarf', en: ['scarf'], no: ['skjerf'], ru: ['шарф'], uk: ['шарф'] },
  { id: 'teddy_bear', en: ['teddy bear', 'teddy'], no: ['bamse', 'teddybjørn'], ru: ['плюшевый мишка', 'мишка'], uk: ['плюшевий ведмедик', 'ведмедик'] },
  { id: 'doll', en: ['doll'], no: ['dukke'], ru: ['кукла'], uk: ['лялька'] },
  { id: 'hourglass', en: ['hourglass'], no: ['timeglass'], ru: ['песочные часы'], uk: ['пісочний годинник'] },

  // ── Out and about ────────────────────────────────────────────────────────
  { id: 'tree', en: ['tree', 'trees'], no: ['tre'], ru: ['дерево'], uk: ['дерево'] },
  { id: 'flower', en: ['flower', 'flowers'], no: ['blomst'], ru: ['цветок', 'цветы'], uk: ['квітка', 'квіти'] },
  { id: 'cactus', en: ['cactus'], no: ['kaktus'], ru: ['кактус'], uk: ['кактус'] },
  { id: 'sun', en: ['sun'], no: ['sol'], ru: ['солнце'], uk: ['сонце'] },
  { id: 'moon', en: ['moon'], no: ['måne'], ru: ['луна', 'месяц'], uk: ['місяць'] },
  { id: 'star', en: ['star', 'stars'], no: ['stjerne'], ru: ['звезда'], uk: ['зірка', 'зоря'] },
  { id: 'cloud', en: ['cloud', 'clouds'], no: ['sky'], ru: ['облако', 'туча'], uk: ['хмара'] },
  { id: 'lightning', en: ['lightning', 'lightning bolt'], no: ['lyn'], ru: ['молния'], uk: ['блискавка'] },
  { id: 'snowman', en: ['snowman'], no: ['snømann'], ru: ['снеговик'], uk: ['сніговик'] },
  { id: 'snowflake', en: ['snowflake'], no: ['snøfnugg', 'snøkrystall'], ru: ['снежинка'], uk: ['сніжинка'] },
  { id: 'planet', en: ['planet', 'saturn'], no: ['planet'], ru: ['планета'], uk: ['планета'] },
  { id: 'beach', en: ['beach'], no: ['strand'], ru: ['пляж'], uk: ['пляж'] },
  { id: 'bridge', en: ['bridge'], no: ['bro', 'bru'], ru: ['мост'], uk: ['міст'] },
  { id: 'tent', en: ['tent'], no: ['telt'], ru: ['палатка'], uk: ['намет'] },
  { id: 'lighthouse', en: ['lighthouse'], no: ['fyrtårn', 'fyr'], ru: ['маяк'], uk: ['маяк'] },
  { id: 'windmill', en: ['windmill'], no: ['vindmølle'], ru: ['мельница', 'ветряная мельница'], uk: ['вітряк', 'млин'] },
  { id: 'igloo', en: ['igloo'], no: ['iglo'], ru: ['иглу'], uk: ['іглу'] },
  { id: 'pyramid', en: ['pyramid'], no: ['pyramide'], ru: ['пирамида'], uk: ['піраміда'] },
  { id: 'fence', en: ['fence'], no: ['gjerde'], ru: ['забор'], uk: ['паркан'] },
  { id: 'traffic_light', en: ['traffic light', 'traffic lights'], no: ['trafikklys', 'lyskryss'], ru: ['светофор'], uk: ['світлофор'] },
  { id: 'flag', en: ['flag'], no: ['flagg'], ru: ['флаг'], uk: ['прапор'] },
  { id: 'map', en: ['map'], no: ['kart'], ru: ['карта'], uk: ['мапа', 'карта'] },
  { id: 'ladder', en: ['ladder'], no: ['stige'], ru: ['лестница', 'стремянка'], uk: ['драбина'] },

  // ── Getting around ───────────────────────────────────────────────────────
  { id: 'car', en: ['car', 'cars'], no: ['bil'], ru: ['машина', 'автомобиль'], uk: ['машина', 'автомобіль', 'авто'] },
  { id: 'bicycle', en: ['bicycle', 'bike'], no: ['sykkel'], ru: ['велосипед'], uk: ['велосипед', 'ровер'] },
  { id: 'airplane', en: ['airplane', 'plane', 'aeroplane'], no: ['fly'], ru: ['самолёт'], uk: ['літак'] },
  { id: 'boat', en: ['boat', 'sailboat'], no: ['båt', 'seilbåt'], ru: ['лодка'], uk: ['човен'] },
  { id: 'ship', en: ['ship'], no: ['skip'], ru: ['корабль'], uk: ['корабель'] },
  { id: 'train', en: ['train'], no: ['tog'], ru: ['поезд'], uk: ['потяг', 'поїзд'] },
  { id: 'bus', en: ['bus'], no: ['buss'], ru: ['автобус'], uk: ['автобус'] },
  { id: 'truck', en: ['truck', 'lorry'], no: ['lastebil'], ru: ['грузовик'], uk: ['вантажівка'] },
  { id: 'tractor', en: ['tractor'], no: ['traktor'], ru: ['трактор'], uk: ['трактор'] },
  { id: 'helicopter', en: ['helicopter'], no: ['helikopter'], ru: ['вертолёт'], uk: ['гелікоптер', 'вертоліт'] },
  { id: 'rocket', en: ['rocket'], no: ['rakett'], ru: ['ракета'], uk: ['ракета'] },
  { id: 'anchor', en: ['anchor'], no: ['anker'], ru: ['якорь'], uk: ['якір'] },
  { id: 'balloon', en: ['balloon', 'balloons'], no: ['ballong'], ru: ['воздушный шар', 'шарик'], uk: ['повітряна кулька', 'кулька'] },
  { id: 'kite', en: ['kite'], no: ['drage', 'papirdrage'], ru: ['воздушный змей', 'змей'], uk: ['повітряний змій', 'змій'] },
  { id: 'ski', en: ['ski', 'skis'], no: ['ski'], ru: ['лыжи'], uk: ['лижі'] },

  // ── Things and people ────────────────────────────────────────────────────
  { id: 'heart', en: ['heart'], no: ['hjerte'], ru: ['сердце'], uk: ['серце'] },
  { id: 'eye', en: ['eye', 'eyes'], no: ['øye'], ru: ['глаз'], uk: ['око'] },
  { id: 'hand', en: ['hand'], no: ['hånd'], ru: ['рука', 'ладонь'], uk: ['рука', 'долоня'] },
  { id: 'nose', en: ['nose'], no: ['nese'], ru: ['нос'], uk: ['ніс'] },
  { id: 'tooth', en: ['tooth', 'teeth'], no: ['tann'], ru: ['зуб'], uk: ['зуб'] },
  { id: 'guitar', en: ['guitar'], no: ['gitar'], ru: ['гитара'], uk: ['гітара'] },
  { id: 'drum', en: ['drum', 'drums'], no: ['tromme'], ru: ['барабан'], uk: ['барабан'] },
  { id: 'microphone', en: ['microphone', 'mic'], no: ['mikrofon'], ru: ['микрофон'], uk: ['мікрофон'] },
  { id: 'football', en: ['football', 'soccer ball', 'ball'], no: ['fotball', 'ball'], ru: ['мяч', 'футбольный мяч'], uk: ['м\'яч', 'футбольний м\'яч'] },
  { id: 'sword', en: ['sword'], no: ['sverd'], ru: ['меч'], uk: ['меч'] },
  { id: 'hammer', en: ['hammer'], no: ['hammer'], ru: ['молоток'], uk: ['молоток'] },
  { id: 'magnet', en: ['magnet'], no: ['magnet'], ru: ['магнит'], uk: ['магніт'] },
  { id: 'ghost', en: ['ghost'], no: ['spøkelse'], ru: ['привидение', 'призрак'], uk: ['привид'] },
  { id: 'skeleton', en: ['skeleton'], no: ['skjelett'], ru: ['скелет'], uk: ['скелет'] },
  { id: 'witch', en: ['witch'], no: ['heks'], ru: ['ведьма'], uk: ['відьма'] },
  { id: 'princess', en: ['princess'], no: ['prinsesse'], ru: ['принцесса'], uk: ['принцеса'] },
  { id: 'king', en: ['king'], no: ['konge'], ru: ['король'], uk: ['король'] },
  { id: 'clown', en: ['clown'], no: ['klovn'], ru: ['клоун'], uk: ['клоун'] },
  { id: 'ninja', en: ['ninja'], no: ['ninja'], ru: ['ниндзя'], uk: ['ніндзя'] },
  { id: 'alien', en: ['alien', 'extraterrestrial'], no: ['romvesen', 'alien'], ru: ['инопланетянин', 'пришелец'], uk: ['прибулець', 'інопланетянин'] },
  { id: 'zombie', en: ['zombie'], no: ['zombie'], ru: ['зомби'], uk: ['зомбі'] },
]

const WORDS_BY_ID = new Map(SKETCH_WORDS.map((word) => [word.id, word]))

export function getSketchWord(id: string): SketchWord | null {
  return WORDS_BY_ID.get(id) ?? null
}

/**
 * The bank entry whose English display form is `prompt`, for a round persisted
 * before #1082 that stored only the English word.
 */
export function findSketchWordByEnglish(prompt: string): SketchWord | null {
  const key = normalizeSketchGuess(prompt)
  if (!key) return null
  return SKETCH_WORDS.find((word) => word.en.some((form) => normalizeSketchGuess(form) === key)) ?? null
}

/** The form a viewer whose UI is in `locale` should be shown, English when that language has none. */
export function sketchWordDisplay(word: Pick<SketchWord, SketchWordLocale> | null | undefined, locale: string): string {
  if (!word) return ''
  const lang = resolveSketchWordLocale(locale)
  return word[lang]?.[0] || word.en?.[0] || ''
}

export function resolveSketchWordLocale(locale: string | null | undefined): SketchWordLocale {
  const normalized = (locale || '').toLowerCase()
  // `nb` and `nn` are how a browser names Norwegian; the site calls it `no`.
  if (normalized.startsWith('nb') || normalized.startsWith('nn')) return 'no'
  return SKETCH_WORD_LOCALES.find((lang) => normalized === lang || normalized.startsWith(`${lang}-`)) ?? 'en'
}

/**
 * The one comparison key for a guess and for every form in the bank.
 *
 * Lowercase; `ё` folds to `е` (Russian writes both for the same letter); every
 * other diacritic is stripped by decomposing and dropping combining marks – so
 * `café` is `cafe` and `rådyr` is `radyr` – except the breve on `й`, which is a
 * different letter from `и` and would otherwise make `чайка` and `чаика` equal.
 * Apostrophes go (Ukrainian `м'яч` is typed with any of three of them, or none),
 * hyphens and other punctuation become spaces, and runs of space collapse.
 */
export function normalizeSketchGuess(value: string): string {
  if (typeof value !== 'string') return ''
  const lowered = value.toLowerCase().replace(/ё/g, 'е')
  const decomposed = lowered.normalize('NFD')
  let out = ''
  for (let i = 0; i < decomposed.length; i += 1) {
    const ch = decomposed[i]
    const code = ch.charCodeAt(0)
    const isCombining = code >= 0x0300 && code <= 0x036f
    if (isCombining) {
      // U+0306 COMBINING BREVE after и is й; keep it.
      if (code === 0x0306 && decomposed[i - 1] === 'и') out += ch
      continue
    }
    out += ch
  }
  return out
    .normalize('NFC')
    .replace(/['’ʼ`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Every accepted form of a word, normalised, across all four languages. */
export function sketchWordKeys(word: Pick<SketchWord, SketchWordLocale>): string[] {
  const keys = new Set<string>()
  for (const lang of SKETCH_WORD_LOCALES) {
    for (const form of word[lang] ?? []) {
      const key = normalizeSketchGuess(form)
      if (key) keys.add(key)
    }
  }
  return [...keys]
}

/** Levenshtein distance, stopping as soon as it is known to exceed `limit`. */
export function boundedEditDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      current.push(value)
      if (value < rowMin) rowMin = value
    }
    if (rowMin > limit) return limit + 1
    previous = current
  }
  return previous[b.length]
}

/** Below this length a one-letter-off hint gives the word away, so none is offered. */
const MIN_CLOSE_HINT_LENGTH = 4

export type SketchGuessMatch = 'correct' | 'close' | 'wrong'

export function matchSketchGuess(guess: string, word: Pick<SketchWord, SketchWordLocale>): SketchGuessMatch {
  const key = normalizeSketchGuess(guess)
  if (!key) return 'wrong'
  const keys = sketchWordKeys(word)
  if (keys.includes(key)) return 'correct'
  const isClose = keys.some(
    (form) => form.length >= MIN_CLOSE_HINT_LENGTH && boundedEditDistance(key, form, 1) === 1
  )
  return isClose ? 'close' : 'wrong'
}
