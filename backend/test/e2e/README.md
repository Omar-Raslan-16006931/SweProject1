# End-to-end API checks

Two suites drive the real HTTP API through **495 checks** (`run.js` 203 main-flow checks, `details.js` 292
requirement-detail and edge-case checks). The full list with results is in `docs/testing/TEST_REPORT.md`.
They cover every module: authentication & lockout,
session inactivity, RBAC & ownership, flight/hotel search, **concurrent seat and room holds** (no
overselling / no double booking), policy acceptance, Stripe PaymentIntents, **signed webhooks**,
refunds, cancellations, e-ticket PDF, itineraries & currency conversion (incl. FXRatesAPI failure
fallback), blog, reports/moderation, admin, uploads and validation errors.

It uses a **local** MongoDB and two tiny local fakes so no real Stripe keys or internet are needed:

| Fake | Port | Purpose |
|---|---|---|
| `fakes/fake-stripe.js` | 12111 | PaymentIntents (create/retrieve/confirm/cancel) and Refunds |
| `fakes/fake-fxrates.js` | 12112 | FXRatesAPI `/latest` (create `fakes/FX_FAIL` to simulate an outage) |

## Run (local machine only — never against the shared Atlas DB)
1. Start a local MongoDB on `127.0.0.1:27017`.
2. `node test/e2e/fakes/fake-stripe.js` and `node test/e2e/fakes/fake-fxrates.js` (two terminals).
3. Start the backend with a **test** `.env`:
   ```
   MONGODB_URI=mongodb://127.0.0.1:27017/travel_test
   JWT_ACCESS_SECRET=test-access-secret
   JWT_REFRESH_SECRET=test-refresh-secret
   COOKIE_SECURE=false
   STRIPE_SECRET_KEY=sk_test_fake_local
   STRIPE_WEBHOOK_SECRET=whsec_local_test_secret
   STRIPE_API_BASE=http://127.0.0.1:12111
   FXRATES_API_URL=http://127.0.0.1:12112
   ADMIN_EMAIL=admin@travel.local
   ADMIN_PASSWORD=Admin12345
   ```
   then `npm run seed && npm run seed:demo && npm run build && npm run start:prod`.
4. `npm run test:e2e` (or `node test/e2e/run.js` then `node test/e2e/details.js`) → prints
   `RESULT: 203/203 checks passed` and `RESULT: 292/292 checks passed`.
   `details.js` waits up to a minute for the scheduler that expires unpaid holds.
