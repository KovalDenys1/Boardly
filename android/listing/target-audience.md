# Target audience and content – answers for online.boardly.app (#1468)

Checked against the code on `develop` at a3bcab7b (2026-10-18). Play Console path: **Policy → App
content → Target audience and content**. Declare **Ads** first: Play wants it done before this
section ("declared whether or not your app contains ads", answer/9867159), and the answer is in
`store-settings.md`.

## Target age groups

Tick **13–15**, **16–17** and **18 and over**. Leave **5 and under**, **6–8** and **9–12** unticked.

Why 13 and over, from the site's own rule:

- Terms § 2 "Accounts, guests and age": "Boardly is for people aged 13 and over, with or without an
  account" and "If we learn that an account or a guest profile belongs to someone under 13, we close
  it and delete its data" (`locales/en.ts` `terms.accounts.guests`, `.under13`). (The brief pointed
  at § 3; the age rule is in § 2, and § 3 is Premium's own age rule.)
- An account requires confirming "I am 13 or older" on the sign-up form, or in the onboarding modal for
  Google, GitHub and Discord sign-ups, and the time is stored (`lib/age-confirmation.ts`,
  `Users.ageConfirmedAt`, from 2026-09-27).
- Privacy notice § 10: "Boardly is not intended for children under 13, and we do not knowingly collect
  their data" (`privacyPolicy.children.body`).
- The listing says so in all six languages ("for players aged 13 and over", `listing.json`).

Why not 18+ only: the Terms admit 13–17, and nothing in the games needs an adult audience (no
gambling, no mature content, `content-rating.md`). Ticking only 18+ would turn on Restrict Minor
Access and contradict the Terms.

Play notes that "this age group may be considered to include children in some locales" for 13–15 and
16–17, and that "you must consider if they would be considered children under their local laws"
(answer/9867159). How that is handled: the account rests on contract, not consent, so the GDPR Art. 8
consent age does not apply (privacy notice § 10, `lib/age-confirmation.ts` header comment); the app
serves no ads to anyone (`store-settings.md`, Ads), so the Families ad-SDK and neutral-age-screen
rules for mixed audiences have nothing to act on; and the app sells nothing.

## Could the store listing unintentionally appeal to children?

**No.** Play's example of what does is "youthful animation or young characters in the graphic assets"
(answer/9867159), and it may reject an app that is not primarily for under-13s but whose listing
"contains marketing elements that suggest otherwise". The listing keeps clear of that:

- The texts (`listing.json`) address players who organise their own game night ("on a video call, in
  the same room"), name no school, kids, children or family, and state the 13+ rule.
- The games are classic board, dice and party games that adults play; the party games are
  conversation and bluffing games that need a group of people talking.
- Rules for the graphics (being made in `android/listing/graphics/`): real game screens of the site
  as it is, the brand palette and type, no cartoon mascots or young characters, no toy-like
  illustration, no "kids", "children" or "family" wording, no school setting. The social-media
  rule "Never targeted at children" (vault `Growth/Social Launch Kit 2026-09.md` § 4) applies to the
  store art too.

## Families policy: not applicable

"Any apps that include children in their target audience must comply with Google Play's Families
Policy Requirements" (answer/9867159). No age group under 13 is ticked, so the app does not include
children in its target audience and the Families policy, the Families Self-Certified Ads SDK program
and Teacher Approved do not apply. Reasons it would not fit anyway:

- the app is not designed for children (Terms § 2, privacy notice § 10);
- it has open text chat with strangers in public lobbies, moderated by reports and blocks rather than
  pre-moderation (`content-rating.md`), which the Families policy does not allow for children without
  further safeguards;
- the AdSense script loads on every production page (`data-safety.md`, Sharing) and is not a
  Families self-certified ad SDK.

## Related App content declarations

| Declaration | Answer | Why |
|---|---|---|
| Advertising ID | **No**, the app does not use it | The manifest declares only `POST_NOTIFICATIONS` and no `com.google.android.gms.permission.AD_ID`; the only dependency is `androidbrowserhelper` (`android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`). The web code reads no device advertising id (`privacyPolicy.storage.noTrackers`). |
| News app | No | It is a game. |
| Government app | No | – |
| Financial features | No financial features | – |
| Health | No health features | – |
