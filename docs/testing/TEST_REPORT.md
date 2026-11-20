# Test report — Milestone 1 backend

Every check below drives the real HTTP API of a running backend (NestJS + MongoDB) and asserts on the
response and, where needed, on the database. Run on a freshly seeded local database.

| Suite | Passed | Total |
|---|---|---|
| Suite 1 — main flows (backend/test/e2e/run.js) | 203 | 203 |
| Suite 2 — requirement details and edge cases (backend/test/e2e/details.js) | 292 | 292 |
| **All** | **495** | **495** |

How the external services were exercised:

| Service | In the automated suites | Live check |
|---|---|---|
| Stripe (PAY-01..03) | Local stand-in for the Stripe API; webhooks are signed with the real Stripe SDK and verified by the backend | Not run: needs the team's Stripe test keys in `backend/.env` |
| FXRatesAPI (ITN-18) | Local stand-in, including a simulated outage (falls back to the last cached rates) | Run against the real `api.fxratesapi.com`: rates fetched, cached and used for conversion |
| MongoDB | Local MongoDB | Seed and startup verified on the team's Atlas cluster |

How to run: see `backend/test/e2e/README.md` (`npm run test:e2e`). Never run the suites against the shared Atlas database.

Each check name starts with the requirement ID it verifies.

## Suite 1 — main flows (backend/test/e2e/run.js)

**203 of 203 checks passed.**


### Reference data (3/3)

| # | Check | Result |
|---|---|---|
| 1 | GET /airports returns 8 official airports | pass |
| 2 | GET /currencies returns the 7 supported | pass |
| 3 | GET /cities?countryCode=EG | pass |

### Auth (ACC-01, 04, 05, 06, 08, 19) (19/19)

| # | Check | Result |
|---|---|---|
| 4 | ACC-01 weak password rejected with field error | pass |
| 5 | ACC-01 consent required | pass |
| 6 | ACC-01 register ok | pass |
| 7 | ACC-01 duplicate email 409 | pass |
| 8 | Unauthenticated /auth/me -> 401 | pass |
| 9 | ACC-04 login ok + homePath | pass |
| 10 | ACC-04 malformed email gets the same generic failure | pass |
| 11 | ACC-19 cookies are HttpOnly | pass |
| 12 | Body never contains a token | pass |
| 13 | GET /auth/me with cookie | pass |
| 14 | ACC-06 refresh rotates session | pass |
| 15 | ACC-08 wrong current password rejected | pass |
| 16 | ACC-08 change password ok | pass |
| 17 | ACC-05 locked after 5 failures (even with right password) | pass |
| 18 | ACC-05 login works after lock expires | pass |
| 19 | ACC-06 30-minute inactivity expires session | pass |
| 20 | ACC-06 logout | pass |
| 21 | ACC-09 profile update | pass |
| 22 | ACC-09 unsupported currency rejected | pass |

### Admin + moderators (ACC-13..18, ACC-07a) (9/9)

| # | Check | Result |
|---|---|---|
| 23 | ACC-18 seeded admin login | pass |
| 24 | Non-admin cannot create airline (403) | pass |
| 25 | FLT-01 admin creates airline | pass |
| 26 | HTL-01 admin creates hotel | pass |
| 27 | HTL-01 city/country mismatch rejected | pass |
| 28 | ACC-13 create airline moderator | pass |
| 29 | ACC-13 create hotel moderator | pass |
| 30 | ACC-13 moderator must change temp password first | pass |
| 31 | ACC-14 accounts search + filter | pass |

### Airline config + flights (FLT-01..09, FLT-30) (12/12)

| # | Check | Result |
|---|---|---|
| 32 | FLT-01 moderator edits own airline | pass |
| 33 | Moderator cannot edit another airline | pass |
| 34 | FLT-08 baggage policy | pass |
| 35 | FLT-09 duplicate thresholds rejected | pass |
| 36 | FLT-09 tiers set | pass |
| 37 | FLT-03 identical airports rejected | pass |
| 38 | FLT-03 arrival not after departure (UTC) rejected | pass |
| 39 | FLT-03 past departure rejected | pass |
| 40 | FLT-03 create flight; stored UTC from local | pass |
| 41 | FLT-03 duplicate flight number same date -> 409 | pass |
| 42 | FLT-04 cabin class at most once | pass |
| 43 | FLT-04 add Business cabin | pass |

### Flight search (FLT-11, 12, 15, 17) (8/8)

| # | Check | Result |
|---|---|---|
| 44 | FLT-11 guest search finds flight | pass |
| 45 | FLT-11 insufficient seats excluded (Economy 3 < 4 hidden, Business 2 < 4 hidden) | pass |
| 46 | FLT-12 more infants than adults rejected | pass |
| 47 | FLT-15 min>max error | pass |
| 48 | FLT-12c cabin filter | pass |
| 49 | FLT-12a round-trip returns outbound + return | pass |
| 50 | FLT-11 no flights message | pass |
| 51 | FLT-17 details include policy + seats remaining | pass |

### Flight booking + concurrency + payment (FLT-19..26, PAY-01..03) (37/37)

| # | Check | Result |
|---|---|---|
| 52 | FLT-12b passenger type validated against DOB | pass |
| 53 | FLT-08 extra bag over max weight rejected | pass |
| 54 | FLT-21 summary: fare 100 + infant 10 + bag 30 = 140 | pass |
| 55 | FLT-22 concurrent holds never oversell (exactly 3 of 8 succeed) | pass |
| 56 | FLT-22 inventory counters: held 3, available 0 | pass |
| 57 | FLT-05 cannot reduce seats below booked+held | pass |
| 58 | FLT-22 Pending Payment with 10-min hold | pass |
| 59 | PAY-02 payment blocked before policy acceptance | pass |
| 60 | PAY-02 policies show cancellation + baggage | pass |
| 61 | ACC-11 other user cannot see booking (404) | pass |
| 62 | PAY-01 PaymentIntent created with client secret | pass |
| 63 | PAY-01 webhook accepted (signature verified) | pass |
| 64 | FLT-23 booking Confirmed with unique reference after webhook | pass |
| 65 | PAY-01 webhook with bad signature rejected | pass |
| 66 | FLT-23 held seat converted to booked | pass |
| 67 | GEN-01 confirmation notification | pass |
| 68 | FLT-23 e-ticket PDF | pass |
| 69 | PAY-01 only id/amount/currency/status stored (no card data) | pass |
| 70 | PAY-01 declined payment shows error | pass |
| 71 | PAY-01 retry allowed within hold | pass |
| 72 | FLT-22 expired hold -> Expired + PaymentIntent cancelled | pass |
| 73 | FLT-22 expired seats released | pass |
| 74 | PAY-01 cannot pay expired booking | pass |
| 75 | FLT-26 preview: 20 days -> 80% of 100 | pass |
| 76 | FLT-26 cancel -> Cancelled + refund Pending | pass |
| 77 | PAY-03 refund status updated to Refunded via webhook | pass |
| 78 | FLT-26 seats returned to inventory | pass |
| 79 | FLT-25 grouped list (cancelled) | pass |
| 80 | FLT-12a round trip = one booking with 2 segments | pass |
| 81 | FLT-29 moderator sees bookings + seats remaining | pass |
| 82 | FLT-29 CSV export | pass |
| 83 | FLT-05 airports locked once booked | pass |
| 84 | FLT-05 time change ok | pass |
| 85 | FLT-05 schedule-change notification to confirmed passenger | pass |
| 86 | FLT-06 airline cancels flight | pass |
| 87 | FLT-06 booking cancelled with 100% refund | pass |
| 88 | FLT-06 cancelled flight hidden from search | pass |

### Hotels (HTL-02..24) (36/36)

| # | Check | Result |
|---|---|---|
| 89 | HTL-09/10 policies | pass |
| 90 | HTL-03 duplicate room number 409 | pass |
| 91 | HTL-04 overlapping availability rejected | pass |
| 92 | HTL-11 combined occupancy rule (7 guests > best 2 rooms 4+2) excludes hotel | pass |
| 93 | HTL-11 search finds hotel; price = cheapest room | pass |
| 94 | HTL-11 checkout before checkin rejected | pass |
| 95 | HTL-12 unrated hotels excluded with rating filter | pass |
| 96 | HTL-15 available rooms with total stay price | pass |
| 97 | GEN-05 available rooms are paginated | pass |
| 98 | HTL-02 details with available rooms | pass |
| 99 | HTL-02 details carry a reviews list | pass |
| 100 | HTL-18 concurrent multi-room holds: exactly one wins, all-or-nothing | pass |
| 101 | HTL-18 locks = 2 rooms x 3 nights | pass |
| 102 | HTL-16 at least one adult required | pass |
| 103 | HTL-16 occupancy exceeded rejected | pass |
| 104 | HTL-16 booking total = 3 x 120 | pass |
| 105 | HTL-06 block over Pending Payment reservation rejected | pass |
| 106 | HTL-06 deactivation with reservation rejected | pass |
| 107 | HTL-17 reservation Confirmed with reference | pass |
| 108 | HTL-05 cannot remove availability for reserved dates | pass |
| 109 | GEN-05 room-status grid is paginated by room | pass |
| 110 | HTL-08 grid: Booked with reference, Available otherwise | pass |
| 111 | HTL-06 block free dates ok | pass |
| 112 | HTL-22 moderator sees reservations | pass |
| 113 | HTL-06 delete reserved room rejected | pass |
| 114 | HTL-21 preview: 10 days -> 100% | pass |
| 115 | HTL-23 review blocked before Completed | pass |
| 116 | HTL-23 Confirmed becomes Completed once check-out has passed | pass |
| 117 | HTL-20 completed stay is listed under past | pass |
| 118 | HTL-23 review submitted | pass |
| 119 | HTL-23 one review per reservation | pass |
| 120 | HTL-24 avg recalculated after edit | pass |
| 121 | HTL-02 details show average rating and the review | pass |
| 122 | HTL-21 cancel -> rooms released + refund | pass |
| 123 | HTL-21 locks released | pass |
| 124 | HTL-20 grouped (past) list | pass |

### Provider deactivation (ACC-15) (12/12)

| # | Check | Result |
|---|---|---|
| 125 | ACC-15 invalid provider type rejected | pass |
| 126 | ACC-15 deactivate hotel | pass |
| 127 | ACC-15 already deactivated -> 409 | pass |
| 128 | ACC-15 existing Confirmed booking stays valid | pass |
| 129 | ACC-15 customer with Confirmed booking notified | pass |
| 130 | ACC-15 deactivated hotel hidden from search | pass |
| 131 | ACC-15 deactivated hotel cannot be booked | pass |
| 132 | ACC-15 hotel moderator notified | pass |
| 133 | ACC-15 reactivate hotel | pass |
| 134 | ACC-15 deactivate airline | pass |
| 135 | ACC-15 airline moderator notified | pass |
| 136 | ACC-15 reactivate airline | pass |

### Itineraries + budgets + FX (ITN-01..26) (25/25)

| # | Check | Result |
|---|---|---|
| 137 | ITN-01 create private itinerary | pass |
| 138 | ITN-01 invalid country rejected | pass |
| 139 | ITN-05 days numbered with derived dates | pass |
| 140 | ITN-09 city groups | pass |
| 141 | ITN-08 reorder renumbers & regroups (cairo,dubai,cairo = 3 groups) | pass |
| 142 | ITN-10 activity added | pass |
| 143 | ITN-12 / GEN-08 PNG upload served by URL | pass |
| 144 | GEN-08 uploaded file is served | pass |
| 145 | GEN-08 non JPG/PNG rejected | pass |
| 146 | GEN-08 spoofed MIME rejected by signature check | pass |
| 147 | GEN-08 max 5 images per activity | pass |
| 148 | ITN-14 negative budget rejected | pass |
| 149 | ITN-14/18 summary converted to USD (food 20, activities 10, accommodation 100, intercity 100) | pass |
| 150 | ITN-18 defaults to preferred currency (EUR) | pass |
| 151 | ITN-18 invalid currency code rejected | pass |
| 152 | ITN-18 API failure falls back to last cached rates | pass |
| 153 | ITN-07 delete day renumbers & redates | pass |
| 154 | ACC-11 other user cannot read private itinerary | pass |
| 155 | ITN-21 private itinerary not publicly viewable | pass |
| 156 | ITN-21 public search by city keyword | pass |
| 157 | ITN-21 guest views public itinerary with budget | pass |
| 158 | ITN-21 clone: private, credits author, independent | pass |
| 159 | ITN-01 deleting original keeps clones | pass |
| 160 | ITN-25 hotels for city group dates | pass |
| 161 | ITN-26 flights to first-day city with default dates | pass |

### Blog (BLG-01..12) (13/13)

| # | Check | Result |
|---|---|---|
| 162 | BLG-01 draft created; tags normalised/deduped | pass |
| 163 | BLG-01 draft not public | pass |
| 164 | BLG-08 >5 tags rejected | pass |
| 165 | BLG-05 empty comment rejected | pass |
| 166 | BLG-06 like at most once | pass |
| 167 | BLG-09 search ordered by interaction score | pass |
| 168 | BLG-08 tag page | pass |
| 169 | BLG-02 post page with likes & comments | pass |
| 170 | BLG-03 my posts incl status/counts | pass |
| 171 | BLG-07 cannot edit others comment | pass |
| 172 | BLG-10 post images | pass |
| 173 | BLG-12 author page | pass |
| 174 | BLG-12 public itineraries paginated | pass |

### Reports + moderation + audit (GEN-07, 09, 10) (16/16)

| # | Check | Result |
|---|---|---|
| 175 | GEN-09 report created | pass |
| 176 | GEN-09 at most once per item | pass |
| 177 | GEN-10 admin sees open report with target summary | pass |
| 178 | GEN-10 resolve by hiding | pass |
| 179 | GEN-10 hidden post invisible to public | pass |
| 180 | GEN-10 hidden post visible to author | pass |
| 181 | GEN-10 public itinerary visible before hiding | pass |
| 182 | GEN-10 admin hides an itinerary directly | pass |
| 183 | GEN-10 hidden itinerary invisible to guests | pass |
| 184 | GEN-10 hidden itinerary invisible to other users | pass |
| 185 | GEN-10 hidden itinerary not in public search | pass |
| 186 | GEN-10 hidden itinerary visible to admin | pass |
| 187 | GEN-10 hidden itinerary visible to its author | pass |
| 188 | GEN-10 unhidden itinerary public again | pass |
| 189 | GEN-10 admin deletes comment directly | pass |
| 190 | GEN-07 audit log records admin actions | pass |

### Admin bookings, suspension, password reset (ACC-07a, 16, 17) (7/7)

| # | Check | Result |
|---|---|---|
| 191 | ACC-17 merged flight+hotel bookings | pass |
| 192 | ACC-17 filter type+status | pass |
| 193 | ACC-16 suspend user | pass |
| 194 | ACC-16 suspended user session revoked | pass |
| 195 | ACC-04 suspended login shows message | pass |
| 196 | ACC-07a admin reset password | pass |
| 197 | ACC-07a must set new password at next login | pass |

### Deactivation (ACC-12) (4/4)

| # | Check | Result |
|---|---|---|
| 198 | ACC-12 blocked with upcoming Confirmed bookings | pass |
| 199 | ACC-12 deactivate ok | pass |
| 200 | ACC-12 deactivated cannot log in | pass |
| 201 | GEN-05 page size 10 | pass |

### Validation & errors (GEN-02, GEN-13) (2/2)

| # | Check | Result |
|---|---|---|
| 202 | GEN-02 field-level validation errors | pass |
| 203 | Invalid ObjectId -> 400 | pass |

## Suite 2 — requirement details and edge cases (backend/test/e2e/details.js)

**292 of 292 checks passed.**


### Setup (1/1)

| # | Check | Result |
|---|---|---|
| 204 | setup: admin login | pass |

### Accounts details (ACC-01, 04, 05, 08, 09, 10, 11, 13, 18, GEN-13) (25/25)

| # | Check | Result |
|---|---|---|
| 205 | ACC-01 name is required | pass |
| 206 | ACC-01 invalid email format -> field error | pass |
| 207 | ACC-01 password needs a digit | pass |
| 208 | ACC-01 password needs a letter | pass |
| 209 | ACC-01 duplicate email is case-insensitive | pass |
| 210 | ACC-18 no admin self-registration (role field refused) | pass |
| 211 | GEN-13 password stored only as a salted bcrypt hash | pass |
| 212 | GEN-13 password hash never returned | pass |
| 213 | ACC-04 same generic message for unknown email and wrong password | pass |
| 214 | ACC-05 4 failures do not lock | pass |
| 215 | ACC-05 counter was reset by the successful login | pass |
| 216 | ACC-05 5th consecutive failure locks for 15 minutes | pass |
| 217 | ACC-05 lock lasts 15 minutes | pass |
| 218 | ACC-05 locked account refuses even the right password, with a lockout message | pass |
| 219 | ACC-10 guest on a restricted action -> 401 AUTH_REQUIRED | pass |
| 220 | ACC-08 weak new password rejected | pass |
| 221 | ACC-09 invalid phone rejected with field error | pass |
| 222 | ACC-09 valid profile saved | pass |
| 223 | ACC-09 nothing saved when any field is invalid | pass |
| 224 | ACC-09 email cannot be changed through the profile | pass |
| 225 | ACC-13 moderator must be linked to an existing provider of the right type | pass |
| 226 | ACC-18 admin cannot be created as a moderator role | pass |
| 227 | ACC-13 only admins create moderators (403) | pass |
| 228 | ACC-14 moderators cannot open the admin accounts list | pass |
| 229 | ACC-14 list shows name, email, role, status, registration date | pass |

### Flights details (FLT-02..17, 30, GEN-06) (25/25)

| # | Check | Result |
|---|---|---|
| 230 | FLT-02 predefined airports carry city, country and IANA time zone | pass |
| 231 | FLT-08 extra bag price must be > 0 | pass |
| 232 | FLT-09 refund percent must be 0-100 | pass |
| 233 | FLT-09 days-before must be a whole number >= 0 | pass |
| 234 | FLT-02 unknown airport rejected | pass |
| 235 | FLT-04 seat count must be > 0 | pass |
| 236 | FLT-04 seat count must be a whole number | pass |
| 237 | FLT-04 price must be > 0 | pass |
| 238 | FLT-04 only Economy / Premium Economy / Business / First | pass |
| 239 | FLT-03 flights created | pass |
| 240 | FLT-03 same flight number on another date is allowed | pass |
| 241 | GEN-06 local times use each airport zone (CAI 08:00 -> DXB 13:30 = 3h30) | pass |
| 242 | FLT-03 only airline moderators create flights | pass |
| 243 | FLT-15 sort by price (descending) | pass |
| 244 | FLT-15 sort by duration | pass |
| 245 | FLT-15 unknown sort field rejected | pass |
| 246 | FLT-15 inclusive price filter keeps only matching cabins | pass |
| 247 | FLT-15 price bounds are inclusive | pass |
| 248 | FLT-12a return date before departure rejected | pass |
| 249 | FLT-12a round-trip needs a return date | pass |
| 250 | FLT-11 same departure and arrival airport rejected | pass |
| 251 | FLT-12b at least one adult | pass |
| 252 | FLT-11 seats must cover adults + children (5 > 4 Business seats) | pass |
| 253 | FLT-12b infants do not occupy seats | pass |
| 254 | FLT-17 details: airline, number, airports, local times, duration, price, baggage, seats, policy | pass |

### Flight booking details (FLT-19..26, 30, GEN-11, PAY-04) (51/51)

| # | Check | Result |
|---|---|---|
| 255 | FLT-19 date of birth in the future rejected | pass |
| 256 | FLT-19 passenger name required | pass |
| 257 | FLT-19 passport format validated | pass |
| 258 | FLT-19 extra bags limited to the airline maximum (1) | pass |
| 259 | FLT-12b a booking needs at least one adult | pass |
| 260 | FLT-12b infant must be under 2 on the travel date | pass |
| 261 | FLT-12b infants may not outnumber adults | pass |
| 262 | FLT-21 summary = 3 seats x 200 + 10% infant 20 + 1 extra bag 25 = 645 | pass |
| 263 | PAY-04 totals are in the single platform currency | pass |
| 264 | FLT-21 summary shows baggage allowance and nothing is held yet | pass |
| 265 | FLT-12a return flight must fly back and depart after the outbound arrives | pass |
| 266 | FLT-22 hold creates Pending Payment | pass |
| 267 | FLT-22 hold lasts 10 minutes | pass |
| 268 | FLT-22 held seats leave the inventory at once | pass |
| 269 | GEN-11 a Pending Payment booking cannot be cancelled | pass |
| 270 | FLT-23 no e-ticket before confirmation | pass |
| 271 | ACC-11 another user cannot pay or accept policies for my booking | pass |
| 272 | ACC-11 airline moderator of that flight can view the booking | pass |
| 273 | ACC-11 a hotel moderator cannot view a flight booking | pass |
| 274 | ACC-11 admin can view the booking | pass |
| 275 | FLT-23 Confirmed with reference after the verified webhook | pass |
| 276 | PAY-04 payment charged in USD | pass |
| 277 | PAY-01 a replayed webhook does not confirm twice | pass |
| 278 | PAY-01 a paid booking cannot be paid again | pass |
| 279 | FLT-25 upcoming list shows reference, flight, date, passengers, cabin, status | pass |
| 280 | FLT-26 20 days before -> 14-day tier -> 100% | pass |
| 281 | FLT-26 10 days before -> 7-day tier -> 60% of 200 = 120 | pass |
| 282 | FLT-26 4 days before -> 2-day tier -> 20% | pass |
| 283 | FLT-09 no matching tier -> 0% refund | pass |
| 284 | FLT-26 cancel with 0% refund: Cancelled, no refund record | pass |
| 285 | GEN-11 a Cancelled booking cannot be cancelled again | pass |
| 286 | PAY-03 positive refund recorded as Pending for the refund amount | pass |
| 287 | PAY-03 refund status endpoint (owner only) | pass |
| 288 | PAY-03 refund shown as Refunded on booking details + notification | pass |
| 289 | FLT-26 cancelled seats are available again | pass |
| 290 | GEN-01 cancellation notification | pass |
| 291 | FLT-29 moderator sees passengers, cabin, seats, status + seats remaining per cabin | pass |
| 292 | FLT-29 CSV has a header and one line per passenger | pass |
| 293 | FLT-29 another airline cannot see these bookings | pass |
| 294 | FLT-05 price edit applies to new bookings only | pass |
| 295 | FLT-30 flight is Departed once its departure time has passed | pass |
| 296 | FLT-30 departed flight cannot be booked | pass |
| 297 | FLT-30 departed flight is not returned by search | pass |
| 298 | FLT-26 booking cannot be cancelled after departure | pass |
| 299 | FLT-30 departed flight cannot be edited or cancelled by the airline | pass |
| 300 | GEN-11 Confirmed -> Completed after the flight departed | pass |
| 301 | FLT-25 completed booking is listed under past | pass |
| 302 | PAY-01 payment refused once the hold has expired | pass |
| 303 | GEN-11 Pending Payment -> Expired when the hold runs out | pass |
| 304 | FLT-22 expired hold returns the seat | pass |
| 305 | FLT-25 expired bookings are not listed as upcoming | pass |

### Hotels details (HTL-01..22) (56/56)

| # | Check | Result |
|---|---|---|
| 306 | HTL-01 moderator edits own hotel profile | pass |
| 307 | HTL-01 star class limited to 1-5 | pass |
| 308 | HTL-01 users cannot create hotels | pass |
| 309 | HTL-09 check-in time must be HH:mm | pass |
| 310 | HTL-10 thresholds must be unique | pass |
| 311 | HTL-03 price per night must be > 0 | pass |
| 312 | HTL-03 max occupancy must be >= 1 | pass |
| 313 | HTL-03 12 rooms created | pass |
| 314 | HTL-04 range end before start rejected | pass |
| 315 | HTL-04 a second, non-overlapping range is accepted | pass |
| 316 | GEN-05 free rooms: 12 results -> page 1 has 10, 2 pages | pass |
| 317 | GEN-05 free rooms page 2 has the remaining 2 | pass |
| 318 | HTL-15 each free room shows type, beds, occupancy, nightly price and stay total | pass |
| 319 | GEN-05 room-status grid: 10 rooms per page | pass |
| 320 | HTL-11 check-in in the past rejected | pass |
| 321 | HTL-11 a city or country is required | pass |
| 322 | HTL-12 min price above max price rejected | pass |
| 323 | HTL-12 rating filter limited to 1-5 | pass |
| 324 | HTL-11 hotel excluded when it has fewer free rooms than requested | pass |
| 325 | HTL-11 found by country when 2 rooms can host 6 guests (3+3) | pass |
| 326 | HTL-12 price filter uses the lowest available room price (inclusive) | pass |
| 327 | HTL-12 hotel excluded when its lowest price is below the minimum | pass |
| 328 | HTL-12 sort by price (descending) | pass |
| 329 | HTL-16 same room twice in one request rejected | pass |
| 330 | HTL-16 child age above 17 rejected | pass |
| 331 | HTL-16 check-out must be after check-in | pass |
| 332 | HTL-16 dates outside the bookable range rejected | pass |
| 333 | HTL-16/17 one reservation for 2 rooms: total = (101 + 103) x 3 nights, hold 10 min | pass |
| 334 | HTL-18 a held room cannot be taken by someone else | pass |
| 335 | HTL-18 the rejected request held nothing (room 4 still free) | pass |
| 336 | PAY-02 hotel policies shown: cancellation + check-in/check-out | pass |
| 337 | HTL-17 confirmation: reference, hotel, rooms, dates, total | pass |
| 338 | ACC-11 hotel moderator of that hotel can view; airline moderator cannot | pass |
| 339 | HTL-06 block over a Confirmed reservation rejected | pass |
| 340 | HTL-06 block free dates | pass |
| 341 | HTL-06 blocked room excluded from those dates | pass |
| 342 | HTL-18 blocked dates cannot be booked | pass |
| 343 | HTL-08 grid shows Booked (with reference), Blocked and Available | pass |
| 344 | HTL-06 deactivate a room without reservations | pass |
| 345 | HTL-06 deactivated room excluded from search | pass |
| 346 | HTL-06 a never-reserved room can be deleted | pass |
| 347 | HTL-05 edit beds, occupancy and price | pass |
| 348 | HTL-05 another hotel moderator cannot edit these rooms | pass |
| 349 | HTL-22 moderator list: guest, dates, status | pass |
| 350 | HTL-21 20 days before -> 10-day tier -> 100% of the full total | pass |
| 351 | HTL-21 5 days before -> 3-day tier -> 50% of 204 = 102 | pass |
| 352 | HTL-21 cancel: Cancelled as a whole + refund | pass |
| 353 | HTL-21 rooms released after cancellation | pass |
| 354 | HTL-23 a Cancelled reservation cannot be reviewed | pass |
| 355 | HTL-21 cannot cancel on or after the check-in date | pass |
| 356 | HTL-23 rating must be 1-5 | pass |
| 357 | HTL-23 review text limited to 1000 characters | pass |
| 358 | HTL-23 only the guest can review their reservation | pass |
| 359 | HTL-23 review saved for the Completed reservation | pass |
| 360 | HTL-24 average, number of ratings and reviews newest first | pass |
| 361 | HTL-23 delete own review -> average cleared | pass |

### Payments details (PAY-01..03) (10/10)

| # | Check | Result |
|---|---|---|
| 362 | PAY-02 payment blocked until policies are accepted | pass |
| 363 | PAY-02 acceptance stored with a timestamp | pass |
| 364 | PAY-01 PaymentIntent for the booking total | pass |
| 365 | PAY-01 stored: PaymentIntent id, amount, currency, status only | pass |
| 366 | PAY-01 failure shows an error; booking stays unconfirmed | pass |
| 367 | PAY-01 another user cannot read my payment | pass |
| 368 | PAY-01 retry while the hold is active | pass |
| 369 | PAY-01 booking confirmed only after the succeeded webhook | pass |
| 370 | PAY-01 webhook without a signature rejected | pass |
| 371 | PAY-01 guests cannot create payments | pass |

### Itineraries details (ITN-01..26) (54/54)

| # | Check | Result |
|---|---|---|
| 372 | ITN-01 title limited to 100 characters | pass |
| 373 | ITN-01 at least one country | pass |
| 374 | ITN-01 start date must be a date | pass |
| 375 | ITN-01 guests cannot create itineraries | pass |
| 376 | ITN-01/20 created private by default | pass |
| 377 | ITN-05 unknown city rejected | pass |
| 378 | ITN-05 a day needs a city | pass |
| 379 | ITN-05 days are numbered and dated from the start date | pass |
| 380 | ITN-09 consecutive same-city days form groups | pass |
| 381 | ITN-03 list: title, countries, start date, days, visibility; most recently updated first | pass |
| 382 | ITN-01 editing the start date re-dates the days | pass |
| 383 | ITN-10 activity time must be HH:mm | pass |
| 384 | ITN-10 activity cost cannot be negative | pass |
| 385 | ITN-10 activity needs a name | pass |
| 386 | ITN-10 edit activity | pass |
| 387 | ITN-10 another user cannot edit my activity | pass |
| 388 | ITN-14 unknown budget category rejected | pass |
| 389 | ITN-14 unsupported budget currency rejected | pass |
| 390 | ITN-14 edit a budget entry | pass |
| 391 | ITN-16 intercity transport cost: mode, from, to, amount, currency, day | pass |
| 392 | ITN-16 negative transport amount rejected | pass |
| 393 | ITN-16 unknown city rejected | pass |
| 394 | ITN-16 edit a transport cost | pass |
| 395 | ITN-14 summary by category and by day: food 50 + activities 40 + in-city 25 + intercity 280 = 395 | pass |
| 396 | ITN-09 budget subtotal per city group | pass |
| 397 | ITN-18 summary shows the rate date | pass |
| 398 | ITN-18 totals converted into the preferred currency (EGP) | pass |
| 399 | ITN-18 conversion endpoint with rate date | pass |
| 400 | ITN-18 invalid currency code -> 400 | pass |
| 401 | ITN-07 delete a day: renumbered, re-dated, budget recalculated | pass |
| 402 | ITN-16 transport cost follows its day after renumbering | pass |
| 403 | ITN-08 reorder: day numbers, dates and groups recalculated | pass |
| 404 | ITN-08 position must exist | pass |
| 405 | ITN-16 delete a transport cost | pass |
| 406 | ITN-14 delete a budget entry | pass |
| 407 | ITN-10 delete an activity | pass |
| 408 | ITN-05 up to 60 days allowed | pass |
| 409 | ITN-05 the 61st day is rejected | pass |
| 410 | ITN-20 private itinerary is not in public search | pass |
| 411 | ITN-20 owner sets it Public | pass |
| 412 | ITN-21 found by title keyword | pass |
| 413 | ITN-21 found by country keyword | pass |
| 414 | ITN-21 duration filter (3 days): min 4 excludes, 2-3 includes | pass |
| 415 | ITN-21 country and city filters | pass |
| 416 | ITN-21 min days above max days rejected | pass |
| 417 | ITN-21 public view is read-only data with author, days and budget | pass |
| 418 | ITN-21 guests cannot clone (login required) | pass |
| 419 | ITN-20 only the owner can edit a public itinerary | pass |
| 420 | ITN-21 clone is private, complete and credits the author | pass |
| 421 | ITN-21 the clone is independent of the original | pass |
| 422 | ITN-20 back to Private -> no longer publicly viewable | pass |
| 423 | ITN-25 hotel search for a city group uses the group dates | pass |
| 424 | ITN-26 flight search to the first-day city defaults to the start date | pass |
| 425 | ITN-26 unknown origin airport rejected | pass |

### Blog details (BLG-01..12) (34/34)

| # | Check | Result |
|---|---|---|
| 426 | BLG-01 a title is required | pass |
| 427 | BLG-01 body is required | pass |
| 428 | BLG-08 a tag is limited to 30 characters | pass |
| 429 | BLG-01 guests cannot post | pass |
| 430 | BLG-01 published at once when status is Published | pass |
| 431 | BLG-04 author edits own post | pass |
| 432 | BLG-04 others cannot edit or delete my post | pass |
| 433 | BLG-05 comment limited to 500 characters | pass |
| 434 | BLG-05 guests cannot comment | pass |
| 435 | BLG-05 comments in chronological order | pass |
| 436 | BLG-07 edit own comment | pass |
| 437 | BLG-06 one like per user; count shown | pass |
| 438 | BLG-06 guests cannot like | pass |
| 439 | BLG-06 unlike | pass |
| 440 | BLG-02 guest sees post page: title, author, date, body, tags, comments | pass |
| 441 | BLG-09 search by keyword ordered by likes + comments, newest first on ties | pass |
| 442 | BLG-09 results: title, author, date and 200-character excerpt | pass |
| 443 | BLG-09 search by author name | pass |
| 444 | BLG-09 search by tag keyword | pass |
| 445 | BLG-09 no results message | pass |
| 446 | BLG-08 clicking a tag lists the published posts with it | pass |
| 447 | BLG-04 a post moved back to Draft leaves the public pages | pass |
| 448 | BLG-05 cannot comment on a draft | pass |
| 449 | BLG-03 my posts: drafts included with status, date, like and comment counts | pass |
| 450 | BLG-10 up to 5 images on a post | pass |
| 451 | BLG-10 the 6th image is rejected | pass |
| 452 | GEN-08 files over 5 MB rejected | pass |
| 453 | GEN-08 5 MB limit returns a clear message | pass |
| 454 | BLG-10 images shown on the post page | pass |
| 455 | BLG-10 remove an image | pass |
| 456 | BLG-07 delete own comment | pass |
| 457 | BLG-12 author page: name, join date, published posts only | pass |
| 458 | BLG-12 public itineraries only | pass |
| 459 | BLG-04 author deletes own post | pass |

### General (GEN-01, 02, 05, 09, 10, 11, 12) and deactivation (ACC-12) (36/36)

| # | Check | Result |
|---|---|---|
| 460 | GEN-05 lists longer than 10 rows are paginated with page size 10 | pass |
| 461 | GEN-05 page 2 returns the rest | pass |
| 462 | GEN-05 page must be a positive whole number | pass |
| 463 | GEN-02 one error shape with field-level messages | pass |
| 464 | GEN-12 predefined countries with ISO code and currency | pass |
| 465 | GEN-12 supported currencies = the codes of the Countries dataset | pass |
| 466 | GEN-12 predefined cities and attractions | pass |
| 467 | GEN-01 notifications newest first, with unread state | pass |
| 468 | GEN-01 mark one as read | pass |
| 469 | GEN-01 cannot read someone else's notification | pass |
| 470 | GEN-01 mark all as read | pass |
| 471 | GEN-09 a reason is required | pass |
| 472 | GEN-09 guests cannot report | pass |
| 473 | GEN-09 unknown content type rejected | pass |
| 474 | GEN-09 report a post | pass |
| 475 | GEN-09 report a comment | pass |
| 476 | GEN-10 only admins see the reports | pass |
| 477 | GEN-10 hide a reported comment | pass |
| 478 | GEN-10 hidden comment not shown to the public, still shown to its author | pass |
| 479 | GEN-10 hidden comment visible to admins | pass |
| 480 | GEN-10 a resolved report cannot be resolved twice | pass |
| 481 | GEN-10 delete reported content | pass |
| 482 | GEN-07 audit entry: action, admin and timestamp | pass |
| 483 | GEN-07 only admins read the audit log | pass |
| 484 | ACC-12 account deactivated | pass |
| 485 | ACC-12 session ended and login refused | pass |
| 486 | ACC-12 their posts are hidden | pass |
| 487 | ACC-12 their public itineraries are hidden | pass |
| 488 | ACC-12 their comments are shown as "Deleted user" | pass |
| 489 | ACC-12 no public author page | pass |
| 490 | ACC-14 admin sees the account as deactivated | pass |
| 491 | ACC-16 suspended user content stays visible | pass |
| 492 | ACC-16 suspended user bookings remain valid | pass |
| 493 | ACC-16 suspension is written to the audit log | pass |
| 494 | ACC-15 an admin account cannot be suspended | pass |
| 495 | ACC-16 reactivated user can log in again | pass |
