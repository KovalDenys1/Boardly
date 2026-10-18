# Store settings, app access and release notes – online.boardly.app (#1468)

Checked against the code on `develop` at a3bcab7b (2026-10-18).

## Store settings (Grow → Store presence → Store settings)

| Field | Value | Why |
|---|---|---|
| App or game | **Game** | – |
| Category | **Board** | Play's game categories include "board" (answer/9859673). Seven of the eleven games are board, dice or tile games; the four party games are table games played over a board too. |
| Tags | Up to five (Play's maximum, answer/9859673), picked from the Console's list in this order of preference: **Board**, **Multiplayer**, **Party**, **Casual**, **Word** | Board and dice games first, then what sets Boardly apart (real-time multiplayer, party games), then the word games (Explain the Word, Sketch & Guess). The Console's list is the authority; skip any that is not offered. |
| Email address | **support@boardly.online** | Required by Play (answer/9859152). It reaches us through Resend (privacy notice, `privacyPolicy.purposes.feedback.data`). |
| Phone number | leave empty | Optional. |
| Website | **https://boardly.online** | – |
| External marketing | Off | Nothing to promote outside Play yet. |

## App content (Policy → App content)

| Declaration | Answer | Where |
|---|---|---|
| Privacy policy | **https://boardly.online/privacy** | `app/privacy/page.tsx` |
| Ads | **No, my app does not contain ads** | See below |
| App access | **All or some functionality is restricted** | See below |
| Content rating | Game, see `content-rating.md` | – |
| Target audience | 13–15, 16–17, 18+ | `target-audience.md` |
| Data safety | see `data-safety.md` | – |
| Account deletion URL | **https://boardly.online/privacy** | `data-safety.md` |
| Advertising ID, news, government, financial, health | No | `target-audience.md` |

### Ads: "No"

Play: "You must declare whether or not your app contains ads. This includes ads delivered through
third-party ad SDKs", and "Google may verify this at any time and display the 'Contains ads' label if
appropriate" (answer/9859455). No ad unit renders inside the app, now or after ads go live on the
web: `components/AdSlot.tsx`, the only place an `<ins class="adsbygoogle">` comes from, renders
nothing in Play mode (`useIsPlayApp()`), on top of its other gates (`NEXT_PUBLIC_ADS_ENABLED`, which
is unset until AdSense approves the site, and premium). The AdSense script that `app/layout.tsx` loads
also runs in the app, because the server cannot tell the app from a browser; there it is site
verification and Google's EEA/UK consent message, requests no ad and shows the user nothing but that
message (`data-safety.md`, Sharing). AdSense Auto ads, which need no slot, must stay off; nothing
serves at all while AdSense still lists the site as "Getting ready".

The answer changes only if ads are deliberately allowed in the app: removing the Play-mode gate or
switching on Auto ads. The ads-day checklist in `docs/OPERATIONS.md` (step 10) says so.

### App access: instructions for the reviewer

Choose **All or some functionality is restricted**: playing needs no sign-in, but the profile, friends
and the account deletion path need an account. Add one set of instructions:

- **Name:** Reviewer account
- **Username / password:** a dedicated reviewer account on boardly.online (entered in the Console
  only; never written into this repository)
- **Any other instructions:**

```
No sign-in is needed to play. Open the app, pick any game and choose "Play as guest", or use the
"Create lobby" shortcut. Tic-Tac-Toe, Four in a Row, Checkers, Ludo, Yatzy, Pairs (Memory in the app)
and Rock Paper Scissors can be played alone: add a bot in the room before starting. Guess the Spy,
Explain the Word (Alias in the app), Liar's Party and Sketch & Guess need 3 or 4 real players and
cannot start alone.

Chat: open or create a room. The waiting room has a Chat button, and every game has chat (on phones,
the Chat tab). Before the first message the app asks to accept the Terms and Community Rules ("Accept
and chat"). Each message has Report and Block. To see two people chatting, open the room link from a second device or browser.

Account features (profile, friends, data download, account deletion) need the reviewer account above.
Account deletion: menu > Profile > Profile tab > Danger Zone > Delete Account. A confirmation
link is emailed to the account's address. Guests delete their data with "Forget me" in the guest menu.

Nothing can be bought in the app. The app is the website boardly.online running as a Trusted Web
Activity.
```

The reviewer account is the one item here that needs the account owner: create it on boardly.online
with an address you can read (so its email is verified and the deletion email arrives), and type the
credentials into the Console.

## Closed test before production

Play "requires personal developer accounts created after November 13, 2023, to test their apps": a
closed test with "a minimum of 12 testers who have been opted in continuously for at least 14 days",
then apply for production access from the Dashboard (answer/14151465). It does not apply to an
organisation account or to a personal account created before that date. Plan the first release as a
closed test track with the listing below; production comes after the 14 days.

## Release notes for 1.0.0

Play takes "up to 500 Unicode characters per language" and says "Do not use release notes for
promotional purposes or to solicit user actions" (answer/9859348). The notes below state what the
release contains and nothing else. Source of truth: `listing.json` → `releaseNotes["1.0.0"]`;
`__tests__/android/listing.test.ts` fails if this block and the JSON differ. Paste the block as it is
into **Release notes** on the release page:

```
<en-US>
The first version of Boardly for Android. It has the same games as boardly.online: Yatzy, Ludo, Checkers, Four in a Row, Tic-Tac-Toe, Pairs, Rock Paper Scissors, Guess the Spy, Explain the Word, Liar's Party and Sketch & Guess. Rooms, chat, friends and accounts work the same in the app and in the browser. Notifications for game invites, friend requests and turn reminders can be turned on in the app.
</en-US>
<no-NO>
Den første versjonen av Boardly for Android. Den har de samme spillene som boardly.online: Yatzy, Ludo, Dam, Fire på rad, Tre på rad, Hukommelse, «Stein, saks, papir», Gjett spionen, Forklar ordet, Løgnerfest og Tegn og gjett. Rom, chat, venner og kontoer fungerer likt i appen og i nettleseren. Varsler om spillinvitasjoner, venneforespørsler og påminnelser om trekk kan slås på i appen.
</no-NO>
<de-DE>
Die erste Version von Boardly für Android. Sie bietet dieselben Spiele wie boardly.online: Yatzy, Ludo, Dame, Vier in einer Reihe, Tic-Tac-Toe, Paare finden, „Schere, Stein, Papier“, Finde den Spion, Begriffe erklären, Lügnerparty und Zeichnen & Raten. Räume, Chat, Freunde und Konten funktionieren in der App genauso wie im Browser. Benachrichtigungen zu Spieleinladungen, Freundschaftsanfragen und Zugerinnerungen lassen sich in der App einschalten.
</de-DE>
<es-ES>
La primera versión de Boardly para Android. Tiene los mismos juegos que boardly.online: Yatzy, Ludo, Damas, Cuatro en raya, Tres en raya, Memoria, «Piedra, papel o tijera», Encuentra al espía, Explica la palabra, Fiesta de mentirosos y Dibuja y adivina. Las salas, el chat, los amigos y las cuentas funcionan igual en la app que en el navegador. Las notificaciones de invitaciones, solicitudes de amistad y avisos de turno se activan en la app.
</es-ES>
<uk>
Перша версія Boardly для Android. У ній ті самі ігри, що й на boardly.online: Ятці, Лудо, Шашки, Чотири в ряд, Хрестики-нолики, Меморі, «Камінь, ножиці, папір», Вгадай шпигуна, Поясни слово, Вечірка брехунів і Намалюй і вгадай. Кімнати, чат, друзі й акаунти працюють у застосунку так само, як у браузері. Сповіщення про запрошення до гри, запити в друзі та нагадування про хід можна ввімкнути в застосунку.
</uk>
<ru-RU>
Первая версия Boardly для Android. В ней те же игры, что и на boardly.online: Ятзи, Лудо, Шашки, Четыре в ряд, Крестики-нолики, Память, «Камень, ножницы, бумага», Угадай шпиона, Объясни слово, Вечеринка лжецов и Нарисуй и угадай. Комнаты, чат, друзья и аккаунты работают в приложении так же, как в браузере. Уведомления о приглашениях в игру, заявках в друзья и напоминания о ходе можно включить в приложении.
</ru-RU>
```
