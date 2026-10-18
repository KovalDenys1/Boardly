# Data safety form – answers for online.boardly.app (#1468)

Checked against the code on `develop` at a3bcab7b (2026-10-18). Every answer names the file it rests
on. Play Console path: **Policy → App content → Data safety**.

## Scope: the app is the website, so the website's collection counts

The app is a Trusted Web Activity of `https://boardly.online` (`android/twa-manifest.json`,
`docs/ANDROID.md`): it has no code of its own beyond `androidbrowserhelper`, so everything below is
what the site collects while it runs inside the app. Play counts that:

> "It also includes user data collected from a webview which has been opened from your app"
> – Data safety help, answer/10787469

and SDK code is ours to declare:

> "You must reflect data collection or sharing carried out by such third-party code in the Data
> safety form for your app." – answer/10787469

Play's "collect" means "transmitting data from your app off a user's device"; "sharing" means
"transferring user data collected from your app to a third party", and these transfers are **not**
sharing (answer/10787469):

> "Transferring user data to a "service provider" that processes it on behalf of the developer."
> "Transferring user data for specific legal purposes, such as in response to a legal obligation or
> government requests."
> "based on a specific user-initiated action, where the user reasonably expects the data to be shared"

The site's processors – Supabase, Vercel, Upstash, Resend, Sentry, Stripe, and our own Discord
channels – are service providers (`app/privacy/PrivacyNotice.tsx` recipients, `locales/en.ts`
`privacyPolicy.recipients.lead`: "The providers below process it for us, except where we say they
act on their own account"). Signing in with Google, GitHub or Discord and linking Discord roles are
user-initiated. The one transfer left is Google's AdSense script, which the notice says Google
processes "on its own account" – see Sharing below.

## Page 1: data collection and security

| Question | Answer | Source |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | the table below |
| Is all of the user data collected by your app encrypted in transit? | **Yes** | `curl -sI http://boardly.online` answers `308` to `https://`; `https://boardly.online` sends `strict-transport-security: max-age=63072000; includeSubDomains` (both checked 2026-10-18). Realtime is Supabase over WSS, push payloads are Web Push encrypted (`lib/push-send.ts`). Privacy notice § 9: "all traffic uses HTTPS". |
| Which methods of account creation does your app support? | **Username and password** (email address + password) and **OAuth** (Google, GitHub, Discord). Playing needs no account: guests play with a name only. | `app/api/auth/register/route.ts`, `lib/next-auth.ts`, `app/api/auth/guest-session/route.ts` |
| Delete account URL | `https://boardly.online/privacy` (section 7, "Your rights": delete from the profile page, or write to support@boardly.online) | `locales/en.ts` `privacyPolicy.rights.delete`, `.email` |
| Do you provide a way for users to request that some or all of their data is deleted, without requiring them to delete their account? | **Yes**, `https://boardly.online/privacy` – guests delete everything with "Forget me"; account holders edit or clear profile fields themselves and ask support@boardly.online for anything else; chat deletes itself after 24 h | `app/api/user/forget-guest/route.ts`, `components/Header/ForgetGuestButton.tsx`, `lib/retention-periods.ts` `CHAT_RETENTION_HOURS` |
| Independent security review | No | – |

**In-app deletion path** (Play's account deletion policy, answer/13327111, requires "an in-app path to
delete their app accounts and associated data" and "a web link resource"): Profile → **Profile**
tab → **Danger Zone** → **Delete Account** → **Send Deletion Email** → the link in the email opens
`/auth/delete-account?token=…` → type `DELETE` (`app/profile/page.tsx` around the
`profile.dangerZone` block, `app/api/user/request-deletion/route.ts`,
`app/auth/delete-account/page.tsx`). It is not wrapped in `PurchaseOnly`, so Play mode shows it.
Guests: header guest menu → **Forget me** (`components/Header/ForgetGuestButton.tsx`).

What deletion keeps, which the policy allows if the privacy policy says so ("security, fraud
prevention or regulatory compliance", answer/13327111): reports about content keep their copy for
12 months; game results stay pseudonymised under a player id (`locales/en.ts`
`privacyPolicy.rights.delete`, `privacyPolicy.purposes.games.retention`).

## Page 2: data types

"Required" means users cannot turn the collection off; Play says "If your app's primary
functionality requires the data type, you should declare that data as 'required'" and "optional"
covers "the ability to opt into or opt out of data collection" (answer/10787469). Nothing below is
processed only ephemerally.

| Category | Data type | Collected | Shared | Required / optional | Purposes |
|---|---|---|---|---|---|
| Location | Approximate location | Yes | **Yes** (Google) | Required | Analytics; Advertising or marketing; Fraud prevention, security, and compliance |
| Personal info | Name | Yes | No | Required | App functionality; Account management |
| Personal info | Email address | Yes | No | Optional | App functionality; Account management; Developer communications; Fraud prevention, security, and compliance |
| Personal info | User IDs | Yes | No | Required | App functionality; Account management; Fraud prevention, security, and compliance |
| Personal info | Other info | Yes | No | Optional | Account management; Fraud prevention, security, and compliance |
| Financial info | Purchase history | Yes | No | Optional | Account management |
| Messages | Other in-app messages | Yes | No | Optional | App functionality; Fraud prevention, security, and compliance |
| Photos and videos | Photos | Yes | No | Optional | App functionality |
| App activity | App interactions | Yes | No | Required | Analytics |
| App activity | Other user-generated content | Yes | No | Optional | App functionality; Fraud prevention, security, and compliance |
| App activity | Other actions | Yes | No | Required | App functionality; Analytics |
| App info and performance | Crash logs | Yes | No | Required | Analytics |
| App info and performance | Diagnostics | Yes | No | Required | Analytics |
| App info and performance | Other app performance data | Yes | No | Required | Fraud prevention, security, and compliance |
| Device or other IDs | Device or other IDs | Yes | **Yes** (Google) | Required | App functionality; Advertising or marketing; Fraud prevention, security, and compliance |

## Evidence per data type

**Approximate location.** Play: "Approximate location that is inferred, such as via IP address or
Access Point Name, must be disclosed here" (answer/10787469). Vercel Web Analytics records "country
and region" (`locales/en.ts` `privacyPolicy.purposes.analytics.data`; `components/DeferredTelemetry.tsx`
mounts `<Analytics />` and `<SpeedInsights />`). Google's consent message decides from the visitor's
IP whether they are in the EEA or the UK, which is the sharing row (see Sharing). Rate-limit counters
keyed by IP (`lib/rate-limit.ts`) and the 1-day request logs use the IP but derive no location, so
they add nothing here.

**Name.** Every player has a display name: a guest name typed before the first game, or the
account's username; sign-in providers also send the name on the provider account
(`privacyPolicy.purposes.guest.data`, `.account.data`, `.signIn.data`). Required: there is no way to
play without one. It is shown to other players, which is the expected, user-initiated case, not
sharing.

**Email address.** Only for an account (`privacyPolicy.purposes.account.data`); guests have none
(`privacyPolicy.rights.required`: "you can play as a guest without either"). Optional, because an
account is optional. Used for sign-in and password reset, verification, security notices, friend
game invites and chosen notifications, notices of Terms changes (`privacyPolicy.purposes.email.data`)
and the sending limits that stop floods of mail (security). Resend delivers the mail as a service
provider. Marketing email is consent-only and "We do not send such emails yet"
(`privacyPolicy.purposes.marketing.data`), so Advertising or marketing is not ticked; tick it the day
the first newsletter goes out.

**User IDs.** The account id or the random guest id (both `Users.id`, `prisma/schema.prisma`),
the friend code and public profile id, the provider account ids from Google, GitHub or Discord
(`privacyPolicy.purposes.signIn.data`), and the Stripe customer id for anyone who bought on the web.
Required: a guest id is minted for every player (`app/api/auth/guest-session/route.ts`).

**Other info.** Accounts store when the person confirmed being 13 or older and accepted the Terms
(`lib/age-confirmation.ts`, `Users.ageConfirmedAt`, `Users.termsAcceptedAt`;
`privacyPolicy.purposes.account.data`). It is an age attestation, not a date of birth, but Play's
"Other info" is "any other personal information such as date of birth…", so it is declared rather
than argued away. Optional, because accounts are.

**Purchase history.** The app sells nothing (#1465: `components/PurchaseOnly.tsx` removes every
checkout and billing-portal entry in Play mode). It still declares this: an account that bought Premium on the web sees its status
and renewal in the profile's Premium tab and can cancel it there, and that cancel request changes the
purchase record from inside the app (`app/profile/page.tsx`, `handleCancelSubscription`). The account
keeps "your Stripe customer and subscription ids, your Premium status and dates"
(`privacyPolicy.purposes.premium.data`). Optional; Account management. **User payment info is not
collected**: card details go to Link/Stripe on the web, never through the app ("We never receive your
full card number").

**Other in-app messages.** Lobby chat (`app/api/lobby/[code]/chat/route.ts`, kept in Redis for 24 h,
`CHAT_RETENTION_HOURS`), plus the copy a report keeps for 12 months
(`privacyPolicy.purposes.reports`). Not end-to-end encrypted, so it does not fall under Play's
encryption exemption. Optional: no game requires chatting. Security purpose: reports and moderation
(`lib/content-reports.ts`).

**Photos.** A profile picture uploaded from the device (`components/AvatarPicker.tsx`; Premium-only,
so in the app only an account that bought Premium on the web can upload). Optional.

**App interactions.** Vercel Web Analytics page views and custom events: lobby created or joined,
game started and finished, game type, number of players, duration, and at the end of a Yatzy game
each seat's score (`lib/analytics.ts`, `privacyPolicy.purposes.analytics.data`); the sign-up source
(`lib/signup-source-client.ts`, `PLAY_APP_SIGNUP_SOURCE` in `lib/app-shell.ts`); first-party
reliability events (`OperationalEvents` in `prisma/schema.prisma`). Vercel tells visits apart "with a
hash made from the request instead of a cookie and discards it after 24 hours", which is pseudonymous,
and Play says "User data collected pseudonymously must be disclosed" (answer/10787469). There is no
opt-out, so Required.

**Other user-generated content.** Bios, Sketch & Guess drawings, Liar's Party claims, Explain the
Word guesses, feedback text and the note on a report (`privacyPolicy.purposes.account.data`,
`.games.data`, `.feedback.data`, `.reports.data`). Optional.

**Other actions.** Play: "Any other user activity or actions in-app not listed here such as
gameplay". Moves, scores, results, replays, friends, blocks, invites and achievements
(`privacyPolicy.purposes.games.data`). Required: playing is the app.

**Crash logs.** Sentry error reports: "the error, the page, browser and operating system"
(`privacyPolicy.purposes.security.data`; `instrumentation-client.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts`, `sendDefaultPii: false` in production, Session Replay off since #1151).

**Diagnostics.** Speed Insights load times (`privacyPolicy.purposes.analytics.data`) and Sentry
performance traces at a 10 % sample (`tracesSampleRate: 0.1` in `instrumentation-client.ts`).

**Other app performance data.** Content Security Policy violation reports the browser sends
(`proxy.ts` `report-uri`, `lib/csp-report.ts`; `privacyPolicy.purposes.security.data`), stored
without a link to an account.

**Device or other IDs.** Play: "Identifiers that relate to an individual device, browser or app".
The Web Push endpoint, keys and browser type when notifications are on (`PushSubscriptions` in
`prisma/schema.prisma`, `privacyPolicy.purposes.push.data`); the guest identity token stored on the
device (`privacyPolicy.storage.guest`); the browser signals Vercel BotID checks when a guest or an
account is created (`instrumentation-client.ts`, `lib/botid-routes.ts`); and Google's cookies in the
requests its AdSense script makes (Sharing). Required, because the guest token is.

## Sharing: only Google's AdSense script

`app/layout.tsx` loads `pagead2.googlesyndication.com/pagead/js/adsbygoogle.js` on every production
page, so also inside the app (`adSenseLoaderEnabled = isProductionDeployment()`, not gated on Play
mode). No ad unit renders (`components/AdSlot.tsx`: `NEXT_PUBLIC_ADS_ENABLED` is unset), but the
script calls Google, shows Google's EEA/UK consent message and writes the `FCCDCF` cookie, and the
privacy notice says Google does this "as an independent controller under its own privacy policy"
(`privacyPolicy.ads.current`, `privacyPolicy.recipients.google.purpose`: "on its own account").
An independent controller is not a service provider, so the transfer is sharing: Approximate location
(from the IP) and Device or other IDs (Google's cookies), for Advertising or marketing and for
Fraud prevention, security, and compliance (the consent record).

If the AdSense script stops loading in Play mode (see the report's follow-ups), both "Shared" cells
become **No** and the Advertising or marketing purpose drops from both rows; update the form in the
same release.

Not sharing, and why:

- **Google, GitHub, Discord sign-in** and **Discord Linked Roles**: started by the user, who expects
  the provider to learn about it (`privacyPolicy.purposes.signIn`, `privacyPolicy.discord.linkedRoles`).
- **Discord public lobby feed**: carries "the game, the number of free seats and the lobby link –
  never the host's name" (`privacyPolicy.discord.feed`): no user data.
- **Push services** (Google's FCM for Chrome on Android): the payload is Web Push encrypted and the
  service is the browser maker's, "Chosen by your browser's maker … not by us"
  (`privacyPolicy.recipients.pushService.where`).
- **Other players** seeing names, chat and drawings: that is the service the user uses, not a
  transfer to a third party.
- **Link / Stripe as merchant of record**: only for purchases on the web; the app sells nothing.

## Not collected

Precise location, address, phone number, race or ethnicity, political or religious beliefs, sexual
orientation, user payment info, credit score, other financial info, health and fitness, emails, SMS,
videos, audio, music, files and documents, calendar, contacts, in-app search history, installed
apps, web browsing history. On web browsing: inside the app the referrer is the app itself
(`android-app://online.boardly.app`, `docs/ANDROID.md` Play mode), and analytics records pages of
boardly.online only, which is App interactions.

## Update this form when

- ads are switched on (`NEXT_PUBLIC_ADS_ENABLED=true`) while `AdSlot` still renders in Play mode:
  the store's **Contains ads** declaration changes too (`store-settings.md`);
- the first marketing email goes out: add Advertising or marketing to Email address;
- the AdSense script is gated out of Play mode: drop the two Shared answers;
- a new processor, SDK or data type appears in the privacy notice: `docs/PRIVACY-RETENTION.md` and
  `app/privacy/PrivacyNotice.tsx` are where that change lands first.
