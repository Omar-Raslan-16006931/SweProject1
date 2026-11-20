# Travel Planning and Booking Platform — Team 1000

German International University · Faculty of Informatics and Computer Science
**Software Project I, Winter 2026**

A web-based travel platform that integrates flight booking, hotel booking, itinerary planning, budgeting
and travel-content sharing. This repository currently contains **Milestone 1: Backend & API**
(NestJS + MongoDB Atlas, documented and demonstrated through Swagger UI). The Next.js frontend is
Milestone 2.

| Milestone | Scope | Deadline |
|---|---|---|
| 1 | NestJS backend, MongoDB schemas, REST API, Swagger | 20/11 |
| 2 | Next.js frontend & integration | 11/12 |

---

## Team

| Name | Student ID | Tutorial | Email |
|---|---|---|---|
| Omar Raslan (**team leader**) | 16006931 | P26 | omar.raslan@student.giu-uni.de |
| Aly Hady | 10000486 | P2 | aly.elbastawisi@student.giu-uni.de |
| Ali Essam | 10000885 | P25 | Ali.abdulmajeed@student.giu-uni.de |
| Saeed Mahmoud | 10000885 | P3 | Saeed.saeed@student.giu-uni.de |
| Karim Ahmed | 16006373 | P15 | kareem.abdulkarim@student.giu-uni.de |
| Mohamed Sherif Ahmed | 16007159 | POO8 | Mohamed.sherifahmed@student.giu-uni.de |
| Yehia Atallah | 16009960 | P18 | yehia.atallah@student.giu-uni.de |

Work split for Milestone 1: [`docs/team/WORK_SPLIT.md`](docs/team/WORK_SPLIT.md).

---

## Technology stack (MVC — PDF 1.1)

| Layer | Technology |
|---|---|
| Model | MongoDB Atlas + Mongoose schemas (NestJS `@nestjs/mongoose`), business logic in services |
| Controller | NestJS controllers, `class-validator` DTOs, REST under `/api` |
| View | Next.js (Milestone 2) — for Milestone 1 the API is demonstrated through **Swagger UI** |
| Payments | Stripe **test mode** (PaymentIntents + webhook + Refunds API) |
| Exchange rates | FXRatesAPI, called **only** from the backend, cached daily in MongoDB |

## Repository structure

```
SweProject1/
├── backend/                  NestJS application
│   └── src/
│       ├── main.ts           bootstrap: /api prefix, cookies, CORS, validation, Swagger, /uploads
│       ├── app.module.ts     module wiring + global auth & role guards
│       ├── config/           environment configuration
│       ├── common/           enums, decorators, guards helpers, filters, pagination, date/time & refund utils
│       ├── database/         seed scripts + official reference datasets (CSV)
│       └── modules/          feature modules (see below)
├── docs/
│   ├── requirements/         official PDF + workbooks, TRACEABILITY.md (requirement -> endpoint)
│   ├── api/                  ENDPOINTS.md + openapi.json
│   ├── testing/              TEST_REPORT.md (every automated check and its result)
│   └── team/                 WORK_SPLIT.md
├── AI_PROMPTS.txt            mandatory AI prompt log (PDF 11.1)
├── .env.example              required environment variables (no secrets)
└── README.md
```

Feature modules (`backend/src/modules`):

| Module | Responsibility | Requirements |
|---|---|---|
| `auth` | register, login (lockout), logout, refresh, me, change password, httpOnly cookie sessions | ACC-01, 04–06, 08, 19 |
| `users` | profile view/edit, self-deactivation | ACC-09, 11, 12 |
| `admin` | moderators, accounts, suspend/reactivate, password reset, provider (de)activation, bookings, reports, content moderation, audit log | ACC-07a, 13–17, GEN-07, 10 |
| `reference` | countries, cities, airports, currencies, attractions (official datasets) | FLT-02, GEN-12 |
| `flights` | airlines, policies, flights, cabins, search | FLT-01–17, 30, GEN-06 |
| `flight-bookings` | summary, atomic seat holds, confirmation, cancellation, e-ticket, moderator views | FLT-19–29, GEN-11 |
| `hotels` | hotels, rooms, availability, blocks, room-status grid, search | HTL-01–15 |
| `hotel-bookings` | multi-room atomic holds, confirmation, cancellation, moderator reservations | HTL-16–22, GEN-11 |
| `reviews` | ratings & reviews, average rating | HTL-23, 24 |
| `payments` | policies acceptance, Stripe PaymentIntents, webhook, refunds | PAY-01–04 |
| `itineraries` | itineraries, days, activities, images, budgets, transport, public search, clone, hotel/flight search from itinerary | ITN-01–26 |
| `exchange-rates` | FXRatesAPI integration + daily DB cache | ITN-18 |
| `blog` | posts, tags, images, comments, likes, search, author pages | BLG-01–12 |
| `reports` | content reporting + moderation service | GEN-09, 10 |
| `notifications` | in-app notifications | GEN-01 |
| `audit` | admin audit log | GEN-07 |
| `uploads` | JPG/PNG validation (MIME + file signature), storage, URLs | GEN-08 |

---

## Setup

### Prerequisites
- Node.js **20+** (tested with Node 22) and npm
- Access to the team's **MongoDB Atlas** cluster (connection string from the team leader)
- A **Stripe** account in test mode (+ the [Stripe CLI](https://docs.stripe.com/stripe-cli) for local webhooks)

### 1. Install
```bash
cd backend
npm install
```

### 2. Configure environment
```bash
cp ../.env.example .env      # Windows PowerShell: Copy-Item ..\.env.example .env
```
Fill in `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`
and the Stripe keys. The backend reads `backend/.env` first and then a `.env` in the repository root.
**Never commit `.env`** (it is git-ignored).

### 3. Seed the database (GEN-12, ACC-18)
```bash
npm run seed         # official countries, cities, airports, attractions + supported currencies + admin
npm run seed:demo    # OPTIONAL demo airline/flights/hotels/accounts for trying the API
```
`npm run seed` is idempotent and uses the **official reference identifiers** (e.g. airport `CAI`,
city `cairo`, country `EG`) as document ids, so every evaluator dataset record resolves identically.

### 4. Run
```bash
npm run start:dev    # watch mode
# or
npm run build && npm run start:prod
```
- API: `http://localhost:3001/api`
- **Swagger UI: `http://localhost:3001/api/docs`**

### 5. Stripe webhooks (local)
```bash
stripe login
stripe listen --forward-to localhost:3001/api/payments/webhook
```
Copy the printed `whsec_...` value into `STRIPE_WEBHOOK_SECRET` and restart the backend.
Bookings are confirmed **only** after the backend receives `payment_intent.succeeded` (PAY-01).

---

## Using the API in Swagger UI

1. `POST /api/auth/login` with an account. The server sets **httpOnly** `access_token` / `refresh_token`
   cookies (ACC-19). Swagger UI sends them automatically with later requests — no token copying.
2. If you get `ACCESS_TOKEN_EXPIRED`, call `POST /api/auth/refresh`. A session ends after 30 minutes
   without authenticated requests (ACC-06).
3. Moderators created by the admin (and accounts reset by the admin) must first call
   `PATCH /api/auth/change-password` (ACC-13, ACC-07a).

**Flight booking walkthrough**
1. `GET /api/flights/search?from=CAI&to=DXB&date=YYYY-MM-DD&adults=1`
2. `POST /api/flight-bookings` → booking summary (FLT-19, FLT-21)
3. `POST /api/flight-bookings/hold` (same body) → Pending Payment, seats held for 10 minutes (FLT-22)
4. `GET /api/bookings/flight/{id}/policies` → `POST /api/bookings/flight/{id}/accept-policies` (PAY-02)
5. `POST /api/payments` `{ "bookingType": "flight", "bookingId": "..." }` → `clientSecret` for Stripe Elements
6. Swagger demo only: `POST /api/payments/{paymentId}/test-confirm` (uses Stripe's test card `pm_card_visa`)
7. The Stripe webhook confirms the booking → `GET /api/flight-bookings/{id}` shows `Confirmed` + reference;
   `GET /api/flight-bookings/{id}/e-ticket` downloads the PDF (FLT-23)

Hotel bookings follow the same steps with `POST /api/hotel-bookings` (holds immediately, HTL-16/18)
and `bookingType: "hotel"`.

**Demo accounts** (only after `npm run seed:demo`, password `DEMO_PASSWORD`, default `Demo12345`):
`demo.traveler@example.com`, `demo.traveler2@example.com`, `demo.airline@example.com`,
`demo.hotel@example.com`, `demo.hotel2@example.com`.

---

## Design notes

- **Authentication:** JWT access token in an httpOnly cookie + rotating refresh token (stored server-side
  only as a SHA-256 hash in a `sessions` document). The global guard checks the session on every request,
  enforcing logout revocation, the 30-minute inactivity window and account status. Passwords are bcrypt
  salted hashes (GEN-13). Five failed logins lock the account for 15 minutes (ACC-05).
- **Authorization:** global `JwtAuthGuard` + `RolesGuard`; ownership checks in services return 404 for
  other users' private data (ACC-11); moderators can only manage their assigned provider.
- **Seat inventory (FLT-22):** each cabin keeps `seats`, `booked`, `held` and `available` counters.
  A hold is a single conditional `findOneAndUpdate` (`available >= n` → decrement), so concurrent requests
  can never oversell. Round trips roll back the first segment if the second cannot be held.
- **Room inventory (HTL-16/18, HTL-06):** a `room_night_locks` collection with a **unique index on
  (room, night)**. A reservation inserts one lock per room-night (all-or-nothing); blocked dates use the
  same collection, so overlapping holds, reservations and blocks are impossible even under concurrency.
- **Holds & lifecycle (GEN-11):** scheduled jobs expire unpaid holds after 10 minutes (releasing inventory
  and cancelling the PaymentIntent), complete past bookings and mark departed flights (FLT-30).
  All status changes are atomic conditional updates.
- **Payments:** card details never reach the backend (Stripe Elements on the frontend). Only the Stripe
  PaymentIntent id, amount, currency and status are stored. A payment that succeeds after its hold expired
  is refunded automatically.
- **Time zones (FLT-03, GEN-06):** flight times are entered in each airport's local time, stored in UTC and
  returned with local times using the airport's IANA zone.
- **Errors (PDF 6.7):** one shape everywhere — `{ statusCode, error, message, errors?, path, timestamp }`,
  where `errors` lists field-level messages (GEN-02).

## Team decisions and assumptions

Decisions made by the team where the official documents leave a gap:

| # | Topic | Decision |
|---|---|---|
| 1 | Platform currency (PAY-04) | **USD** |
| 2 | Supported currencies (GEN-12, ITN-18) | As defined in PDF 5.1: the currency codes listed in the official `Countries.csv` (**EGP, AED, GBP, USD, EUR, JPY, SAR**); the seed derives them from that file |
| 3 | Flight booking "Completed" (GEN-11) | When the last segment's flight has departed (FLT-30) |
| 4 | Extra-baggage fee on round trips | Charged per segment at that segment airline's price per extra bag |
| 5 | "Days before" for refund tiers (FLT-09, HTL-10) | Whole days (rounded down) between now and departure (UTC) / check-in date |
| 6 | Payments from Swagger | Dev-only `POST /api/payments/:id/test-confirm` confirms with Stripe's test payment method; booking confirmation still happens only via the webhook |
| 7 | Demo data | Optional `npm run seed:demo`, separate from the required seed |
| 8 | Extra supporting endpoints | notifications, report submission, admin provider (de)activation, reference-data lookups, cancellation previews (allowed by PDF 8.10) |

Smaller interpretation notes (kept consistent across the code):
- Hotel availability/blocked ranges are expressed in **nights** (inclusive dates); a stay needs every night
  from check-in to the night before check-out.
- The hotel room-status grid (HTL-08) also reports `Unavailable` for nights outside the room's bookable ranges.
- `POST /api/flight-bookings` returns the booking summary only; `POST /api/flight-bookings/hold`
  reserves seats (both listed in PDF 8.4).
- Hidden reviews are excluded from a hotel's average rating.
- The hotel price filter (HTL-12) is applied to the hotel's lowest available room price per night.
- Status changes driven by time (flight Departed, booking Completed, hold Expired) are also applied when the
  record is read, so they never lag behind the scheduled jobs.

---

## Testing

`backend/test/e2e` holds two end-to-end suites (495 checks) that drive the real HTTP API on a local
database: main flows (`run.js`) and requirement details / edge cases (`details.js`), including concurrent
seat and room holds, signed Stripe webhooks, refunds, hold expiry and the FXRatesAPI outage fallback.
Every check and its result is listed in [`docs/testing/TEST_REPORT.md`](docs/testing/TEST_REPORT.md);
how to run them is in [`backend/test/e2e/README.md`](backend/test/e2e/README.md).

## Git workflow (PDF 10)

- `main` — stable milestone releases only. `develop` — integration branch. **No direct work on `main`.**
- Feature branches from the latest `develop`: `feature/<REQ-ID>-<description>`,
  `fix/<REQ-ID>-<description>`, `docs/<description>`.
- Conventional commits, e.g. `feat(flights): add round-trip search (FLT-12)`.
- Every PR targets `develop`, references requirement IDs, contains no secrets, and is reviewed and
  merged by the team leader. At the milestone release `develop` is merged into `main`.

## AI usage

Generative AI was used and is logged in [`AI_PROMPTS.txt`](AI_PROMPTS.txt) as required by PDF section 11.
Every member must understand and be able to explain the code they submit.
