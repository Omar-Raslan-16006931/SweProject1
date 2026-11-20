# API Endpoints (Milestone 1)

Base URL: `http://localhost:3001/api` · Interactive docs: `http://localhost:3001/api/docs` · OpenAPI JSON: `/api/docs-json` (copy in `openapi.json`).

**135 operations** across 110 paths. Authentication = httpOnly cookie set by `POST /api/auth/login`.

## Administration

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/moderators` | Create a hotel or airline moderator linked to exactly one provider, with a temporary password (ACC-13) |
| GET | `/api/admin/accounts` | Paginated accounts list; search by name/email; filter by role and status (ACC-14) |
| PATCH | `/api/admin/accounts/{id}/suspend` | Suspend a user or moderator account (ACC-15, ACC-16) |
| PATCH | `/api/admin/accounts/{id}/reactivate` | Reactivate a suspended user or moderator account (ACC-15, ACC-16) |
| POST | `/api/admin/users/{id}/reset-password` | Reset a user's or moderator's password to a temporary one; must be changed at next login (ACC-07a) |
| GET | `/api/admin/airlines` | List airlines with active flag (supports ACC-13 / ACC-15) |
| GET | `/api/admin/hotels` | List hotels with active flag (supports ACC-13 / ACC-15) |
| PATCH | `/api/admin/providers/{type}/{id}/deactivate` | Deactivate a hotel or airline: hidden from search and not bookable; existing Confirmed bookings stay valid; affected parties notified (ACC-15) |
| PATCH | `/api/admin/providers/{type}/{id}/reactivate` | Reactivate a deactivated hotel or airline; affected parties notified (ACC-15) |
| GET | `/api/admin/bookings` | Read-only list of all flight and hotel bookings; filter by type, status, date range (ACC-17) |
| GET | `/api/admin/reports` | List reports (open by default) (GEN-09, GEN-10) |
| PATCH | `/api/admin/reports/{id}` | Resolve a report: dismiss, hide the content or delete it (audited) (GEN-10, GEN-07) |
| PATCH | `/api/admin/content/{type}/{id}/visibility` | Hide or unhide any post, comment, review or itinerary directly (GEN-10) |
| DELETE | `/api/admin/content/{type}/{id}` | Delete any post, comment, review or itinerary directly (audited) (GEN-10, GEN-07) |
| GET | `/api/admin/audit-logs` | Audit log of admin actions, newest first (GEN-07) |

## Airlines

| Method | Path | Description |
|---|---|---|
| POST | `/api/airlines` | Admin creates an airline profile (FLT-01) |
| GET | `/api/airlines/{id}` | Airline profile with baggage and cancellation policies (FLT-01, FLT-17) |
| PATCH | `/api/airlines/{id}` | Airline moderator edits their airline's profile: name, code (FLT-01) |
| POST | `/api/airlines/{id}/logo` | Upload/replace the airline logo, JPG/PNG <= 5 MB, 1 per airline (FLT-01, GEN-08) |
| DELETE | `/api/airlines/{id}/logo` | Remove the airline logo (FLT-01, GEN-08) |
| PUT | `/api/airlines/{id}/baggage-policy` | Set extra-baggage price and max extra bags per passenger (FLT-04, FLT-08) |
| PUT | `/api/airlines/{id}/cancellation-policy` | Replace cancellation tiers: unique days-before thresholds and refund % (FLT-09) |

## Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new traveler account (ACC-01) |
| POST | `/api/auth/login` | Log in; sets httpOnly access/refresh cookies (ACC-04, ACC-05, ACC-19) |
| POST | `/api/auth/logout` | Log out: clears cookies and revokes the refresh token server-side (ACC-06) |
| POST | `/api/auth/refresh` | Rotate refresh token and issue a new access cookie while the session is active (ACC-06, ACC-19) |
| GET | `/api/auth/me` | Current authenticated user (ACC-04, ACC-19) |
| PATCH | `/api/auth/change-password` | Change password with the current password (ACC-08; completes ACC-07a/ACC-13 temporary password) |

## Blog

| Method | Path | Description |
|---|---|---|
| POST | `/api/posts` | Create a post (title, body, optional tags) as Draft or Published (BLG-01, BLG-08) |
| GET | `/api/posts` | Browse published posts (filter by tag) or search by keyword ordered by likes+comments (BLG-02, BLG-09) |
| GET | `/api/posts/mine` | My posts including drafts with status, date, like and comment counts (BLG-03) |
| GET | `/api/posts/{id}` | Post page: title, author, date, body, tags, images, like count and comments (BLG-02) |
| PATCH | `/api/posts/{id}` | Edit my post incl. tags and status (BLG-04, BLG-08) |
| DELETE | `/api/posts/{id}` | Delete my post (BLG-04) |
| GET | `/api/posts/{id}/comments` | Comments of a post in chronological order (BLG-05) |
| POST | `/api/posts/{id}/comments` | Comment on a published post (non-empty, <= 500 chars) (BLG-05) |
| PATCH | `/api/comments/{id}` | Edit my comment (BLG-07) |
| DELETE | `/api/comments/{id}` | Delete my comment (BLG-07) |
| POST | `/api/posts/{id}/like` | Like a post (once per user) (BLG-06) |
| DELETE | `/api/posts/{id}/like` | Remove my like (BLG-06) |
| POST | `/api/posts/{id}/images` | Attach images to my post: JPG/PNG <= 5 MB, max 5 (BLG-10, GEN-08) |
| DELETE | `/api/posts/{id}/images/{imageId}` | Remove an image from my post (BLG-10) |
| GET | `/api/tags/{tag}/posts` | Published posts with a tag (BLG-08) |
| GET | `/api/authors/{id}` | Public author page: name, join date, published posts and public itineraries (BLG-12) |

## Exchange Rates

| Method | Path | Description |
|---|---|---|
| GET | `/api/exchange-rates` | Current cached exchange rates (base USD) and the rate date (ITN-18) |
| GET | `/api/exchange-rates/convert` | Convert an amount between supported currencies (ITN-18) |

## Flight Bookings

| Method | Path | Description |
|---|---|---|
| POST | `/api/flight-bookings` | Validate passengers & extra baggage and return the booking summary before payment (FLT-19, FLT-21, FLT-12) |
| GET | `/api/flight-bookings` | My flight bookings grouped as upcoming / past / cancelled (FLT-25) |
| POST | `/api/flight-bookings/hold` | Proceed to payment: atomically hold seats and create a Pending Payment booking for 10 minutes (FLT-22) |
| GET | `/api/flight-bookings/{id}` | Flight booking details incl. payment and refund status (FLT-25, PAY-03, ACC-11) |
| GET | `/api/flight-bookings/{id}/cancellation-preview` | Refund amount computed from the airline's tiers, shown before confirming cancellation (FLT-26, FLT-09) |
| POST | `/api/flight-bookings/{id}/cancel` | Cancel my Confirmed booking before departure; seats return to inventory and a refund is issued (FLT-26, PAY-03) |
| GET | `/api/flight-bookings/{id}/e-ticket` | Download the e-ticket PDF of a Confirmed booking (FLT-23) |

## Flights

| Method | Path | Description |
|---|---|---|
| POST | `/api/flights` | Create a flight for my airline (FLT-03) |
| GET | `/api/flights/mine` | List my airline's flights (moderator dashboard support) |
| GET | `/api/flights/search` | Search flights: one-way / round-trip, passenger types, cabin filter, price filter, sorting (FLT-11, FLT-12, FLT-15) |
| GET | `/api/flights/{id}` | Flight details: local times, duration, cabins, seats remaining, baggage & cancellation policy (FLT-17, GEN-06) |
| PATCH | `/api/flights/{id}` | Edit times (and airports while unbooked) of my Scheduled flight; notifies confirmed passengers (FLT-05) |
| POST | `/api/flights/{id}/cabins` | Add a cabin category (Economy / Premium Economy / Business / First, once each) (FLT-04) |
| PATCH | `/api/flights/{id}/cabins/{cabinId}` | Edit cabin price, seats (not below booked+held) and baggage allowance (FLT-04, FLT-05) |
| POST | `/api/flights/{id}/cancel` | Cancel a Scheduled flight: bookings cancelled with 100% refund, holds released, passengers notified (FLT-06) |
| GET | `/api/flights/{id}/bookings` | Flight's bookings with passengers, cabin, seats, status and seats remaining per cabin (FLT-29) |
| GET | `/api/flights/{id}/passengers/export` | Export the passenger list as CSV (FLT-29) |

## Hotel Bookings

| Method | Path | Description |
|---|---|---|
| POST | `/api/hotel-bookings` | Book one or more rooms in the same hotel: holds all rooms together for 10 minutes as one Pending Payment reservation (HTL-16, HTL-18) |
| GET | `/api/hotel-bookings` | My hotel reservations grouped as upcoming / past / cancelled (HTL-20) |
| GET | `/api/hotel-bookings/{id}` | Reservation details incl. payment and refund status (HTL-20, PAY-03, ACC-11) |
| GET | `/api/hotel-bookings/{id}/cancellation-preview` | Refund computed from the hotel's tiers on the full total, shown before confirming (HTL-21, HTL-10) |
| POST | `/api/hotel-bookings/{id}/cancel` | Cancel my Confirmed reservation as a whole before check-in; rooms released, refund issued (HTL-21, PAY-03) |
| GET | `/api/hotels/{id}/reservations` | Reservations for my hotel: guest, dates, status (HTL-22) |

## Hotel Reviews

| Method | Path | Description |
|---|---|---|
| POST | `/api/hotel-bookings/{id}/review` | Submit one rating (1-5) and optional review (<= 1000 chars) for a Completed reservation (HTL-23) |
| PATCH | `/api/reviews/{id}` | Edit my review; hotel average recalculated (HTL-23) |
| DELETE | `/api/reviews/{id}` | Delete my review; hotel average recalculated (HTL-23) |
| GET | `/api/hotels/{id}/reviews` | Hotel's average rating, number of ratings and reviews, newest first, paginated (HTL-24) |

## Hotels

| Method | Path | Description |
|---|---|---|
| POST | `/api/hotels` | Admin creates a hotel profile (HTL-01) |
| GET | `/api/hotels/search` | Search hotels by city/country, dates, guests and rooms; price & rating filters; sort (HTL-11, HTL-12) |
| GET | `/api/hotels/{id}` | Hotel details: profile, photos, amenities, times, policy, average rating and latest reviews; available rooms when dates given (HTL-02) |
| PATCH | `/api/hotels/{id}` | Hotel moderator edits their hotel's profile (HTL-01) |
| POST | `/api/hotels/{id}/photos` | Upload hotel photos: JPG/PNG <= 5 MB each, max 5 per hotel (HTL-01, GEN-08) |
| DELETE | `/api/hotels/{id}/photos/{photoId}` | Remove a hotel photo (HTL-01, GEN-08) |
| PUT | `/api/hotels/{id}/policies` | Set check-in/check-out times and cancellation tiers (HTL-09, HTL-10) |
| GET | `/api/hotels/{id}/rooms` | List my hotel's rooms with availability and blocks (moderator dashboard support) |
| POST | `/api/hotels/{id}/rooms` | Add a room: number/name unique in hotel, type, beds, max occupancy, price per night (HTL-03) |
| GET | `/api/hotels/{id}/rooms/available` | Rooms free for the searched dates with total stay price, paginated (HTL-15, GEN-05) |
| PATCH | `/api/hotels/{id}/rooms/{roomId}` | Edit beds, occupancy, price; deactivate/reactivate (HTL-05, HTL-06) |
| DELETE | `/api/hotels/{id}/rooms/{roomId}` | Delete a room that has never been reserved (HTL-06) |
| POST | `/api/hotels/{id}/rooms/{roomId}/availability` | Add a non-overlapping bookable date range (nights, inclusive) (HTL-04) |
| PATCH | `/api/hotels/{id}/rooms/{roomId}/availability` | Update/remove an availability range, or block/unblock dates (HTL-05, HTL-06) |
| GET | `/api/hotels/{id}/availability` | Room status per date: Available / Booked (with reference) / Blocked; rooms paginated (HTL-08, GEN-05) |

## Itineraries

| Method | Path | Description |
|---|---|---|
| GET | `/api/itineraries/public/search` | Search public itineraries by keyword (title/country/city); filter by duration, country, city (ITN-20, ITN-21) |
| GET | `/api/itineraries/public/{id}` | View a public itinerary read-only with author, days, activities and budget (ITN-21) |
| POST | `/api/itineraries` | Create an itinerary (title <= 100, countries, start date); private by default (ITN-01) |
| GET | `/api/itineraries` | My itineraries, most recently updated first (ITN-03) |
| GET | `/api/itineraries/{id}` | Full details of my itinerary: numbered dated days, city groups, activities, budgets (ITN-03, ITN-09) |
| PATCH | `/api/itineraries/{id}` | Edit title, countries, start date and visibility Public/Private (ITN-01, ITN-20) |
| DELETE | `/api/itineraries/{id}` | Delete my itinerary; clones made by others are unaffected (ITN-01) |
| POST | `/api/itineraries/{id}/days` | Add a day (city from predefined list, notes); max 60 days (ITN-05) |
| PATCH | `/api/itineraries/{id}/days/reorder` | Move a day to a new position; days renumbered, dates and groups recalculated (ITN-08) |
| PATCH | `/api/itineraries/{id}/days/{dayId}` | Edit a day's city and notes (ITN-05) |
| DELETE | `/api/itineraries/{id}/days/{dayId}` | Delete a day; remaining days renumbered, dates and budget totals recalculated (ITN-07) |
| POST | `/api/itineraries/{id}/days/{dayId}/activities` | Add an activity: name, description, optional time and cost (ITN-10) |
| PATCH | `/api/activities/{id}` | Edit an activity (ITN-10) |
| DELETE | `/api/activities/{id}` | Delete an activity (ITN-10) |
| POST | `/api/activities/{id}/images` | Attach images to an activity: JPG/PNG <= 5 MB, max 5 (ITN-12, GEN-08) |
| DELETE | `/api/activities/{id}/images/{imageId}` | Remove an activity image (ITN-12) |
| POST | `/api/itineraries/{id}/days/{dayId}/budgets` | Add a non-negative budget entry (food / accommodation / in-city transport / activities) (ITN-14) |
| PATCH | `/api/budgets/{id}` | Edit a budget entry (ITN-14) |
| DELETE | `/api/budgets/{id}` | Delete a budget entry (ITN-14) |
| POST | `/api/itineraries/{id}/transport-costs` | Add an intercity transport cost (mode, from-city, to-city, amount, currency, day) (ITN-16) |
| PATCH | `/api/transport-costs/{id}` | Edit a transport cost entry (ITN-16) |
| DELETE | `/api/transport-costs/{id}` | Delete a transport cost entry (ITN-16) |
| GET | `/api/itineraries/{id}/budget-summary` | Total budget by category, by day and by city group, converted to the preferred (or given) currency with the rate date (ITN-14, ITN-18, ITN-09) |
| POST | `/api/itineraries/{id}/clone` | Clone a public itinerary into an independent private copy crediting the author (ITN-21) |
| GET | `/api/itineraries/{id}/hotels` | Hotels available for a city group's dates, reusing hotel search (ITN-25) |
| GET | `/api/itineraries/{id}/flights` | One-way/round-trip flights from an origin to the first day's city; dates default from the itinerary (ITN-26) |

## Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | List my in-app notifications, newest first (GEN-01, GEN-05) |
| GET | `/api/notifications/unread-count` | Unread notification count (GEN-01) |
| PATCH | `/api/notifications/read-all` | Mark all my notifications as read (GEN-01) |
| PATCH | `/api/notifications/{id}/read` | Mark a notification as read (GEN-01) |

## Payments & Refunds

| Method | Path | Description |
|---|---|---|
| GET | `/api/bookings/{type}/{id}/policies` | Provider policies to accept before payment (airline: cancellation + baggage; hotel: cancellation + check-in/out) (PAY-02) |
| POST | `/api/bookings/{type}/{id}/accept-policies` | Accept provider policies; stored with a timestamp. Payment is blocked until accepted (PAY-02) |
| POST | `/api/payments` | Create a Stripe PaymentIntent for a Pending Payment booking within its hold; returns clientSecret for Stripe Elements (PAY-01) |
| POST | `/api/payments/{id}/retry` | Retry a failed payment until the hold expires (PAY-01) |
| GET | `/api/payments/{id}` | Payment status (PAY-01) |
| POST | `/api/payments/{id}/test-confirm` | DEV/TEST ONLY: confirm the PaymentIntent with a Stripe test payment method to demo the flow from Swagger |
| POST | `/api/payments/webhook` | Stripe webhook: verifies signature, confirms bookings and updates refunds (PAY-01, PAY-03) |
| GET | `/api/refunds/{id}` | Refund status: Pending, Refunded or Failed (PAY-03) |

## Reference Data

| Method | Path | Description |
|---|---|---|
| GET | `/api/airports` | List predefined airports (FLT-02) |
| GET | `/api/countries` | List predefined countries (GEN-12, ITN-01) |
| GET | `/api/cities` | List predefined cities (GEN-12, ITN-05, HTL-01) |
| GET | `/api/currencies` | List supported currencies (GEN-12, ACC-09, ITN-18) |
| GET | `/api/attractions` | List reference attractions (PDF 5.1 reference dataset) |

## Reports

| Method | Path | Description |
|---|---|---|
| POST | `/api/reports` | Report a post, comment, review or itinerary with a reason, at most once per item (GEN-09) |

## Users

| Method | Path | Description |
|---|---|---|
| GET | `/api/users/me` | My profile (ACC-11) |
| PATCH | `/api/users/me` | Edit name, phone number and preferred currency (ACC-09) |
| DELETE | `/api/users/me` | Deactivate my account; blocked while I have upcoming Confirmed bookings (ACC-12) |
