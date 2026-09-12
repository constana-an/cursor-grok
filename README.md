# Couple Order Shop

**A realtime two-player shop where long-distance couples turn small requests into orders paid for with everyday attention.**


## HackCMU 2026

**Primary Track:** Multiplayer  
**Secondary Fit:** Traveling  
**Team:** One person  
**Built with:** Cursor, Grok, React, TypeScript, and Supabase

## The 30-second version

Long-distance couples can still call and text, but small requests are often difficult to say directly:

- “Watch a movie with me tonight.”
- “Call me before I fall asleep.”
- “Can we spend an hour without looking at our phones?”

Couple Order Shop gives two people a shared shop for those requests.

Each person earns sweet-heart coins by completing everyday relationship tasks. They spend their own coins to order a wish from their partner. The recipient can accept, decline, and complete the order, while both phones stay synchronized in realtime.

The result is a lightweight ritual for asking clearly, responding deliberately, and remembering what the couple did for each other.

## Why Multiplayer

This product only works when two people participate.

- Two phones pair through a six-digit couple code.
- Each person has a private wallet that their partner cannot spend.
- Orders appear on the recipient’s phone in realtime.
- Only the recipient can accept, decline, or complete an order.
- A declined order refunds the sender without changing the recipient’s balance.
- Both partners share wishes, orders, activity, memories, and milestones.
- Each phone can use a different language without translating the couple’s own words.

The multiplayer state is not an optional feature added to a single-player app. It is the product.

## Why Traveling also fits

Couple Order Shop is designed for two people living in different cities or time zones.

The menu includes requests that can be completed from a distance, such as a wake-up call, a focused conversation, or watching a movie together. Task and check-in periods use the same shop timezone in the frontend and database, so both partners agree on what “today” means.

## Core experience

### 1. Pair two phones

One person creates a shop and receives a six-digit code. Their partner enters the code to join.

Each person receives a small opening balance so the couple can place their first order immediately.

### 2. Earn coins by showing up

Coins come from daily and weekly relationship tasks:

- Send a proper good morning or goodnight.
- Give a real compliment.
- Share how the day felt.
- Spend focused time together.
- Complete a wish for your partner.

Some tasks can be verified from application data. Tasks that cannot be verified run on the honour system, and the interface says so clearly.

### 3. Order a wish

The shop contains 40 wishes across four categories:

| Category | Examples | Price range |
| --- | --- | ---: |
| Food | Fruit tea, hot pot, breakfast | 28–78 |
| Care | A wake-up call, listening, phone-free time | 48–118 |
| Dates | A walk, movie night, weekend away | 60–188 |
| Limited | A whole day together, one special request | 120–360 |

Partners can also write, price, edit, and retire their own wishes. Custom wishes cost between 8 and 400 coins, with a maximum of 30 active custom wishes per couple.

Limited wishes can be used only once per couple.

### 4. Respond on the other phone

The recipient can accept, decline, or complete the order.

The sender cannot accept their own request or move it through the recipient’s workflow. If the recipient declines, the sender receives a full refund.

### 5. Keep the memory

Completed wishes become part of a shared timeline.

The app also recognizes milestones for:

- Days together.
- Wishes completed.
- Check-in streaks.

The timeline loads older entries instead of silently truncating the couple’s history.

## Two-minute demo

| Time | Action | What it demonstrates |
| --- | --- | --- |
| 0:00 | Open the app on two phones | The product has two participants |
| 0:15 | Create a shop on phone A | Six-digit pairing |
| 0:30 | Join from phone B | Shared shop and opening coins |
| 0:45 | Place an order on phone A | Sender-owned wallet |
| 1:00 | Show the order arriving on phone B | Realtime synchronization |
| 1:15 | Decline it on phone B | Recipient-only action and automatic refund |
| 1:30 | Add a custom wish | Shared user-created content |
| 1:40 | Switch phone B to Chinese | Per-device language |
| 1:50 | Open Memories | Completed wishes and long-term milestones |

## Technical highlights

### Server-authoritative economy

The client does not decide what an order costs.

For a built-in wish, the server validates the catalogue price. For a custom wish, the server reads the price from `custom_menu_items`. A modified client cannot submit a cheaper price or write directly to a wallet.

Order placement and status changes run through PostgreSQL functions so the balance update and order update happen together.

### Separate wallets

Each partner owns a different wallet.

Task rewards go only to the person who completed the task. Orders use the sender’s balance. Declines refund the sender. The recipient’s wallet never moves as a side effect of someone else’s order.

Supabase Row Level Security prevents one partner from reading or editing the other partner’s balance.

### Recipient-owned order state

Clients cannot insert, update, or delete order rows directly.

The application uses audited database functions for order creation and status transitions. These functions confirm that the caller belongs to the couple and that only the recipient can advance the order.

### Realtime synchronization

With Supabase configured, both phones synchronize:

- Orders and their status.
- Custom wishes.
- Task activity.
- Check-ins.
- Partner presence.
- Memories and anniversaries.

Web Push can notify the recipient when a new order arrives.

### Consistent dates across time zones

Daily tasks and weekly limits use `Asia/Shanghai` shop time.

The frontend and database calculate the same day and week keys. Date tests run in both US Eastern and Beijing time zones to catch UTC boundary errors.

### Per-device language

English and Chinese are stored independently on each phone.

Interface text changes with the selected language. Names, notes, decline reasons, and wishes written by the couple remain exactly as written.

### Local-first fallback

The app runs without cloud credentials in local-only mode. This makes the complete interaction available for development and judging without requiring a Supabase project.

Cloud mode adds real accounts, two-device synchronization, database-enforced permissions, and push notifications.

## Architecture

| Area | Responsibility |
| --- | --- |
| `src/Prototype.tsx` | Application state, synchronization, and interaction orchestration |
| `src/screens/` | Shop, Tasks, Orders, Memories, and Us screens |
| `src/lib/` | Catalogue, dates, storage, errors, Supabase integration, and translations |
| `src/shell/` | Real mobile viewport, keyboard handling, safe areas, and native scrolling |
| `src/mobile/` | Starter-template device simulation used only by the optional design preview |
| `supabase/migrations/` | Schema, Row Level Security, grants, and application functions |
| `supabase/functions/` | Partner notification Edge Function |
| `tests/` | Logic, permissions, accessibility, layout, interaction, and integration tests |

## Hackathon baseline and attribution

Couple Order Shop was built during the HackCMU hacking period in under 20 hours.

The submission uses existing libraries, a starter template, and AI tools. They are disclosed here so the starting point is clear.

| Existing resource | Source | How it was used |
| --- | --- | --- |
| React, Vite, and TypeScript | npm | Application framework and build system |
| Supabase | Hosted platform and SDK | Auth, PostgreSQL, Realtime, RLS, and Edge Functions |
| Radix UI, Motion, and `@use-gesture` | npm | Interface primitives and interaction support |
| Playwright | npm | Test runner; the project’s test cases were written for this app |
| Phone prototype template | Existing starter template | Approximately 2,760 lines in `src/mobile/` and related device assets |
| Menu illustrations | Grok | Generated from prompts and selected by hand |
| Application code | Cursor | Written from the author’s product specifications and reviewed during development |

### What the starter template provided

The starter template supplied a simulated phone frame, keyboard, safe areas, and scrolling environment for browser-based design previews.

That simulated device is not the runtime shipped to users.

The application uses the new `src/shell/` implementation for the real device viewport, native scrolling, `visualViewport` keyboard behavior, and CSS safe-area values. The original simulated runtime remains available only through `?preview=1`.

### What was created for this project

The following areas were created for Couple Order Shop:

- Product concept and interaction model.
- Five product screens.
- Wish catalogue and coin economy.
- Pairing and account flow.
- Separate wallet behavior.
- Order state machine and refunds.
- Custom wishes.
- Memories and milestones.
- English and Chinese interface.
- Supabase schema, policies, grants, and database functions.
- Realtime synchronization and Web Push integration.
- Local-only storage behavior.
- Project-specific automated tests.

See [HACKATHON.md](HACKATHON.md) for the detailed submission disclosure.

## Run locally

```bash
git clone https://github.com/constana-an/cursor-grok.git
cd cursor-grok
npm install
npm run dev
```

No environment variables are required for local-only mode.

Open the address printed by Vite and choose either side of the couple to walk through the interaction.

## Enable two-phone cloud mode

Create a Supabase project and apply the migrations:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Copy the example environment file:

```bash
cp .env.example .env.local
```

Configure the following values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_WEB_PUSH_PUBLIC_KEY=your-vapid-public-key
```

Deploy the notification function with its VAPID credentials:

```bash
npx supabase functions deploy notify-partner
```

Set these Edge Function secrets:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

Deploy the frontend to an HTTPS address. On iPhone, add the app to the Home Screen before enabling background Web Push.

## Optional features

These features stay hidden until their backend configuration exists:

```env
VITE_AUTH_PHONE_ENABLED=0
VITE_AUTH_APPLE_ENABLED=0
VITE_MEMBERSHIP_ENABLED=0
```

Do not enable them without configuring the corresponding Supabase provider or payment system.

## Verification

Run the complete local test suite:

```bash
npm test
```

It checks:

- Starter-runtime integrity.
- Migration replay safety.
- Date behavior in US Eastern and Beijing time zones.
- Wallet and task logic.
- Translation coverage.
- SQL policies and grants.
- Static hosting behavior.
- Mobile interactions.
- Accessibility contrast.
- Minimum 44 by 44 pixel touch targets.

Run individual groups with:

```bash
npm run check:runtime
npm run check:migrations
npm run test:logic
npm run test:sql
npm run test:sites
npm run test:runtime
npm run build
```

A separate cloud integration suite covers real two-account pairing, outsider isolation, refunds, task verification, shared anniversaries, push-subscription isolation, and Edge Function reachability:

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_ANON_KEY=your-anon-key \
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
npm run test:cloud
```

Use a test Supabase project. The cloud suite creates accounts and writes temporary application data.

## Current limitations

- Five of the eight relationship tasks cannot be independently verified and use the honour system.
- Local-only mode has no shared photo album, so the photo task cannot be verified there.
- Web Push requires HTTPS and installation to the iPhone Home Screen.
- Phone sign-in and Apple sign-in require external provider configuration.
- Membership and payments are not implemented and remain disabled.
- Supabase free-tier projects do not provide `pg_cron`, so operational cleanup requires a manual or external schedule.

## Privacy and safety boundaries

- Partners cannot read each other’s wallet balance.
- Clients cannot directly edit balances or order rows.
- The server validates custom-wish prices.
- Push subscriptions are isolated by account.
- User-written content is never translated automatically.
- Secrets belong in environment variables and must not be committed.

## License

[MIT](LICENSE)
