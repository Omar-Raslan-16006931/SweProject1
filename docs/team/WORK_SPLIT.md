# Milestone 1 — Work Split (Team 1000)

Deadline: **20/11**. Every package is one feature branch → one pull request into `develop`,
reviewed and merged by the team leader (PDF 10.4, 10.5).

**Merge order matters** — each package builds on the ones before it. Always branch from the
**latest `develop`** after the previous package in this list has been merged.

| # | Owner | Branch | Scope | Requirement IDs | Depends on |
|---|---|---|---|---|---|
| 1 | **Omar Raslan** (leader) | `feature/ACC-01-core-auth-accounts` | Project bootstrap, configuration, **all MongoDB schemas**, shared utilities, error handling, Swagger, seeding of official datasets & admin, authentication (cookies, lockout, sessions), accounts/profile, notifications, audit log, uploads | ACC-01, 03, 04, 05, 06, 08, 09, 11, 12, 18, 19 · FLT-02 · GEN-01, 02, 05, 07, 08, 12, 13 | — |
| 2 | Aly Hady | `feature/FLT-03-airlines-flights` | Airlines, baggage & cancellation policies, flights, cabins, flight search/filter/sort, flight details, local time zones | FLT-01, 03, 04, 05, 08, 09, 11, 12, 15, 17, 30 · GEN-06 | 1 |
| 3 | Ali Essam | `feature/HTL-03-hotels-rooms` | Hotels, rooms, availability ranges, blocked dates, room-status grid, policies, hotel search/filter/sort, available rooms | HTL-01, 02, 03, 04, 05, 06, 08, 09, 10, 11, 12, 15 | 1, 2 |
| 4 | **Omar Raslan** (leader) | `feature/FLT-22-bookings-payments` | Flight bookings & hotel reservations with **concurrency-safe holds**, booking lifecycle, Stripe payments, webhook, refunds, cancellations, e-ticket, moderator booking views | FLT-06, 19, 21, 22, 23, 25, 26, 29 · HTL-16, 17, 18, 20, 21, 22 · PAY-01, 02, 03, 04 · GEN-11 | 1, 2, 3 |
| 5 | Saeed Mahmoud | `feature/ITN-18-exchange-rates-reviews` | FXRatesAPI integration with daily DB cache, currency conversion, hotel ratings & reviews | ITN-18 · HTL-23, 24 | 1, 3, 4 |
| 6 | Karim Ahmed | `feature/ITN-01-itineraries` | Itineraries, days, activities & images, budgets, transport costs, budget summary, public search, cloning, hotel/flight search from an itinerary | ITN-01, 03, 05, 07, 08, 09, 10, 12, 14, 16, 20, 21, 25, 26 | 1, 2, 3, 5 |
| 7 | Mohamed Sherif Ahmed | `feature/BLG-01-blog` | Posts (draft/published), tags, images, comments, likes, keyword search ranked by interactions, author pages | BLG-01 – BLG-10, BLG-12 | 1, 6 |
| 8 | Yehia Atallah | `feature/ACC-13-admin-moderation` | Admin: moderators, accounts, suspend/reactivate, password reset, provider (de)activation, all-bookings view, audit-log view; content reports & moderation | ACC-07a, 13, 14, 15, 16, 17 · GEN-07, 09, 10 | 1 – 7 |
| 9 | **Omar Raslan** (leader) | `docs/api-traceability` | Traceability matrix, endpoint reference, OpenAPI export, end-to-end test scripts, final README; release `develop → main` | all (documentation) | 1 – 8 |

## Rules for every member

1. `git checkout develop && git pull origin develop`, then `git checkout -b <your branch>`.
2. Implement / integrate your package, run `npm run build` and test your endpoints in Swagger
   (`http://localhost:3001/api/docs`) against the shared Atlas database.
3. Commit with Conventional Commits that mention requirement IDs, e.g.
   `feat(flights): add round-trip search (FLT-12)`. No vague messages (`update`, `fix`, `final`).
4. Add your entry to `AI_PROMPTS.txt` if AI materially contributed (mandatory, PDF 11.1).
5. `git push -u origin <your branch>` and open a PR **into `develop`** with a meaningful title,
   description and the requirement IDs. Never commit `.env` or secrets.
6. You must be able to explain every line you submit during the project discussion (PDF 11.2 b).
