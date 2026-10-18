# Content rating (IARC questionnaire) – answers for online.boardly.app (#1468)

Checked against the code on `develop` at a3bcab7b (2026-10-18). Play Console path: **Policy → App
content → Content rating → Start**.

Play's rules for this form (Content Ratings, answer/9898843):

> "All apps must have a content rating from the IARC to be on Google Play."
> "Your app will be assigned a content rating from multiple rating authorities based on your
> questionnaire responses."
> "Misrepresentation of your app's content may result in removal or suspension."

Re-submit the questionnaire when content changes in a way that changes an answer below – a new game
with violence or gambling, or in-app purchases.

## Category: Game

Boardly's primary purpose is playing games. Chat exists inside the games, which makes it a game with
user interaction, not a social network: Play's help for "Social Networking, Forums, and UGC Sharing"
(answer/6159973) asks to choose that category only when the app meets the definition, with Facebook as
the example, and not because an app has a social feature.

Contact email for the rating certificate: **support@boardly.online**.

## Answers, by the questionnaire's topics

The topic names are those of Play's "Ratings questionnaire help" (topic 6181287). The Console words
the questions slightly differently per category; answer by the content, as below.

| Topic | Answer | Why, and where it is in the code |
|---|---|---|
| Violent material (any violence, blood, gore, weapons used against characters) | **No** | The games are abstract boards, dice, cards and drawings. A capture in Checkers or Ludo removes a token from the board with a fade; no character is hurt (`lib/games/checkers-game.ts`, `lib/games/ludo-game.ts`). Sketch & Guess prompts include everyday words such as "knife", "sword", "ghost" and "zombie" for players to draw (`lib/games/sketch-and-guess-words.ts`); the app depicts nothing. |
| Fear, horror | **No** | No scary scenes, sounds or imagery. |
| Sexual material, nudity, provocative outfits, sexual situations | **No** | None in any game, word list or illustration. |
| Language (profanity, crude humour) | **No** in our content | Word lists, prompts and UI copy contain none (`lib/games/alias-words.ts`, `lib/games/sketch-and-guess-words.ts`, `lib/spy-locations.ts`, `locales/*.ts`). What players type is covered by "Online interaction" below, not by this question. |
| Alcohol, tobacco, illegal or recreational drugs, incentives for drugs | **No** | None depicted or referenced. Guess the Spy's location list has a "Casino" with a "Bartender" role and a cruise ship with a bartender (`lib/spy-locations.ts`) – a job title in a list of places, with no drinking shown or mentioned. A scan of every word list for alcohol, tobacco and drug words in all six languages found nothing else (the one hit, "виноград", means grapes). |
| Casinos, gambling halls or racetracks; simulated gambling; real-money gambling | **No** | See "Dice games are not gambling" below. |
| Nazi symbols, criminal instruction | **No** | None. |
| Digital purchases | **No** | Play's help describes purchases "completed directly from within the game" (answer/6161125). The app has no purchase path: Play mode removes every checkout and billing-portal entry, and `startCheckout` returns early in the app (`components/PurchaseOnly.tsx`, `app/premium/PremiumContent.tsx`, #1465). Nothing can be bought in the app. |
| Online interaction or content exchange: can users interact or exchange content? | **Yes** | Play's help: answer yes "if users can freely exchange content they have created", and "multiplayer functionality by itself (with no means for communication or sharing) would not require indicating 'Yes'" (answer/6161115). Boardly has text chat in every lobby and game (`components/Chat.tsx`, `app/api/lobby/[code]/chat/route.ts`), drawings shared in Sketch & Guess, typed claims in Liar's Party and typed guesses in Explain the Word (Alias in the code), and usernames, bios and profile pictures other players see. |
| Shares the user's current physical location with other users | **No** | The app asks for no location and shows none (`android/app/src/main/AndroidManifest.xml` declares only `POST_NOTIFICATIONS`). |
| Unrestricted internet access (a web browser or search engine) | **No** | The app opens boardly.online only (`fullScopeUrl` in `android/twa-manifest.json`); it is not a browser or a search engine. |
| Shares personal information provided by the user with third parties | **No** | Our processors act for us; the AdSense script receives no information the user typed (`data-safety.md`, Sharing). |

## Dice games are not gambling

Yatzy and Ludo roll dice, and the dice decide a score or a move. Nothing is staked: there is no
currency, no betting, no chips, no wager on an outcome, no casino game (no slots, roulette, poker,
blackjack) and no prize of any kind (`lib/games/yahtzee-game.ts`, `lib/games/ludo-game.ts`; the
whole catalog is in `lib/game-catalog.ts`). Rock Paper Scissors is a simultaneous pick with no
stake either. Chance in a board game is not gambling; the IARC topic covers simulations of what is
"normally played/carried out in casinos, gambling halls, horse tracks" (answer/6161086), which no game
here is. A spy location named "Casino" is a word in a list, not a gambling simulation.

## How user content is handled (for the interaction question's follow-ups)

If the Console asks how user-generated content is moderated:

- Before the first chat message or Explain the Word guess, every player – guest or account – accepts
  the Terms and the Community Rules ("Accept and chat") (`lib/terms-gate.ts`, #1466).
- Any player can **report** a chat message, a drawing, a player card or a profile; staff review
  reports in the admin panel (`lib/content-reports.ts`, Terms § 5, #1172).
- Any player can **block** another player, which hides their messages in every game (`UserBlocks`,
  `app/api/user/blocks/route.ts`, #1466).
- Chat is deleted after 24 hours (`lib/retention-periods.ts` `CHAT_RETENTION_HOURS`).
- There is no automatic profanity filter; moderation is report-driven.

## Expected outcome

IARC decides; this is what the answers above normally produce for a game with no violence,
no gambling, no purchases and user chat:

| Authority | Expected rating |
|---|---|
| IARC generic (other territories) | 3+ |
| PEGI (Europe, incl. Norway) | PEGI 3 |
| ESRB (Americas) | Everyone |
| USK (Germany) | USK ab 0 |
| ClassInd (Brazil) | L |
| ACB (Australia) | G |

Each with the interactive element **Users Interact**. Where an authority weighs open chat more
heavily – Play's own description of USK 12 notes that user-generated content in social networks can
raise youth-protection concerns (answer/188189) – the result can come back one step higher; that
would be the authority's call, not a reason to answer differently. Nothing in the answers points
above 12 anywhere.
