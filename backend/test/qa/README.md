# Adversarial QA suite (Milestone 1)

1012 checks that drive the real HTTP API. Every expectation comes from the project description PDF and the
requirements sheet (each check starts with its requirement ID); checks marked "(dumb input)" cover input a
careless or hostile client could send even where the sheet does not spell out the rule.

Covers: registration/login/lockout (incl. parallel brute force), sessions and cookies, admin and moderator
management, flights (UTC vs local time, duplicates, search filters/sorting, past and impossible dates),
seat holds under concurrency, passengers and baggage, Stripe payments and signed webhooks (forged, replayed,
late), refunds, cancellations (incl. policy changes after booking), hotels, rooms, availability, blocks,
room-night races, reviews, itineraries, budgets and currency conversion (incl. API outage), clones, blog,
likes, comments, reports and moderation, notifications, uploads (limits, spoofed files, parallel uploads),
audit log, error format and injection attempts, and the scheduled jobs. Round 3 adds a permission matrix over
every endpoint and role, forged/expired tokens, double-payment and double-refund races, daylight-saving times,
and whole-database consistency checks (seat counters, room-night locks, payments vs refunds, ratings, counters).
Round 4 adds one end-to-end journey across every module, hotel dates in the hotel's own time zone, and checks of
what is stored in MongoDB (ObjectId references, real dates, hashed secrets, no card data, seeded reference data).

## Run
Use the same local setup as `test/e2e/README.md` (local MongoDB, the two fakes in `test/e2e/fakes`, the
backend started with the test `.env`). Never point it at the shared Atlas database.

```
node test/qa/run.js
```

Defaults match that test `.env`; override with `QA_API`, `QA_MONGO`, `QA_DB`, `QA_ADMIN_EMAIL`,
`QA_ADMIN_PASSWORD`, `QA_WEBHOOK_SECRET`, `QA_JWT_SECRET`, `QA_STRIPE_FAKE`, `QA_UPLOADS_DIR` (set it to the backend's
`UPLOADS_DIR` if you changed it). The suite creates its own users, airlines and hotels, so it can be re-run
on the same database. It waits up to about two minutes at the end for the hold-expiry and Departed schedulers.
Exit code is 1 if any check fails.

Some checks move a record's dates into the past directly in the database to simulate time passing
(completed stays, departed flights, expired holds, idle sessions).
