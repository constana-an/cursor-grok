# Couple Order Shop

**A little shop for two people who live in different cities.**

Long distance breaks the small stuff first. You can still call, but you cannot bring
someone a cup of tea, and "what do you want?" over text is a question nobody answers
honestly. What is missing is not communication — it is a way to *ask for something
small* without it turning into a whole conversation.

So this is a shop with exactly two customers. One of you puts a wish on the menu and
prices it. The other one sees the order arrive on their phone, accepts it, and marks it
done. Ten minutes on a call where nobody looks at their phone costs 78 coins. A gentle
wake-up call costs 56. Being talked to sleep costs 68. You pay for it with the coins you
earned this week by actually showing up.

It is an installable PWA for two phones. With no cloud configuration it runs in
local-only mode; pointed at a free Supabase project it pairs by couple code, syncs orders
in realtime and sends Web Push.

## What makes it work across distance

- **Both phones agree on what day it is.** Task and check-in periods are keyed to one
  timezone (`Asia/Shanghai`) and the front end and the database share the same period key,
  so a couple split across time zones never argues with the app about whether they checked
  in today. The date unit tests run twice — once in US Eastern, once in Beijing.
- **You can see their week without seeing their wallet.** The Tasks screen shows your
  partner's check-in streak, the task coins they earned this week and whether they came by
  today. It goes through a read-only function that **does not and must not carry a balance**.
  When you cannot see someone, knowing they came by today is most of the reassurance.
- **Orders arrive as a push**, not as a message you have to remember to check.
- **Each phone picks its own language.** English or 中文, stored per device, so a
  cross-border couple can each read their own — while the words you wrote yourself are
  never translated for the other person.
- **Care and date wishes are written for distance too.** A gentle wake-up, an hour of real
  listening, one phone-free hour, being talked to sleep — none of these need you to be in
  the same room. The ones that do are priced like the occasions they are.

## How the coins work

Both of you start at 8 coins, and pairing pays each of you 20 more, so you can order
something on day one. After that, coins come from 8 daily tasks and a check-in: say good
morning or goodnight properly (+1), pay one real compliment (+2), share how today felt (+2).
At most 8 a day and 29 more per week — 85 in a perfect week, 30–50 for normal participation.

Against that, a fruit tea is 28, a ten-minute hug is 48, a movie night is 88, a weekend
together is 188, and a whole day cleared for each other is 360. **Price is priority**: the
small things are affordable today, and the big ones take weeks of showing up. Each of you
has your own wallet, and your partner cannot spend yours.

Three of the eight tasks are verified server-side — the photo, the finished order and the
real date all have to have actually happened. The other five have nothing in the data to
prove them, so they run on the honour system, and the app says so rather than pretending
to check.

## Who built it

| | |
| --- | --- |
| Product, design decisions and direction | [@constana-an](https://github.com/constana-an) |
| The code | written with **Cursor** |
| The 34 menu illustrations in `public/assets/menu/` | generated with **Grok**, prompted and selected by hand |

Everything else off the shelf is listed in [HACKATHON.md](HACKATHON.md) — the starter
template, the libraries and the platform — along with what was built on top of it.

## Running locally

```bash
npm install
npm run dev
```

## Free two-person sync

1. Create a free Supabase project. Anonymous sign-ins are **not** required: creating and
   joining a shop both demand a real account, which is what lets you recover the data on a
   new phone.
2. Apply the database migrations (see **Database migrations** below):

   ```bash
   npx supabase link --project-ref <your project ref>
   npx supabase db push
   ```
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key.
4. Generate a VAPID key pair and put the public key in `VITE_WEB_PUSH_PUBLIC_KEY`.
5. Deploy `supabase/functions/notify-partner` as an Edge Function with `VAPID_PUBLIC_KEY`
   and `VAPID_PRIVATE_KEY` set.
6. Rebuild, deploy to an HTTPS address, open it in Safari on both iPhones, choose "Add to
   Home Screen", then turn notifications on from the **Us** screen.

### Database migrations

`supabase/migrations/` is the single source of truth for the database, and the filenames are
the execution order. **Every migration must be safe to run more than once** — `npm run
check:migrations` verifies this statically on every `npm test`: a policy must `drop policy if
exists` first, a table must be `if not exists`, an added column needs a guard, and
`create function` must be `or replace` or preceded by a drop. The point of the rule: any
statement that only works against an empty database will blow up halfway through the first
re-run and leave the schema half-changed.

| Situation | What to do |
| --- | --- |
| New project | `npx supabase link --project-ref <ref>` then `npx supabase db push` |
| Existing project, previously applied by hand | `npx supabase migration repair --status applied <each applied version>` first, then `db push` for the rest |
| Not using the CLI | Paste `supabase/migrations/*.sql` into the SQL Editor in filename order; they are all re-runnable, so pasting one twice breaks nothing |
| Adding a migration | `npx supabase migration new <name>`, then run `npm run check:migrations` |

What each one does, and what you see if it has **not** been applied:

| Migration | Purpose | Symptom when missing |
| --- | --- | --- |
| `20260910000000_initial_schema.sql` | Tables, RLS, pairing and ordering basics | Nothing works |
| `20260910013000_place_couple_order.sql`<br>`20260910030000_couple_profile.sql` | Ordering and profile RPCs | Ordering and profile edits fail |
| `20260910060000_commercial_foundation.sql` | Accounts, memories, anniversaries, audit, rate limits | Large parts of the app missing after login |
| `20260910120000_timezone_refund_and_retention.sql` | Unified timezone, decline refunds, closed direct writes to orders | Period keys disagree between client and server; orders can be written around the RPCs |
| `20260910150000_personal_wallets.sql` | One wallet per person | Both partners share a balance |
| `20260910210000_manage_memories_and_anniversaries.sql` | Either partner manages anniversaries; memories become editable (including the missing `update` grant) | Partner's "Manage" fails silently; editing text returns permission denied |
| `20260911010000_verified_tasks.sql` | `completed_at`; three tasks verified server-side | Photo, order and date tasks can be claimed without doing them |
| `20260911030000_custom_wishes.sql` | Custom wish table; category written onto the order row | Ordering a custom wish reports "this wish has been retired" |
| `20260911060000_push_hygiene.sql` | Grants on `push_subscriptions` | Signing out cannot delete the subscription, and the phone keeps receiving that couple's pushes |
| `20260911080000_cancel_order.sql` | Withdrawing an order, decline reasons; `update_order_status` becomes three-argument (**the old two-argument version is dropped**, or the call is ambiguous) | The withdraw button errors |
| `20260911100000_pairing_bonus.sql` | 20 coins each on pairing (8 + 20 = 28, enough to order on day one) | A new couple has to save for three or four days before the first order |
| `20260911120000_partner_presence.sql` | `get_partner_status()` read-only window (no balance), custom wish cap of 30, adds `custom_menu_items` / `task_claims` / `daily_checkins` to the realtime publication | Partner status invisible; no cap on custom wishes; **a wish your partner just wrote needs a refresh to appear** (the subscription never took effect) |
| `20260912000000_read_grants.sql` | **Adds the select grants `profiles` / `orders` / `couples` / `task_claims` never had**; grants service_role explicitly | **The whole app is shut**: every screen after login returns permission denied, including your own balance |

> The orders table was sealed back in `20260910120000`: the policy allowing direct writes to
> `orders` was dropped and `insert/update/delete` were revoked from `anon` and `authenticated`.
> Placing an order and moving it through its states can only happen inside the two SECURITY
> DEFINER functions `place_couple_order` and `update_order_status`.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | for cloud sync | Leave empty for local-only mode; the Supabase client is never loaded. |
| `VITE_WEB_PUSH_PUBLIC_KEY` | for push | VAPID public key. Without it notifications can still be enabled, but no background push subscription is registered. |
| `VITE_AUTH_PHONE_ENABLED` | no, defaults to `0` | Set to `1` to show phone sign-in; configure an SMS provider in Supabase first. |
| `VITE_AUTH_APPLE_ENABLED` | no, defaults to `0` | Set to `1` to show Apple sign-in; configure Apple Developer credentials first. |
| `VITE_MEMBERSHIP_ENABLED` | no, defaults to `0` | Set to `1` to show membership benefits; keep it off until payments are wired up. |

All three switches also require cloud configuration. An unconfigured sign-in method or the
membership entry point is hidden as a whole, rather than shown and then failing.

### Releasing

After changing the app shell (HTML, icons, anything in `public/`), bump the `CACHE` version in
`public/sw.js`. `activate` deletes every other version's cache, and that is the only way a
device with the app on its home screen gets the new build.

The first phone taps "Create a couple shop" for a six-digit code; the second phone enters it to join.

### Operations

- `public.prune_operational_data()` clears rate limits, audit rows and error logs. Projects with
  `pg_cron` run it daily at 04:17; free projects have no `pg_cron`, so run it by hand
  occasionally or call it from an external scheduler.
- The rate-limit table also sweeps the current user's windows older than a day on every call, so
  it cannot grow without bound even with no scheduler.

## The sweet-heart coin economy

- **Everyone has their own wallet.** Coins belong to a person and your partner cannot spend
  yours. In the cloud they live in `profiles.coin_balance`; locally in `couple-shop-coins:<side>`.
- Both sides start at 8. Task and check-in rewards go only into the **claimer's own** wallet;
  the two of you claim separately and never affect each other.
- At most 8 coins a day and 29 more per week, per person — 85 for a perfect week, and normal
  (non-perfect) participation usually lands at 30–50.
- Food costs 28–78, care 48–118, dates 60–188, limited coupons 120–360.
- A limited coupon can be used **once per couple, ever** (whoever orders it), and stays greyed
  out in the shop afterwards.
- **Custom wishes**: all three non-limited categories accept your own, priced 8–400, and either
  partner can edit or retire one. The price is read server-side from `custom_menu_items`;
  whatever the client claims does not count. Limited coupons stay a fixed list — a "once in a
  lifetime" you issued yourself is one nobody can keep for you. Retiring a wish does not touch
  orders already placed: the order row carries its own name, price and category.
- An order is paid from **the sender's own** wallet; a decline refunds the sender in full and
  leaves the recipient's balance untouched. Only the recipient can accept, decline or advance it.
- You only ever see your own balance; the RLS policy on `profiles` admits `user_id = auth.uid()`
  and nothing else.
- The Tasks screen shows **your partner's week**: check-in streak, task coins earned this week,
  whether they came by today. It goes through the read-only `get_partner_status()`, which
  **does not and must not carry a balance**. Local mode reads the other side's storage directly
  and behaves the same.
- Memories has **milestones**: 100/365/520/1,000 days together, 1/10/50/100 wishes finished,
  7/30/100-day check-in streaks. Each is celebrated once, and tracked per person.
- A couple may keep at most 30 wishes of their own.
- The Memories timeline is **never truncated**: it groups by month and loads more with "N more,
  keep looking back", so early wishes are not quietly dropped.
- The milestone card expands to show every milestone reached, not just the latest one.
- Task and check-in periods are keyed to `Asia/Shanghai` (see `src/lib/date.ts` and
  `public.app_today()`); front end and database use the same period key.
- **Three tasks have to actually be done before they can be claimed.** "Take one photo together
  this week" needs a photo you uploaded this week; "finish one order properly" needs a wish of
  your partner's that you completed this week; "go on one real date" additionally requires that
  wish to be in the Dates category. The judgement is made on `orders.completed_at`, stamped by
  `update_order_status`. The other five (good morning/goodnight, compliments, sharing a mood,
  undivided attention, a walk together) have nothing in the data to prove them and stay on the
  honour system.
- The check exists both in the client (the button reads "Not yet" and says what is missing) and
  in `claim_couple_task`, which is the side that actually pays. Local-only mode has no album, so
  the photo task is not verified there.

## Layout

- `src/Prototype.tsx` — orchestration: state, cloud sync, every bottom sheet.
- `src/screens/` — the five main screens plus `MenuArt`.
- `src/lib/` — pure logic: dates and period keys, the menu and task catalogue, local storage,
  error copy, the bilingual dictionary (`i18n.ts`), the lazily loaded Supabase client.
- `src/i18n.tsx` — the React context for the language. `src/lib/` stays framework-free, and the
  screens cannot import a provider from their own parent without making the module graph
  circular, so the provider lives here on its own.
- `src/shell/` — **the real-device shell**: fills the viewport, real keyboard
  (`visualViewport`), real safe areas (`env()`), native scrolling. This is what the app actually runs.
- `src/mobile/` — the simulated iPhone frame, for design preview only, lazily loaded behind
  `?preview=1`. **Its keyboard and safe areas are approximations**; any conclusion about either
  has to be confirmed on real hardware.
- `docs/design/` — design comparison screenshots and visual review notes.

## Verifying

```bash
npm test
```

`npm test` runs, in order: the runtime integrity check, the migration replay check, the date and
copy unit tests (once in US Eastern and once in Beijing), the RLS policy and grant check, the
Sites worker tests and the Playwright interaction tests.

`tests/i18n.test.mjs` proves the two languages have exactly the same key set, that the English
never drops a `{variable}` the Chinese uses, and that every shipped catalogue entry carries
English. `tests/language.spec.ts` covers the switch itself, the English-by-default first launch,
and the boundary that matters most: **words the couple wrote themselves are never translated.**
Every other spec seeds `couple-shop-lang` to `zh` and drives the Chinese UI, so the Chinese
copy stays covered too.

`tests/accessibility.spec.ts` measures **contrast (4.5:1 for body text, 3:1 for large text)** and
**44×44 touch targets** on all five screens. If it fails after a colour or button-size change,
the colour is the problem, not the test.

Each step can also be run on its own:

```bash
npm run check:runtime
npm run check:migrations
npm run test:logic
npm run test:sql
npm run build
npm run test:sites
npm run test:runtime
```

There is also a **credentials-only suite that is not part of `npm test`**, covering two-account
pairing, RLS isolation, the order state machine and refunds, task verification, joint management
of anniversaries, push subscription isolation and Edge Function reachability:

```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:cloud
```

It creates three throwaway accounts with the service role (two partners and an outsider),
deletes them afterwards, and tops up the wallets first — a new account holds only 8 coins while
the cheapest wish costs 28. **Point it at a test project only**: it really does write orders,
memories and anniversaries. With any variable missing the whole group skips and says so.

`npm run test:sql` never connects to a database. It replays every migration in
`supabase/migrations/` in filename order and computes the resulting policies and grants, proving
that the write path has not been quietly reopened and that no policy was added without its table
grant — Postgres checks table privileges before RLS, so a miss is an immediate permission denied.
