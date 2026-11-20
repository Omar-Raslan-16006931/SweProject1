/**
 * Requirement-detail checks against a RUNNING backend on http://127.0.0.1:3001 (second suite, complements run.js).
 * It exercises the edge rules of the mandatory requirements that run.js does not reach.
 * See test/e2e/README.md. NEVER point this at the shared Atlas database: it creates and modifies data.
 */
const path = require('path');
const BE = path.join(__dirname, '../../node_modules/');
const mongoose = require(BE + 'mongoose');
const Stripe = require(BE + 'stripe');
const L = require('./lib');
const { Client, check } = L;
const stripe = new Stripe('sk_test_fake_local'); // only used to sign test webhook payloads
const WH = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_local_test_secret';
const MONGO = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017/travel_test';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@travel.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin12345';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const oid = (s) => new mongoose.Types.ObjectId(s);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function webhook(type, object) {
  const payload = JSON.stringify({ id: 'evt_' + Math.random().toString(36).slice(2), object: 'event', type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WH });
  const res = await fetch(L.BASE + '/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
  return { status: res.status, data: await res.json() };
}
async function payAndConfirm(c, type, bookingId) {
  await c.post(`/bookings/${type}/${bookingId}/accept-policies`);
  const pay = await c.post('/payments', { bookingType: type, bookingId });
  await c.post(`/payments/${pay.data.id}/test-confirm`, {});
  const wh = await webhook('payment_intent.succeeded', { id: pay.data.stripePaymentIntentId, object: 'payment_intent', status: 'succeeded' });
  return { pay, wh };
}
async function newUser(name, email) {
  const c = new Client();
  await c.post('/auth/register', { name, email, password: 'Passw0rd1', acceptTerms: true });
  await c.login(email, 'Passw0rd1');
  return c;
}

(async () => {
  await mongoose.connect(MONGO);
  const db = mongoose.connection.db;
  const run = 'd' + Date.now().toString(36);
  const anon = new Client();
  let r;

  // ------------------------------------------------------------------ setup
  const admin = new Client();
  r = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('setup: admin login', r.status === 200, r.data);
  const code = 'D' + run.slice(-2).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  const airlineId = (await admin.post('/airlines', { name: `Detail Air ${run}`, code })).data.id;
  const hotelId = (await admin.post('/hotels', { name: `Detail Hotel ${run}`, address: '9 Nile St', cityId: 'cairo', countryCode: 'EG', starClass: 5, amenities: ['Pool'] })).data.id;
  await admin.post('/admin/moderators', { name: 'D Air Mod', email: `dam_${run}@ex.com`, role: 'airline_moderator', providerId: airlineId, temporaryPassword: 'Temp12345' });
  await admin.post('/admin/moderators', { name: 'D Hotel Mod', email: `dhm_${run}@ex.com`, role: 'hotel_moderator', providerId: hotelId, temporaryPassword: 'Temp12345' });
  const am = new Client(); await am.login(`dam_${run}@ex.com`, 'Temp12345'); await am.patch('/auth/change-password', { currentPassword: 'Temp12345', newPassword: 'AirMod123' });
  const hm = new Client(); await hm.login(`dhm_${run}@ex.com`, 'Temp12345'); await hm.patch('/auth/change-password', { currentPassword: 'Temp12345', newPassword: 'HotMod123' });
  const u1 = await newUser('Dina One', `du1_${run}@ex.com`);
  const u2 = await newUser('Dana Two', `du2_${run}@ex.com`);
  const u1Id = (await u1.get('/auth/me')).data.id;

  // ------------------------------------------------------------------ accounts
  console.log('\n== Accounts details (ACC-01, 04, 05, 08, 09, 10, 11, 13, 18, GEN-13)');
  r = await anon.post('/auth/register', { name: '', email: `x_${run}@ex.com`, password: 'Passw0rd1', acceptTerms: true });
  check('ACC-01 name is required', r.status === 400 && r.data.errors?.some((e) => e.field === 'name'), r.data);
  r = await anon.post('/auth/register', { name: 'X', email: 'not-an-email', password: 'Passw0rd1', acceptTerms: true });
  check('ACC-01 invalid email format -> field error', r.status === 400 && r.data.errors?.some((e) => e.field === 'email'), r.data);
  r = await anon.post('/auth/register', { name: 'X', email: `x_${run}@ex.com`, password: 'onlyletters', acceptTerms: true });
  check('ACC-01 password needs a digit', r.status === 400 && r.data.errors?.some((e) => e.field === 'password'), r.data);
  r = await anon.post('/auth/register', { name: 'X', email: `x_${run}@ex.com`, password: '1234567890', acceptTerms: true });
  check('ACC-01 password needs a letter', r.status === 400, r.data);
  r = await anon.post('/auth/register', { name: 'X', email: `DU1_${run}@EX.com`, password: 'Passw0rd1', acceptTerms: true });
  check('ACC-01 duplicate email is case-insensitive', r.status === 409, r.data);
  r = await anon.post('/auth/register', { name: 'X', email: `adm_${run}@ex.com`, password: 'Passw0rd1', acceptTerms: true, role: 'admin' });
  check('ACC-18 no admin self-registration (role field refused)', r.status === 400, r.data);
  const dbUser = await db.collection('users').findOne({ _id: oid(u1Id) });
  check('GEN-13 password stored only as a salted bcrypt hash', /^\$2[aby]\$\d\d\$/.test(dbUser.passwordHash) && !('password' in dbUser), Object.keys(dbUser));
  r = await u1.get('/auth/me');
  check('GEN-13 password hash never returned', !JSON.stringify(r.data).toLowerCase().includes('hash') && !JSON.stringify(r.data).includes('$2'), r.data);
  r = await anon.post('/auth/login', { email: `nobody_${run}@ex.com`, password: 'Passw0rd1' });
  const unknown = r.data.message;
  r = await anon.post('/auth/login', { email: `du2_${run}@ex.com`, password: 'WrongPass1' });
  check('ACC-04 same generic message for unknown email and wrong password', r.status === 401 && r.data.message === unknown && unknown === 'Invalid email or password', [unknown, r.data]);
  // lockout counter resets on success
  const lk = `lock_${run}@ex.com`; const lc = await newUser('Lock', lk);
  for (let i = 0; i < 4; i++) await anon.post('/auth/login', { email: lk, password: 'bad' + i });
  check('ACC-05 4 failures do not lock', (await new Client().login(lk, 'Passw0rd1')).status === 200);
  for (let i = 0; i < 4; i++) await anon.post('/auth/login', { email: lk, password: 'bad' + i });
  check('ACC-05 counter was reset by the successful login', (await new Client().login(lk, 'Passw0rd1')).status === 200);
  for (let i = 0; i < 5; i++) r = await anon.post('/auth/login', { email: lk, password: 'bad' + i });
  check('ACC-05 5th consecutive failure locks for 15 minutes', r.status === 423 && r.data.code === 'ACCOUNT_LOCKED' && /locked for 15 minutes/i.test(r.data.message), r.data);
  const lu = await db.collection('users').findOne({ email: lk });
  const mins = (new Date(lu.lockUntil) - Date.now()) / 60000;
  check('ACC-05 lock lasts 15 minutes', mins > 14 && mins <= 15, mins);
  r = await new Client().login(lk, 'Passw0rd1');
  check('ACC-05 locked account refuses even the right password, with a lockout message', r.status === 423 && /locked/i.test(r.data.message), r.data);
  void lc;
  r = await anon.get('/flight-bookings');
  check('ACC-10 guest on a restricted action -> 401 AUTH_REQUIRED', r.status === 401 && r.data.code === 'AUTH_REQUIRED', r.data);
  r = await u1.patch('/auth/change-password', { currentPassword: 'Passw0rd1', newPassword: 'weak' });
  check('ACC-08 weak new password rejected', r.status === 400, r.data);
  r = await u1.patch('/users/me', { phone: 'abc' });
  check('ACC-09 invalid phone rejected with field error', r.status === 400 && r.data.errors?.some((e) => e.field === 'phone'), r.data);
  r = await u1.patch('/users/me', { name: 'Dina Uno', phone: '+201001234567', preferredCurrency: 'egp' });
  check('ACC-09 valid profile saved', r.status === 200 && r.data.name === 'Dina Uno' && r.data.phone === '+201001234567' && r.data.preferredCurrency === 'EGP', r.data);
  r = await u1.patch('/users/me', { name: 'Hacker', phone: 'nope' });
  check('ACC-09 nothing saved when any field is invalid', r.status === 400 && (await u1.get('/users/me')).data.name === 'Dina Uno', r.data);
  r = await u1.patch('/users/me', { email: 'other@ex.com' });
  check('ACC-09 email cannot be changed through the profile', r.status === 400, r.data);
  r = await admin.post('/admin/moderators', { name: 'Bad', email: `bm_${run}@ex.com`, role: 'hotel_moderator', providerId: airlineId, temporaryPassword: 'Temp12345' });
  check('ACC-13 moderator must be linked to an existing provider of the right type', r.status === 400 && r.data.errors?.some((e) => e.field === 'providerId'), r.data);
  r = await admin.post('/admin/moderators', { name: 'Bad', email: `bm_${run}@ex.com`, role: 'admin', providerId: airlineId, temporaryPassword: 'Temp12345' });
  check('ACC-18 admin cannot be created as a moderator role', r.status === 400, r.data);
  r = await u1.post('/admin/moderators', { name: 'Bad', email: `bm_${run}@ex.com`, role: 'hotel_moderator', providerId: hotelId, temporaryPassword: 'Temp12345' });
  check('ACC-13 only admins create moderators (403)', r.status === 403, r.data);
  r = await am.get('/admin/accounts');
  check('ACC-14 moderators cannot open the admin accounts list', r.status === 403);
  r = await admin.get(`/admin/accounts?q=${run}&status=active&role=user`);
  check('ACC-14 list shows name, email, role, status, registration date', r.data.items.length >= 2 && r.data.items.every((a) => a.name && a.email && a.role === 'user' && a.status === 'active' && a.registeredAt), r.data.items[0]);

  // ------------------------------------------------------------------ flights
  console.log('\n== Flights details (FLT-02..17, 30, GEN-06)');
  r = await anon.get('/airports');
  const cai = r.data.find((a) => a._id === 'CAI');
  check('FLT-02 predefined airports carry city, country and IANA time zone', cai && cai.cityId === 'cairo' && cai.countryCode === 'EG' && cai.timeZone === 'Africa/Cairo', cai);
  await am.put(`/airlines/${airlineId}/baggage-policy`, { extraBagPrice: 25, maxExtraBags: 1 });
  check('FLT-08 extra bag price must be > 0', (await am.put(`/airlines/${airlineId}/baggage-policy`, { extraBagPrice: 0, maxExtraBags: 1 })).status === 400);
  check('FLT-09 refund percent must be 0-100', (await am.put(`/airlines/${airlineId}/cancellation-policy`, { tiers: [{ daysBefore: 5, refundPercent: 120 }] })).status === 400);
  check('FLT-09 days-before must be a whole number >= 0', (await am.put(`/airlines/${airlineId}/cancellation-policy`, { tiers: [{ daysBefore: 2.5, refundPercent: 50 }] })).status === 400);
  await am.put(`/airlines/${airlineId}/cancellation-policy`, { tiers: [{ daysBefore: 14, refundPercent: 100 }, { daysBefore: 7, refundPercent: 60 }, { daysBefore: 2, refundPercent: 20 }] });
  const mk = (num, day, extra = {}) => am.post('/flights', { flightNumber: num, departureAirport: 'CAI', arrivalAirport: 'DXB', departureLocal: `${day}T08:00`, arrivalLocal: `${day}T13:30`,
    cabins: [{ class: 'Economy', seats: 20, price: 200, freeBags: 1, maxBagWeightKg: 23 }, { class: 'Business', seats: 4, price: 700, freeBags: 2, maxBagWeightKg: 32 }], ...extra });
  r = await am.post('/flights', { flightNumber: 'DZ0', departureAirport: 'CAI', arrivalAirport: 'XXX', departureLocal: `${plusDays(30)}T08:00`, arrivalLocal: `${plusDays(30)}T13:30` });
  check('FLT-02 unknown airport rejected', r.status === 400, r.data);
  r = await mk('DZ1', plusDays(30), { cabins: [{ class: 'Economy', seats: 0, price: 200, freeBags: 1, maxBagWeightKg: 23 }] });
  check('FLT-04 seat count must be > 0', r.status === 400, r.data);
  r = await mk('DZ1', plusDays(30), { cabins: [{ class: 'Economy', seats: 10.5, price: 200, freeBags: 1, maxBagWeightKg: 23 }] });
  check('FLT-04 seat count must be a whole number', r.status === 400, r.data);
  r = await mk('DZ1', plusDays(30), { cabins: [{ class: 'Economy', seats: 10, price: 0, freeBags: 1, maxBagWeightKg: 23 }] });
  check('FLT-04 price must be > 0', r.status === 400, r.data);
  r = await mk('DZ1', plusDays(30), { cabins: [{ class: 'Cargo', seats: 10, price: 10, freeBags: 1, maxBagWeightKg: 23 }] });
  check('FLT-04 only Economy / Premium Economy / Business / First', r.status === 400, r.data);
  const f20 = (await mk('DZ1', plusDays(20))).data;   // 20 days out -> 100%
  const f10 = (await mk('DZ2', plusDays(10))).data;   // 10 days out -> 60%
  const f4 = (await mk('DZ3', plusDays(4))).data;     //  4 days out -> 20%
  const f1 = (await mk('DZ4', plusDays(1))).data;     //  1 day out  -> no tier -> 0%
  check('FLT-03 flights created', [f20, f10, f4, f1].every((f) => f?.id), [f20, f10, f4, f1].map((f) => f?.id || f));
  r = await mk('DZ1', plusDays(21));
  check('FLT-03 same flight number on another date is allowed', r.status === 201, r.data);
  check('GEN-06 local times use each airport zone (CAI 08:00 -> DXB 13:30 = 3h30)', f20.departure.localTime.endsWith('T08:00') && f20.arrival.localTime.endsWith('T13:30') && f20.durationMinutes === 210
    && f20.departure.timeZone === 'Africa/Cairo' && f20.arrival.timeZone === 'Asia/Dubai' && f20.departure.utc.endsWith('T06:00:00.000Z'), f20);
  r = await u1.post('/flights', { flightNumber: 'ZZ9' });
  check('FLT-03 only airline moderators create flights', r.status === 403);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=1&sortBy=price&sortOrder=desc`);
  const prices = r.data.outbound.items.map((x) => x.fromPrice ?? Math.min(...x.cabins.map((c) => c.price)));
  check('FLT-15 sort by price (descending)', r.status === 200 && prices.length >= 1 && prices.every((p, i) => i === 0 || prices[i - 1] >= p), prices);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=1&sortBy=duration`);
  check('FLT-15 sort by duration', r.status === 200 && r.data.outbound.items.every((x, i, a) => i === 0 || a[i - 1].durationMinutes <= x.durationMinutes), r.data.outbound.items.map((x) => x.durationMinutes));
  check('FLT-15 unknown sort field rejected', (await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=1&sortBy=colour`)).status === 400);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=1&minPrice=600&maxPrice=800`);
  const hit = r.data.outbound.items.find((x) => x.id === f20.id);
  check('FLT-15 inclusive price filter keeps only matching cabins', hit && hit.cabins.length === 1 && hit.cabins[0].class === 'Business', hit);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=1&minPrice=200&maxPrice=200`);
  check('FLT-15 price bounds are inclusive', r.data.outbound.items.some((x) => x.id === f20.id && x.cabins.some((c) => c.class === 'Economy')), r.data.outbound.items);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=1&tripType=round-trip&returnDate=${plusDays(19)}`);
  check('FLT-12a return date before departure rejected', r.status === 400, r.data);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=1&tripType=round-trip`);
  check('FLT-12a round-trip needs a return date', r.status === 400, r.data);
  r = await anon.get(`/flights/search?from=CAI&to=CAI&date=${plusDays(20)}&adults=1`);
  check('FLT-11 same departure and arrival airport rejected', r.status === 400, r.data);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=0`);
  check('FLT-12b at least one adult', r.status === 400, r.data);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=3&children=2&cabinClass=Business`);
  check('FLT-11 seats must cover adults + children (5 > 4 Business seats)', !r.data.outbound.items.some((x) => x.id === f20.id), r.data.outbound.items);
  r = await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(20)}&adults=2&infants=2&cabinClass=Business`);
  check('FLT-12b infants do not occupy seats', r.data.outbound.items.some((x) => x.id === f20.id), r.data.outbound.items);
  r = await anon.get(`/flights/${f20.id}`);
  check('FLT-17 details: airline, number, airports, local times, duration, price, baggage, seats, policy',
    r.data.airline?.name && r.data.flightNumber === 'DZ1' && r.data.departure.airport === 'CAI' && r.data.cabins.every((c) => c.price > 0 && c.freeBags >= 0 && c.maxBagWeightKg > 0 && c.seatsRemaining > 0)
    && r.data.cancellationPolicy.length === 3 && r.data.baggagePolicy.extraBagPrice === 25, r.data);

  // ------------------------------------------------------------------ flight booking
  console.log('\n== Flight booking details (FLT-19..26, 30, GEN-11, PAY-04)');
  const adult = (i, extra = {}) => ({ fullName: `Adult ${i}`, dateOfBirth: '1988-05-05', passportNumber: `AD${i}0000`, type: 'adult', ...extra });
  const body = (flight, passengers, cabin = 'Economy') => ({ outboundFlightId: flight.id, outboundCabinClass: cabin, passengers });
  r = await u1.post('/flight-bookings', body(f20, [adult(1, { dateOfBirth: plusDays(5) })]));
  check('FLT-19 date of birth in the future rejected', r.status === 400, r.data);
  r = await u1.post('/flight-bookings', body(f20, [adult(1, { fullName: '' })]));
  check('FLT-19 passenger name required', r.status === 400, r.data);
  r = await u1.post('/flight-bookings', body(f20, [adult(1, { passportNumber: '12' })]));
  check('FLT-19 passport format validated', r.status === 400, r.data);
  r = await u1.post('/flight-bookings', body(f20, [adult(1, { extraBags: [{ weightKg: 20 }, { weightKg: 20 }] })]));
  check('FLT-19 extra bags limited to the airline maximum (1)', r.status === 400, r.data);
  r = await u1.post('/flight-bookings', body(f20, [{ fullName: 'Kid', dateOfBirth: '2019-01-01', passportNumber: 'KID0001', type: 'child' }]));
  check('FLT-12b a booking needs at least one adult', r.status === 400, r.data);
  r = await u1.post('/flight-bookings', body(f20, [adult(1), { fullName: 'Old Baby', dateOfBirth: plusDays(-900), passportNumber: 'BB00001', type: 'infant' }]));
  check('FLT-12b infant must be under 2 on the travel date', r.status === 400, r.data);
  r = await u1.post('/flight-bookings', body(f20, [adult(1), { fullName: 'B1', dateOfBirth: plusDays(-100), passportNumber: 'BB00001', type: 'infant' }, { fullName: 'B2', dateOfBirth: plusDays(-100), passportNumber: 'BB00002', type: 'infant' }]));
  check('FLT-12b infants may not outnumber adults', r.status === 400, r.data);
  const kid = { fullName: 'Kid', dateOfBirth: '2019-01-01', passportNumber: 'KID0001', type: 'child' };
  const baby = { fullName: 'Baby', dateOfBirth: plusDays(-100), passportNumber: 'BB00001', type: 'infant' };
  r = await u1.post('/flight-bookings', body(f20, [adult(1, { extraBags: [{ weightKg: 23 }] }), adult(2), kid, baby]));
  check('FLT-21 summary = 3 seats x 200 + 10% infant 20 + 1 extra bag 25 = 645', r.status === 200 && r.data.fareTotal === 620 && r.data.baggageTotal === 25 && r.data.total === 645 && r.data.segments[0].seats === 3 && r.data.passengerCounts.infant === 1, r.data);
  check('PAY-04 totals are in the single platform currency', r.data.currency === 'USD', r.data.currency);
  check('FLT-21 summary shows baggage allowance and nothing is held yet', r.data.segments[0].freeBags === 1 && r.data.segments[0].maxBagWeightKg === 23
    && (await anon.get(`/flights/${f20.id}`)).data.cabins.find((c) => c.class === 'Economy').seatsRemaining === 20, r.data.segments);
  r = await u1.post('/flight-bookings/hold', { outboundFlightId: f20.id, outboundCabinClass: 'Economy', returnFlightId: f10.id, returnCabinClass: 'Economy', passengers: [adult(1)] });
  check('FLT-12a return flight must fly back and depart after the outbound arrives', r.status === 400, r.data);
  // hold + lifecycle
  r = await u1.post('/flight-bookings/hold', body(f20, [adult(1), adult(2), kid, baby]));
  check('FLT-22 hold creates Pending Payment', r.status === 201 && r.data.status === 'Pending Payment' && r.data.total === 620, r.data);
  const bk = r.data.id;
  const left = (new Date(r.data.holdExpiresAt) - Date.now()) / 60000;
  check('FLT-22 hold lasts 10 minutes', left > 9 && left <= 10, left);
  check('FLT-22 held seats leave the inventory at once', (await anon.get(`/flights/${f20.id}`)).data.cabins.find((c) => c.class === 'Economy').seatsRemaining === 17);
  check('GEN-11 a Pending Payment booking cannot be cancelled', (await u1.post(`/flight-bookings/${bk}/cancel`)).status === 409);
  check('FLT-23 no e-ticket before confirmation', (await u1.get(`/flight-bookings/${bk}/e-ticket`)).status === 409);
  check('ACC-11 another user cannot pay or accept policies for my booking', (await u2.post(`/bookings/flight/${bk}/accept-policies`)).status === 404
    && (await u2.post('/payments', { bookingType: 'flight', bookingId: bk })).status === 404);
  check('ACC-11 airline moderator of that flight can view the booking', (await am.get(`/flight-bookings/${bk}`)).status === 200);
  check('ACC-11 a hotel moderator cannot view a flight booking', [403, 404].includes((await hm.get(`/flight-bookings/${bk}`)).status));
  check('ACC-11 admin can view the booking', (await admin.get(`/flight-bookings/${bk}`)).status === 200);
  const pc = await payAndConfirm(u1, 'flight', bk);
  r = await u1.get(`/flight-bookings/${bk}`);
  check('FLT-23 Confirmed with reference after the verified webhook', r.data.status === 'Confirmed' && /^FL-/.test(r.data.reference) && r.data.payment?.status === 'succeeded', r.data);
  check('PAY-04 payment charged in USD', pc.pay.data.currency === 'USD' && pc.pay.data.amount === 620, pc.pay.data);
  check('PAY-01 a replayed webhook does not confirm twice', (await webhook('payment_intent.succeeded', { id: pc.pay.data.stripePaymentIntentId, object: 'payment_intent', status: 'succeeded' })).status === 200
    && (await anon.get(`/flights/${f20.id}`)).data.cabins.find((c) => c.class === 'Economy').seatsRemaining === 17);
  check('PAY-01 a paid booking cannot be paid again', (await u1.post('/payments', { bookingType: 'flight', bookingId: bk })).status === 409);
  r = await u1.get('/flight-bookings?group=upcoming');
  check('FLT-25 upcoming list shows reference, flight, date, passengers, cabin, status', r.data.items.some((b) => b.id === bk && /^FL-/.test(b.reference) && b.flight === 'DZ1 CAI-DXB' && b.date.startsWith(plusDays(20)) && b.passengers === 4 && b.cabin === 'Economy' && b.total === 620 && b.status === 'Confirmed'), r.data.items[0]);
  r = await u1.get(`/flight-bookings/${bk}/cancellation-preview`);
  check('FLT-26 20 days before -> 14-day tier -> 100%', r.data.refundPercent === 100 && r.data.refundAmount === 620, r.data);
  // refund tiers
  const bookAndPay = async (c, flight, pax) => { const h = await c.post('/flight-bookings/hold', body(flight, pax)); await payAndConfirm(c, 'flight', h.data.id); return h.data.id; };
  const b10 = await bookAndPay(u2, f10, [adult(3)]);
  r = await u2.get(`/flight-bookings/${b10}/cancellation-preview`);
  check('FLT-26 10 days before -> 7-day tier -> 60% of 200 = 120', r.data.refundPercent === 60 && r.data.refundAmount === 120, r.data);
  const b4 = await bookAndPay(u2, f4, [adult(4)]);
  r = await u2.get(`/flight-bookings/${b4}/cancellation-preview`);
  check('FLT-26 4 days before -> 2-day tier -> 20%', r.data.refundPercent === 20 && r.data.refundAmount === 40, r.data);
  const b1 = await bookAndPay(u2, f1, [adult(5)]);
  r = await u2.get(`/flight-bookings/${b1}/cancellation-preview`);
  check('FLT-09 no matching tier -> 0% refund', r.data.refundPercent === 0 && r.data.refundAmount === 0, r.data);
  r = await u2.post(`/flight-bookings/${b1}/cancel`);
  console.log('   (0% cancel)', r.status, r.data.refundAmount, r.data.booking?.refund);
  check('FLT-26 cancel with 0% refund: Cancelled, no refund record', [200, 201].includes(r.status) && r.data.booking.status === 'Cancelled' && r.data.refundAmount === 0 && !r.data.booking.refund && (await db.collection('refunds').countDocuments({ booking: oid(b1) })) === 0, r.data);
  check('GEN-11 a Cancelled booking cannot be cancelled again', (await u2.post(`/flight-bookings/${b1}/cancel`)).status === 409);
  r = await u2.post(`/flight-bookings/${b10}/cancel`);
  const refund = r.data.booking.refund;
  check('PAY-03 positive refund recorded as Pending for the refund amount', refund?.status === 'Pending' && refund.amount === 120, r.data);
  check('PAY-03 refund status endpoint (owner only)', (await u2.get(`/refunds/${refund.id}`)).data.status === 'Pending' && (await u1.get(`/refunds/${refund.id}`)).status === 404);
  const rf = await db.collection('refunds').findOne({ _id: oid(refund.id) });
  await webhook('refund.updated', { id: rf.stripeRefundId, object: 'refund', status: 'succeeded' });
  r = await u2.get(`/flight-bookings/${b10}`);
  check('PAY-03 refund shown as Refunded on booking details + notification', r.data.refund.status === 'Refunded'
    && (await u2.get('/notifications')).data.items.some((n) => n.type === 'refund'), r.data.refund);
  check('FLT-26 cancelled seats are available again', (await anon.get(`/flights/${f10.id}`)).data.cabins.find((c) => c.class === 'Economy').seatsRemaining === 20);
  check('GEN-01 cancellation notification', (await u2.get('/notifications')).data.items.some((n) => n.type === 'booking_cancelled'));
  // moderator views
  r = await am.get(`/flights/${f20.id}/bookings`);
  const row = r.data.items.find((x) => x.passengers.some((p) => p.fullName === 'Adult 1'));
  check('FLT-29 moderator sees passengers, cabin, seats, status + seats remaining per cabin', row && row.cabin === 'Economy' && row.seats === 3 && row.status === 'Confirmed' && row.passengers.length === 4
    && r.data.seatsRemaining.find((c) => c.class === 'Economy').remaining === 17, r.data);
  r = await am.get(`/flights/${f20.id}/passengers/export`);
  const csv = r.data.toString();
  check('FLT-29 CSV has a header and one line per passenger', csv.split('\n')[0].includes('"Passenger"') && csv.trim().split('\n').length === 5 && csv.includes('Adult 1') && csv.includes('Baby'), csv.slice(0, 300));
  check('FLT-29 another airline cannot see these bookings', [403, 404].includes((await hm.get(`/flights/${f20.id}/bookings`)).status));
  r = await am.patch(`/flights/${f20.id}/cabins/${f20.cabins.find((c) => c.class === 'Economy').id}`, { price: 250 });
  check('FLT-05 price edit applies to new bookings only', r.status === 200 && (await u1.get(`/flight-bookings/${bk}`)).data.total === 620, r.data);
  // departed flight (FLT-30)
  // move flight DZ3 (and its booking snapshot) into the past, as if it had just taken off
  const gone = new Date(Date.now() - 60000);
  await db.collection('flights').updateOne({ _id: oid(f4.id) }, { $set: { departureTime: gone, arrivalTime: new Date(Date.now() + 3600000) } });
  await db.collection('flight_bookings').updateOne({ _id: oid(b4) }, { $set: { 'segments.0.departureTime': gone, travelDate: gone, lastDepartureTime: gone } });
  r = await anon.get(`/flights/${f4.id}`);
  check('FLT-30 flight is Departed once its departure time has passed', r.data.status === 'Departed' && r.data.bookable === false, r.data.status);
  check('FLT-30 departed flight cannot be booked', [400, 409].includes((await u1.post('/flight-bookings/hold', body(f4, [adult(7)]))).status));
  check('FLT-30 departed flight is not returned by search', !(await anon.get(`/flights/search?from=CAI&to=DXB&date=${plusDays(0)}&adults=1`)).data.outbound.items.some((x) => x.id === f4.id));
  check('FLT-26 booking cannot be cancelled after departure', (await u2.post(`/flight-bookings/${b4}/cancel`)).status === 409);
  check('FLT-30 departed flight cannot be edited or cancelled by the airline', [400, 409].includes((await am.patch(`/flights/${f4.id}`, { departureLocal: `${plusDays(6)}T08:00`, arrivalLocal: `${plusDays(6)}T13:30` })).status)
    && (await am.post(`/flights/${f4.id}/cancel`)).status === 409);
  r = await u2.get(`/flight-bookings/${b4}`);
  check('GEN-11 Confirmed -> Completed after the flight departed', r.data.status === 'Completed', r.data.status);
  check('FLT-25 completed booking is listed under past', (await u2.get('/flight-bookings?group=past')).data.items.some((b) => b.id === b4));
  // hold expiry by the scheduler
  r = await u2.post('/flight-bookings/hold', body(f20, [adult(8)], 'Business'));
  const exp = r.data.id;
  await db.collection('flight_bookings').updateOne({ _id: oid(exp) }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
  check('PAY-01 payment refused once the hold has expired', (await u2.post(`/bookings/flight/${exp}/accept-policies`)).status === 409 || (await u2.post('/payments', { bookingType: 'flight', bookingId: exp })).status === 409);
  let st; for (let i = 0; i < 40; i++) { st = (await u2.get(`/flight-bookings/${exp}`)).data.status; if (st === 'Expired') break; await sleep(2000); }
  check('GEN-11 Pending Payment -> Expired when the hold runs out', st === 'Expired', st);
  check('FLT-22 expired hold returns the seat', (await anon.get(`/flights/${f20.id}`)).data.cabins.find((c) => c.class === 'Business').seatsRemaining === 4);
  check('FLT-25 expired bookings are not listed as upcoming', !(await u2.get('/flight-bookings?group=upcoming')).data.items.some((b) => b.id === exp));

  // ------------------------------------------------------------------ hotels
  console.log('\n== Hotels details (HTL-01..22)');
  r = await hm.patch(`/hotels/${hotelId}`, { description: 'By the Nile', starClass: 4, amenities: ['Pool', 'Spa'] });
  check('HTL-01 moderator edits own hotel profile', r.status === 200 && r.data.starClass === 4 && r.data.amenities.length === 2, r.data);
  check('HTL-01 star class limited to 1-5', (await hm.patch(`/hotels/${hotelId}`, { starClass: 6 })).status === 400);
  check('HTL-01 users cannot create hotels', (await u1.post('/hotels', { name: 'x', address: 'y', cityId: 'cairo', countryCode: 'EG', starClass: 3 })).status === 403);
  r = await hm.put(`/hotels/${hotelId}/policies`, { checkInTime: '25:00', checkOutTime: '11:00' });
  check('HTL-09 check-in time must be HH:mm', r.status === 400, r.data);
  r = await hm.put(`/hotels/${hotelId}/policies`, { cancellationTiers: [{ daysBefore: 3, refundPercent: 50 }, { daysBefore: 3, refundPercent: 10 }] });
  check('HTL-10 thresholds must be unique', r.status === 400, r.data);
  await hm.put(`/hotels/${hotelId}/policies`, { checkInTime: '15:00', checkOutTime: '12:00', cancellationTiers: [{ daysBefore: 10, refundPercent: 100 }, { daysBefore: 3, refundPercent: 50 }] });
  check('HTL-03 price per night must be > 0', (await hm.post(`/hotels/${hotelId}/rooms`, { number: 'Z', type: 'Std', beds: 1, maxOccupancy: 1, pricePerNight: 0 })).status === 400);
  check('HTL-03 max occupancy must be >= 1', (await hm.post(`/hotels/${hotelId}/rooms`, { number: 'Z', type: 'Std', beds: 1, maxOccupancy: 0, pricePerNight: 10 })).status === 400);
  const rooms = [];
  for (let i = 1; i <= 12; i++) rooms.push((await hm.post(`/hotels/${hotelId}/rooms`, { number: String(100 + i), type: i <= 2 ? 'Suite' : 'Double', beds: 1, maxOccupancy: i <= 2 ? 3 : 2, pricePerNight: 100 + i })).data);
  check('HTL-03 12 rooms created', rooms.every((x) => x?.id), rooms.map((x) => x?.id || x));
  check('HTL-04 range end before start rejected', (await hm.post(`/hotels/${hotelId}/rooms/${rooms[0].id}/availability`, { from: plusDays(40), to: plusDays(30) })).status === 400);
  for (const rm of rooms) await hm.post(`/hotels/${hotelId}/rooms/${rm.id}/availability`, { from: plusDays(1), to: plusDays(60) });
  r = await hm.post(`/hotels/${hotelId}/rooms/${rooms[0].id}/availability`, { from: plusDays(61), to: plusDays(70) });
  check('HTL-04 a second, non-overlapping range is accepted', r.status === 201 && r.data.availability.length === 2, r.data);
  const ci = plusDays(20), co = plusDays(23);
  r = await anon.get(`/hotels/${hotelId}/rooms/available?checkIn=${ci}&checkOut=${co}`);
  check('GEN-05 free rooms: 12 results -> page 1 has 10, 2 pages', r.data.rooms.length === 10 && r.data.total === 12 && r.data.totalPages === 2, r.data);
  r = await anon.get(`/hotels/${hotelId}/rooms/available?checkIn=${ci}&checkOut=${co}&page=2`);
  check('GEN-05 free rooms page 2 has the remaining 2', r.data.rooms.length === 2 && r.data.page === 2, r.data);
  check('HTL-15 each free room shows type, beds, occupancy, nightly price and stay total', r.data.rooms.every((x) => x.type && x.beds >= 1 && x.maxOccupancy >= 1 && x.totalStayPrice === x.pricePerNight * 3), r.data.rooms);
  r = await hm.get(`/hotels/${hotelId}/availability?from=${ci}&to=${co}`);
  check('GEN-05 room-status grid: 10 rooms per page', r.data.rooms.length === 10 && r.data.total === 12, { n: r.data.rooms?.length, total: r.data.total });
  r = await anon.get(`/hotels/search?cityId=cairo&checkIn=${plusDays(-1)}&checkOut=${co}&guests=1`);
  check('HTL-11 check-in in the past rejected', r.status === 400, r.data);
  r = await anon.get(`/hotels/search?checkIn=${ci}&checkOut=${co}&guests=1`);
  check('HTL-11 a city or country is required', r.status === 400, r.data);
  r = await anon.get(`/hotels/search?cityId=cairo&checkIn=${ci}&checkOut=${co}&guests=2&minPrice=500&maxPrice=100`);
  check('HTL-12 min price above max price rejected', r.status === 400, r.data);
  r = await anon.get(`/hotels/search?cityId=cairo&checkIn=${ci}&checkOut=${co}&guests=2&minRating=6`);
  check('HTL-12 rating filter limited to 1-5', r.status === 400, r.data);
  r = await anon.get(`/hotels/search?countryCode=EG&checkIn=${ci}&checkOut=${co}&guests=2&rooms=13`);
  check('HTL-11 hotel excluded when it has fewer free rooms than requested', !r.data.items.some((h) => h.id === hotelId), r.data.items);
  r = await anon.get(`/hotels/search?countryCode=EG&checkIn=${ci}&checkOut=${co}&guests=6&rooms=2`);
  check('HTL-11 found by country when 2 rooms can host 6 guests (3+3)', r.data.items.some((h) => h.id === hotelId), r.data.items);
  r = await anon.get(`/hotels/search?cityId=cairo&checkIn=${ci}&checkOut=${co}&guests=2&minPrice=101&maxPrice=101&sortBy=price&sortOrder=asc`);
  check('HTL-12 price filter uses the lowest available room price (inclusive)', r.data.items.find((h) => h.id === hotelId)?.pricePerNight === 101, r.data.items);
  r = await anon.get(`/hotels/search?cityId=cairo&checkIn=${ci}&checkOut=${co}&guests=2&minPrice=102`);
  check('HTL-12 hotel excluded when its lowest price is below the minimum', !r.data.items.some((h) => h.id === hotelId), r.data.items);
  r = await anon.get(`/hotels/search?countryCode=EG&checkIn=${ci}&checkOut=${co}&guests=1&sortBy=price&sortOrder=desc`);
  check('HTL-12 sort by price (descending)', r.data.items.every((h, i, a) => i === 0 || a[i - 1].pricePerNight >= h.pricePerNight), r.data.items.map((h) => h.pricePerNight));
  // booking rules
  const hb = (roomsReq, a = ci, b = co) => u1.post('/hotel-bookings', { hotelId, checkIn: a, checkOut: b, rooms: roomsReq });
  check('HTL-16 same room twice in one request rejected', (await hb([{ roomId: rooms[0].id, adults: 1 }, { roomId: rooms[0].id, adults: 1 }])).status === 400);
  check('HTL-16 child age above 17 rejected', (await hb([{ roomId: rooms[0].id, adults: 1, childrenAges: [18] }])).status === 400);
  check('HTL-16 check-out must be after check-in', (await hb([{ roomId: rooms[0].id, adults: 1 }], co, ci)).status === 400);
  check('HTL-16 dates outside the bookable range rejected', (await hb([{ roomId: rooms[1].id, adults: 1 }], plusDays(59), plusDays(63))).status === 409);
  r = await hb([{ roomId: rooms[0].id, adults: 2, childrenAges: [4] }, { roomId: rooms[2].id, adults: 2 }]);
  check('HTL-16/17 one reservation for 2 rooms: total = (101 + 103) x 3 nights, hold 10 min', r.status === 201 && r.data.total === 612 && r.data.nights === 3 && r.data.rooms.length === 2
    && r.data.status === 'Pending Payment' && r.data.currency === 'USD', r.data);
  const hres = r.data.id;
  check('HTL-18 a held room cannot be taken by someone else', (await u2.post('/hotel-bookings', { hotelId, checkIn: plusDays(22), checkOut: plusDays(25), rooms: [{ roomId: rooms[2].id, adults: 1 }, { roomId: rooms[3].id, adults: 1 }] })).status === 409);
  check('HTL-18 the rejected request held nothing (room 4 still free)', (await anon.get(`/hotels/${hotelId}/rooms/available?checkIn=${plusDays(22)}&checkOut=${plusDays(25)}`)).data.total === 10);
  r = await u1.get(`/bookings/hotel/${hres}/policies`);
  check('PAY-02 hotel policies shown: cancellation + check-in/check-out', r.data.cancellationPolicy?.length === 2 && r.data.checkInTime === '15:00' && r.data.checkOutTime === '12:00', r.data);
  await payAndConfirm(u1, 'hotel', hres);
  r = await u1.get(`/hotel-bookings/${hres}`);
  check('HTL-17 confirmation: reference, hotel, rooms, dates, total', r.data.status === 'Confirmed' && /^HT-/.test(r.data.reference) && r.data.hotel.name && r.data.rooms.length === 2 && r.data.checkIn === ci && r.data.total === 612, r.data);
  check('ACC-11 hotel moderator of that hotel can view; airline moderator cannot', (await hm.get(`/hotel-bookings/${hres}`)).status === 200 && [403, 404].includes((await am.get(`/hotel-bookings/${hres}`)).status));
  check('HTL-06 block over a Confirmed reservation rejected', (await hm.patch(`/hotels/${hotelId}/rooms/${rooms[0].id}/availability`, { action: 'block', from: plusDays(21), to: plusDays(21) })).status === 409);
  r = await hm.patch(`/hotels/${hotelId}/rooms/${rooms[5].id}/availability`, { action: 'block', from: ci, to: plusDays(21), reason: 'paint' });
  check('HTL-06 block free dates', r.status === 200, r.data);
  check('HTL-06 blocked room excluded from those dates', (await anon.get(`/hotels/${hotelId}/rooms/available?checkIn=${ci}&checkOut=${co}`)).data.total === 9);
  check('HTL-18 blocked dates cannot be booked', (await hb([{ roomId: rooms[5].id, adults: 1 }])).status === 409);
  r = await hm.get(`/hotels/${hotelId}/availability?from=${ci}&to=${ci}`);
  const g = (id) => r.data.rooms.find((x) => x.roomId === id)?.days[0];
  check('HTL-08 grid shows Booked (with reference), Blocked and Available', g(rooms[0].id)?.status === 'Booked' && /^HT-/.test(g(rooms[0].id).reservationReference) && g(rooms[5].id)?.status === 'Blocked' && g(rooms[1].id)?.status === 'Available', r.data.rooms.slice(0, 6));
  r = await hm.patch(`/hotels/${hotelId}/rooms/${rooms[6].id}`, { active: false });
  check('HTL-06 deactivate a room without reservations', r.status === 200 && r.data.active === false, r.data);
  check('HTL-06 deactivated room excluded from search', (await anon.get(`/hotels/${hotelId}/rooms/available?checkIn=${ci}&checkOut=${co}`)).data.total === 8);
  check('HTL-06 a never-reserved room can be deleted', (await hm.del(`/hotels/${hotelId}/rooms/${rooms[7].id}`)).status === 200);
  check('HTL-05 edit beds, occupancy and price', (await hm.patch(`/hotels/${hotelId}/rooms/${rooms[8].id}`, { beds: 2, maxOccupancy: 4, pricePerNight: 180 })).data.pricePerNight === 180);
  check('HTL-05 another hotel moderator cannot edit these rooms', [403, 404].includes((await am.patch(`/hotels/${hotelId}/rooms/${rooms[8].id}`, { beds: 3 })).status));
  r = await hm.get(`/hotels/${hotelId}/reservations?status=Confirmed`);
  check('HTL-22 moderator list: guest, dates, status', r.data.items.some((x) => x.id === hres && x.guest === 'Dina Uno' && x.checkIn === ci && x.status === 'Confirmed'), r.data.items);
  r = await u1.get(`/hotel-bookings/${hres}/cancellation-preview`);
  check('HTL-21 20 days before -> 10-day tier -> 100% of the full total', r.data.refundPercent === 100 && r.data.refundAmount === 612, r.data);
  r = await hb([{ roomId: rooms[1].id, adults: 1 }], plusDays(5), plusDays(7));
  const h5 = r.data.id; await payAndConfirm(u1, 'hotel', h5);
  r = await u1.get(`/hotel-bookings/${h5}/cancellation-preview`);
  check('HTL-21 5 days before -> 3-day tier -> 50% of 204 = 102', r.data.refundPercent === 50 && r.data.refundAmount === 102, r.data);
  r = await u1.post(`/hotel-bookings/${h5}/cancel`);
  check('HTL-21 cancel: Cancelled as a whole + refund', r.data.booking.status === 'Cancelled' && r.data.refundAmount === 102 && r.data.booking.refund?.amount === 102, r.data);
  check('HTL-21 rooms released after cancellation', (await anon.get(`/hotels/${hotelId}/rooms/available?checkIn=${plusDays(5)}&checkOut=${plusDays(7)}`)).data.rooms.some((x) => x.id === rooms[1].id));
  check('HTL-23 a Cancelled reservation cannot be reviewed', (await u1.post(`/hotel-bookings/${h5}/review`, { rating: 5 })).status === 409);
  await db.collection('hotel_reservations').updateOne({ _id: oid(hres) }, { $set: { checkIn: new Date(plusDays(0) + 'T00:00:00.000Z') } });
  check('HTL-21 cannot cancel on or after the check-in date', (await u1.post(`/hotel-bookings/${hres}/cancel`)).status === 409);
  await db.collection('hotel_reservations').updateOne({ _id: oid(hres) }, { $set: { checkIn: new Date(plusDays(-4) + 'T00:00:00.000Z'), checkOut: new Date(plusDays(-1) + 'T00:00:00.000Z') } });
  check('HTL-23 rating must be 1-5', (await u1.post(`/hotel-bookings/${hres}/review`, { rating: 6 })).status === 400);
  check('HTL-23 review text limited to 1000 characters', (await u1.post(`/hotel-bookings/${hres}/review`, { rating: 5, text: 'x'.repeat(1001) })).status === 400);
  check('HTL-23 only the guest can review their reservation', (await u2.post(`/hotel-bookings/${hres}/review`, { rating: 5 })).status === 404);
  r = await u1.post(`/hotel-bookings/${hres}/review`, { rating: 5, text: 'Great stay' });
  check('HTL-23 review saved for the Completed reservation', r.status === 201, r.data);
  const reviewId = r.data.id;
  r = await anon.get(`/hotels/${hotelId}/reviews`);
  check('HTL-24 average, number of ratings and reviews newest first', r.data.averageRating === 5 && r.data.ratingsCount === 1 && r.data.items[0].text === 'Great stay' && r.data.pageSize === 10, r.data);
  check('HTL-23 delete own review -> average cleared', (await u1.del(`/reviews/${reviewId}`)).status === 200 && (await anon.get(`/hotels/${hotelId}/reviews`)).data.ratingsCount === 0);

  // ------------------------------------------------------------------ payments
  console.log('\n== Payments details (PAY-01..03)');
  r = await hb([{ roomId: rooms[3].id, adults: 1 }], plusDays(30), plusDays(31));
  const hp = r.data.id;
  check('PAY-02 payment blocked until policies are accepted', (await u1.post('/payments', { bookingType: 'hotel', bookingId: hp })).status === 400);
  r = await u1.post(`/bookings/hotel/${hp}/accept-policies`);
  check('PAY-02 acceptance stored with a timestamp', [200, 201].includes(r.status) && !!(await db.collection('hotel_reservations').findOne({ _id: oid(hp) })).policyAcceptance?.acceptedAt && !!r.data.acceptedAt, r.data);
  r = await u1.post('/payments', { bookingType: 'hotel', bookingId: hp });
  const pay = r.data;
  check('PAY-01 PaymentIntent for the booking total', r.status === 201 && pay.clientSecret && pay.amount === 104, pay);
  const payDoc = await db.collection('payments').findOne({ _id: oid(pay.id) });
  check('PAY-01 stored: PaymentIntent id, amount, currency, status only', ['stripePaymentIntentId', 'amount', 'currency', 'status'].every((k) => k in payDoc) && !Object.keys(payDoc).some((k) => /card|cvc|pan|number/i.test(k)), Object.keys(payDoc));
  await webhook('payment_intent.payment_failed', { id: pay.stripePaymentIntentId, object: 'payment_intent', status: 'requires_payment_method', last_payment_error: { message: 'Your card was declined.' } });
  r = await u1.get(`/payments/${pay.id}`);
  check('PAY-01 failure shows an error; booking stays unconfirmed', r.data.status === 'failed' && /failed/i.test(r.data.message) && (await u1.get(`/hotel-bookings/${hp}`)).data.status === 'Pending Payment', r.data);
  check('PAY-01 another user cannot read my payment', (await u2.get(`/payments/${pay.id}`)).status === 404);
  r = await u1.post(`/payments/${pay.id}/retry`);
  check('PAY-01 retry while the hold is active', [200, 201].includes(r.status) && r.data.clientSecret && r.data.status === 'requires_payment', r.data);
  await webhook('payment_intent.succeeded', { id: pay.stripePaymentIntentId, object: 'payment_intent', status: 'succeeded' });
  check('PAY-01 booking confirmed only after the succeeded webhook', (await u1.get(`/hotel-bookings/${hp}`)).data.status === 'Confirmed');
  r = await fetch(L.BASE + '/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check('PAY-01 webhook without a signature rejected', r.status === 400);
  check('PAY-01 guests cannot create payments', (await anon.post('/payments', { bookingType: 'hotel', bookingId: hp })).status === 401);

  // ------------------------------------------------------------------ itineraries
  console.log('\n== Itineraries details (ITN-01..26)');
  check('ITN-01 title limited to 100 characters', (await u1.post('/itineraries', { title: 'x'.repeat(101), countries: ['EG'], startDate: plusDays(40) })).status === 400);
  check('ITN-01 at least one country', (await u1.post('/itineraries', { title: 'T', countries: [], startDate: plusDays(40) })).status === 400);
  check('ITN-01 start date must be a date', (await u1.post('/itineraries', { title: 'T', countries: ['EG'], startDate: 'soon' })).status === 400);
  check('ITN-01 guests cannot create itineraries', (await anon.post('/itineraries', { title: 'T', countries: ['EG'], startDate: plusDays(40) })).status === 401);
  const itA = (await u1.post('/itineraries', { title: `Nile and Gulf ${run}`, countries: ['EG', 'AE'], startDate: plusDays(40) })).data;
  check('ITN-01/20 created private by default', itA.visibility === 'Private' && itA.startDate === plusDays(40), itA);
  const itB = (await u1.post('/itineraries', { title: `Second ${run}`, countries: ['EG'], startDate: plusDays(50) })).data;
  check('ITN-05 unknown city rejected', (await u1.post(`/itineraries/${itA.id}/days`, { cityId: 'atlantis' })).status === 400);
  check('ITN-05 a day needs a city', (await u1.post(`/itineraries/${itA.id}/days`, { notes: 'x' })).status === 400);
  let v;
  for (const c of ['cairo', 'cairo', 'dubai', 'dubai']) v = (await u1.post(`/itineraries/${itA.id}/days`, { cityId: c, notes: 'n' })).data;
  check('ITN-05 days are numbered and dated from the start date', v.days.map((d) => d.dayNumber).join() === '1,2,3,4' && v.days[3].date === plusDays(43), v.days.map((d) => [d.dayNumber, d.date]));
  check('ITN-09 consecutive same-city days form groups', v.cityGroups.length === 2 && v.cityGroups[0].dayCount === 2 && v.cityGroups[1].cityId === 'dubai' && v.cityGroups[1].startDate === plusDays(42), v.cityGroups);
  const [d1, d2, d3, d4] = v.days.map((d) => d.id);
  r = await u1.get('/itineraries');
  check('ITN-03 list: title, countries, start date, days, visibility; most recently updated first', r.data.items[0].id === itA.id && r.data.items[0].days === 4 && r.data.items[0].visibility === 'Private'
    && r.data.items[0].countries.length === 2 && r.data.items.findIndex((x) => x.id === itB.id) > 0, r.data.items.slice(0, 2));
  r = await u1.patch(`/itineraries/${itA.id}`, { startDate: plusDays(45) });
  check('ITN-01 editing the start date re-dates the days', r.data.days[0].date === plusDays(45) && r.data.days[3].date === plusDays(48), r.data.days.map((d) => d.date));
  check('ITN-10 activity time must be HH:mm', (await u1.post(`/itineraries/${itA.id}/days/${d1}/activities`, { name: 'A', time: '9am' })).status === 400);
  check('ITN-10 activity cost cannot be negative', (await u1.post(`/itineraries/${itA.id}/days/${d1}/activities`, { name: 'A', cost: -5, currency: 'USD' })).status === 400);
  check('ITN-10 activity needs a name', (await u1.post(`/itineraries/${itA.id}/days/${d1}/activities`, { description: 'no name' })).status === 400);
  r = await u1.post(`/itineraries/${itA.id}/days/${d1}/activities`, { name: 'Museum', description: 'GEM', time: '10:30', cost: 30, currency: 'USD' });
  const actId = r.data.days[0].activities[0].id;
  r = await u1.patch(`/activities/${actId}`, { name: 'Grand Museum', cost: 40 });
  check('ITN-10 edit activity', r.status === 200 && r.data.days[0].activities[0].name === 'Grand Museum' && r.data.days[0].activities[0].cost === 40, r.data.days[0].activities);
  check('ITN-10 another user cannot edit my activity', (await u2.patch(`/activities/${actId}`, { name: 'Hacked' })).status === 404);
  check('ITN-14 unknown budget category rejected', (await u1.post(`/itineraries/${itA.id}/days/${d1}/budgets`, { category: 'shopping', amount: 5, currency: 'USD' })).status === 400);
  check('ITN-14 unsupported budget currency rejected', (await u1.post(`/itineraries/${itA.id}/days/${d1}/budgets`, { category: 'food', amount: 5, currency: 'XYZ' })).status === 400);
  await u1.post(`/itineraries/${itA.id}/days/${d1}/budgets`, { category: 'food', amount: 50, currency: 'USD' });
  r = await u1.post(`/itineraries/${itA.id}/days/${d3}/budgets`, { category: 'in_city_transport', amount: 20, currency: 'USD' });
  const budId = r.data.days[2].budgets[0].id;
  r = await u1.patch(`/budgets/${budId}`, { amount: 25 });
  check('ITN-14 edit a budget entry', r.status === 200 && r.data.days[2].budgets[0].amount === 25, r.data.days[2].budgets);
  r = await u1.post(`/itineraries/${itA.id}/transport-costs`, { mode: 'Flight', fromCityId: 'cairo', toCityId: 'dubai', amount: 300, currency: 'USD', dayId: d3 });
  check('ITN-16 intercity transport cost: mode, from, to, amount, currency, day', r.status === 201 && r.data.transportCosts[0].mode === 'Flight' && r.data.transportCosts[0].fromCityId === 'cairo'
    && r.data.transportCosts[0].amount === 300 && r.data.transportCosts[0].dayNumber === 3, r.data.transportCosts);
  const tcId = r.data.transportCosts[0].id;
  check('ITN-16 negative transport amount rejected', (await u1.post(`/itineraries/${itA.id}/transport-costs`, { mode: 'Bus', fromCityId: 'cairo', toCityId: 'dubai', amount: -1, currency: 'USD', dayId: d3 })).status === 400);
  check('ITN-16 unknown city rejected', (await u1.post(`/itineraries/${itA.id}/transport-costs`, { mode: 'Bus', fromCityId: 'cairo', toCityId: 'atlantis', amount: 5, currency: 'USD', dayId: d3 })).status === 400);
  r = await u1.patch(`/transport-costs/${tcId}`, { amount: 280, mode: 'Train' });
  check('ITN-16 edit a transport cost', r.status === 200 && r.data.transportCosts[0].amount === 280 && r.data.transportCosts[0].mode === 'Train', r.data.transportCosts);
  r = await u1.get(`/itineraries/${itA.id}/budget-summary?currency=USD`);
  check('ITN-14 summary by category and by day: food 50 + activities 40 + in-city 25 + intercity 280 = 395', r.data.total === 395 && r.data.byCategory.food === 50 && r.data.byCategory.activities === 40
    && r.data.byCategory.in_city_transport === 25 && r.data.byCategory.intercity_transport === 280 && r.data.byDay.find((d) => d.dayNumber === 3).total === 305 && r.data.byDay.find((d) => d.dayNumber === 1).total === 90, r.data);
  check('ITN-09 budget subtotal per city group', r.data.cityGroups[0].budgetSubtotal === 90 && r.data.cityGroups[1].budgetSubtotal === 305 && r.data.cityGroups[0].dayCount === 2, r.data.cityGroups);
  check('ITN-18 summary shows the rate date', /^\d{4}-\d{2}-\d{2}$/.test(r.data.rateDate), r.data.rateDate);
  const rates = (await anon.get('/exchange-rates')).data;
  r = await u1.get(`/itineraries/${itA.id}/budget-summary`);
  check('ITN-18 totals converted into the preferred currency (EGP)', r.data.currency === 'EGP' && Math.abs(r.data.total - 395 * rates.rates.EGP) < 0.02, [r.data.total, rates.rates.EGP]);
  r = await anon.get('/exchange-rates/convert?amount=100&from=USD&to=EUR');
  check('ITN-18 conversion endpoint with rate date', r.status === 200 && Math.abs(r.data.converted - 100 * rates.rates.EUR) < 0.01 && r.data.rateDate, r.data);
  check('ITN-18 invalid currency code -> 400', (await anon.get('/exchange-rates/convert?amount=1&from=USD&to=ABC')).status === 400);
  r = await u1.del(`/itineraries/${itA.id}/days/${d2}`);
  check('ITN-07 delete a day: renumbered, re-dated, budget recalculated', r.data.days.length === 3 && r.data.days.map((d) => d.dayNumber).join() === '1,2,3' && r.data.days[1].id === d3 && r.data.days[1].date === plusDays(46), r.data.days.map((d) => [d.dayNumber, d.date]));
  check('ITN-16 transport cost follows its day after renumbering', r.data.transportCosts[0].dayNumber === 2, r.data.transportCosts);
  r = await u1.patch(`/itineraries/${itA.id}/days/reorder`, { dayId: d4, position: 1 });
  check('ITN-08 reorder: day numbers, dates and groups recalculated', r.data.days[0].id === d4 && r.data.days[0].date === plusDays(45) && r.data.cityGroups.map((x) => x.cityId).join() === 'dubai,cairo,dubai', r.data.cityGroups);
  check('ITN-08 position must exist', (await u1.patch(`/itineraries/${itA.id}/days/reorder`, { dayId: d4, position: 9 })).status === 400);
  check('ITN-16 delete a transport cost', (await u1.del(`/transport-costs/${tcId}`)).data.transportCosts.length === 0);
  check('ITN-14 delete a budget entry', (await u1.del(`/budgets/${budId}`)).status === 200);
  check('ITN-10 delete an activity', (await u1.del(`/activities/${actId}`)).status === 200);
  // 60-day limit
  let last;
  for (let i = 0; i < 60; i++) last = await u1.post(`/itineraries/${itB.id}/days`, { cityId: 'cairo' });
  check('ITN-05 up to 60 days allowed', last.status === 201 && last.data.days.length === 60, last.status);
  check('ITN-05 the 61st day is rejected', (await u1.post(`/itineraries/${itB.id}/days`, { cityId: 'cairo' })).status === 400);
  // visibility + public search
  check('ITN-20 private itinerary is not in public search', !(await anon.get(`/itineraries/public/search?keyword=${run}`)).data.items.some((x) => x.id === itA.id));
  r = await u1.patch(`/itineraries/${itA.id}`, { visibility: 'Public' });
  check('ITN-20 owner sets it Public', r.data.visibility === 'Public', r.data.visibility);
  r = await anon.get(`/itineraries/public/search?keyword=${encodeURIComponent('gulf ' + run)}`);
  check('ITN-21 found by title keyword', r.data.items.some((x) => x.id === itA.id), r.data.items);
  check('ITN-21 found by country keyword', (await anon.get('/itineraries/public/search?keyword=emirates')).data.items.some((x) => x.id === itA.id));
  check('ITN-21 duration filter (3 days): min 4 excludes, 2-3 includes', !(await anon.get(`/itineraries/public/search?keyword=${run}&minDays=4`)).data.items.some((x) => x.id === itA.id)
    && (await anon.get(`/itineraries/public/search?keyword=${run}&minDays=2&maxDays=3`)).data.items.some((x) => x.id === itA.id));
  check('ITN-21 country and city filters', (await anon.get(`/itineraries/public/search?keyword=${run}&countryCode=AE&cityId=dubai`)).data.items.some((x) => x.id === itA.id)
    && !(await anon.get(`/itineraries/public/search?keyword=${run}&cityId=london`)).data.items.some((x) => x.id === itA.id));
  check('ITN-21 min days above max days rejected', (await anon.get('/itineraries/public/search?minDays=5&maxDays=2')).status === 400);
  r = await anon.get(`/itineraries/public/${itA.id}`);
  check('ITN-21 public view is read-only data with author, days and budget', r.data.author.name === 'Dina Uno' && r.data.days.length === 3 && r.data.budgetSummary && r.data.visibility === 'Public', r.data);
  check('ITN-21 guests cannot clone (login required)', (await anon.post(`/itineraries/${itA.id}/clone`)).status === 401);
  check('ITN-20 only the owner can edit a public itinerary', (await u2.patch(`/itineraries/${itA.id}`, { title: 'Stolen' })).status === 404);
  r = await u2.post(`/itineraries/${itA.id}/clone`);
  const cl = r.data;
  check('ITN-21 clone is private, complete and credits the author', r.status === 201 && cl.visibility === 'Private' && cl.days.length === 3 && cl.clonedFrom.authorName === 'Dina Uno' && cl.id !== itA.id, cl);
  await u2.patch(`/itineraries/${cl.id}`, { title: 'My own copy' });
  check('ITN-21 the clone is independent of the original', (await u1.get(`/itineraries/${itA.id}`)).data.title === `Nile and Gulf ${run}`);
  r = await u1.patch(`/itineraries/${itA.id}`, { visibility: 'Private' });
  check('ITN-20 back to Private -> no longer publicly viewable', (await anon.get(`/itineraries/public/${itA.id}`)).status === 404);
  r = await u1.get(`/itineraries/${itA.id}`);
  const grp = r.data.cityGroups.find((x) => x.cityId === 'cairo');
  r = await u1.get(`/itineraries/${itA.id}/hotels?groupStartDayId=${grp.startDayId}&guests=2&rooms=1`);
  check('ITN-25 hotel search for a city group uses the group dates', r.status === 200 && r.data.group.cityId === 'cairo' && r.data.group.checkIn === grp.startDate && r.data.items !== undefined, r.data.group || r.data);
  r = await u1.get(`/itineraries/${itA.id}/flights?origin=CAI`);
  check('ITN-26 flight search to the first-day city defaults to the start date', r.status === 200 && r.data.destinationCityId === 'dubai' && r.data.date === plusDays(45) && r.data.results[0].destinationAirport === 'DXB', r.data);
  check('ITN-26 unknown origin airport rejected', (await u1.get(`/itineraries/${itA.id}/flights?origin=XXX`)).status === 400);

  // ------------------------------------------------------------------ blog
  console.log('\n== Blog details (BLG-01..12)');
  check('BLG-01 a title is required', (await u1.post('/posts', { title: '  ', body: 'b' })).status === 400);
  check('BLG-01 body is required', (await u1.post('/posts', { title: 'T', body: '' })).status === 400);
  check('BLG-08 a tag is limited to 30 characters', (await u1.post('/posts', { title: 'T', body: 'b', tags: ['x'.repeat(31)] })).status === 400);
  check('BLG-01 guests cannot post', (await anon.post('/posts', { title: 'T', body: 'b' })).status === 401);
  const tag = 'tag' + run;
  const mkPost = async (c, title, bodyText = 'Body text') => (await c.post('/posts', { title, body: bodyText, tags: [tag], status: 'Published' })).data;
  const long = 'L'.repeat(450);
  const pA = await mkPost(u1, `Alpha ${run}`, long);
  const pB = await mkPost(u1, `Beta ${run}`);
  const pC = await mkPost(u2, `Gamma ${run}`);
  check('BLG-01 published at once when status is Published', pA.status === 'Published' && pA.date && (await anon.get(`/posts/${pA.id}`)).status === 200, pA);
  r = await u1.patch(`/posts/${pA.id}`, { title: `Alpha edited ${run}`, tags: [tag, 'extra'] });
  check('BLG-04 author edits own post', r.status === 200 && r.data.title.startsWith('Alpha edited') && r.data.tags.length === 2, r.data);
  check('BLG-04 others cannot edit or delete my post', (await u2.patch(`/posts/${pA.id}`, { title: 'Stolen' })).status === 404 && (await u2.del(`/posts/${pA.id}`)).status === 404);
  check('BLG-05 comment limited to 500 characters', (await u2.post(`/posts/${pB.id}/comments`, { body: 'c'.repeat(501) })).status === 400);
  check('BLG-05 guests cannot comment', (await anon.post(`/posts/${pB.id}/comments`, { body: 'hi' })).status === 401);
  await u2.post(`/posts/${pB.id}/comments`, { body: 'first' });
  r = await u1.post(`/posts/${pB.id}/comments`, { body: 'second' });
  const myComment = r.data.id;
  r = await anon.get(`/posts/${pB.id}/comments`);
  check('BLG-05 comments in chronological order', r.data.items.map((c) => c.body).join() === 'first,second', r.data.items);
  r = await u1.patch(`/comments/${myComment}`, { body: 'second (edited)' });
  check('BLG-07 edit own comment', r.status === 200 && r.data.body === 'second (edited)', r.data);
  await u1.post(`/posts/${pB.id}/like`); await u1.post(`/posts/${pB.id}/like`); await u2.post(`/posts/${pB.id}/like`);
  r = await anon.get(`/posts/${pB.id}`);
  check('BLG-06 one like per user; count shown', r.data.likeCount === 2 && r.data.commentCount === 2, r.data);
  check('BLG-06 guests cannot like', (await anon.post(`/posts/${pB.id}/like`)).status === 401);
  check('BLG-06 unlike', (await u1.del(`/posts/${pB.id}/like`)).data.likeCount === 1);
  check('BLG-02 guest sees post page: title, author, date, body, tags, comments', r.data.title && r.data.author.name === 'Dina Uno' && r.data.date && r.data.body && r.data.tags.includes(tag) && r.data.comments.items.length === 2, r.data);
  r = await anon.get(`/posts?q=${run}`);
  check('BLG-09 search by keyword ordered by likes + comments, newest first on ties', r.data.items[0].id === pB.id && r.data.items[1].id === pC.id && r.data.items[2].id === pA.id, r.data.items.map((x) => [x.title, x.likeCount, x.commentCount]));
  check('BLG-09 results: title, author, date and 200-character excerpt', r.data.items.every((x) => x.title && x.author?.name && x.date) && r.data.items.find((x) => x.id === pA.id).excerpt.length === 200, r.data.items[2]);
  check('BLG-09 search by author name', (await anon.get('/posts?q=Dana%20Two')).data.items.some((x) => x.id === pC.id));
  check('BLG-09 search by tag keyword', (await anon.get(`/posts?q=${tag}`)).data.items.length === 3);
  check('BLG-09 no results message', (await anon.get('/posts?q=zzzzqqqq')).data.message === 'No results');
  check('BLG-08 clicking a tag lists the published posts with it', (await anon.get(`/tags/${tag}/posts`)).data.total === 3);
  await u1.patch(`/posts/${pA.id}`, { status: 'Draft' });
  check('BLG-04 a post moved back to Draft leaves the public pages', (await anon.get(`/posts/${pA.id}`)).status === 404 && (await anon.get(`/tags/${tag}/posts`)).data.total === 2
    && (await u1.get(`/posts/${pA.id}`)).status === 200);
  check('BLG-05 cannot comment on a draft', (await u2.post(`/posts/${pA.id}/comments`, { body: 'x' })).status === 404);
  r = await u1.get('/posts/mine');
  check('BLG-03 my posts: drafts included with status, date, like and comment counts', r.data.items.some((x) => x.id === pA.id && x.status === 'Draft') && r.data.items.some((x) => x.id === pB.id && x.likeCount === 1 && x.commentCount === 2), r.data.items);
  const five = new FormData(); for (let i = 0; i < 5; i++) five.append('images', new Blob([PNG], { type: 'image/png' }), `i${i}.png`);
  check('BLG-10 up to 5 images on a post', (await u1.req('POST', `/posts/${pB.id}/images`, five)).status === 201);
  const one = new FormData(); one.append('images', new Blob([PNG], { type: 'image/png' }), 'six.png');
  check('BLG-10 the 6th image is rejected', (await u1.req('POST', `/posts/${pB.id}/images`, one)).status === 400);
  const big = new FormData(); big.append('images', new Blob([Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)])], { type: 'image/png' }), 'big.png');
  r = await u1.req('POST', `/posts/${pC.id}/images`, big);
  check('GEN-08 files over 5 MB rejected', [400, 404, 413].includes(r.status), r.status);
  const big2 = new FormData(); big2.append('images', new Blob([Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 10)])], { type: 'image/png' }), 'big.png');
  r = await u2.req('POST', `/posts/${pC.id}/images`, big2);
  check('GEN-08 5 MB limit returns a clear message', [400, 413].includes(r.status) && /5 ?MB/i.test(r.data.message), r.data);
  r = await anon.get(`/posts/${pB.id}`);
  const imgId = r.data.images[0].id;
  check('BLG-10 images shown on the post page', r.data.images.length === 5 && r.data.images[0].url.includes('/uploads/'), r.data.images);
  check('BLG-10 remove an image', (await u1.del(`/posts/${pB.id}/images/${imgId}`)).status === 200 && (await anon.get(`/posts/${pB.id}`)).data.images.length === 4);
  check('BLG-07 delete own comment', (await u1.del(`/comments/${myComment}`)).status === 200 && (await anon.get(`/posts/${pB.id}`)).data.commentCount === 1);
  r = await anon.get(`/authors/${u1Id}`);
  check('BLG-12 author page: name, join date, published posts only', r.data.name === 'Dina Uno' && r.data.joinedAt && r.data.posts.items.every((x) => x.id !== pA.id) && r.data.posts.items.some((x) => x.id === pB.id), r.data);
  check('BLG-12 public itineraries only', r.data.publicItineraries.items.every((x) => x.id !== itA.id), r.data.publicItineraries);
  check('BLG-04 author deletes own post', (await u1.del(`/posts/${pA.id}`)).status === 200 && (await u1.get(`/posts/${pA.id}`)).status === 404);

  // ------------------------------------------------------------------ general
  console.log('\n== General (GEN-01, 02, 05, 09, 10, 11, 12) and deactivation (ACC-12)');
  for (let i = 0; i < 11; i++) await mkPost(u2, `Bulk ${i} ${run}`);
  r = await anon.get(`/tags/${tag}/posts`);
  check('GEN-05 lists longer than 10 rows are paginated with page size 10', r.data.items.length === 10 && r.data.pageSize === 10 && r.data.total === 13 && r.data.totalPages === 2, [r.data.items.length, r.data.total]);
  check('GEN-05 page 2 returns the rest', (await anon.get(`/tags/${tag}/posts?page=2`)).data.items.length === 3);
  check('GEN-05 page must be a positive whole number', (await anon.get(`/tags/${tag}/posts?page=0`)).status === 400);
  r = await anon.post('/auth/register', { name: '', email: 'bad', password: '1', acceptTerms: false });
  check('GEN-02 one error shape with field-level messages', r.status === 400 && r.data.statusCode === 400 && r.data.message && Array.isArray(r.data.errors) && r.data.errors.every((e) => e.field && e.messages?.length) && r.data.errors.length === 4 && r.data.path && r.data.timestamp, r.data);
  r = await anon.get('/countries');
  check('GEN-12 predefined countries with ISO code and currency', r.data.length === 8 && r.data.find((c) => c._id === 'EG')?.currency === 'EGP', r.data[0]);
  r = await anon.get('/currencies');
  check('GEN-12 supported currencies = the codes of the Countries dataset', r.data.map((c) => c._id).sort().join() === 'AED,EGP,EUR,GBP,JPY,SAR,USD', r.data);
  check('GEN-12 predefined cities and attractions', (await anon.get('/cities')).data.length === 8 && (await anon.get('/attractions?cityId=cairo')).data.length >= 1);
  r = await u1.get('/notifications');
  const n0 = r.data.items[0];
  check('GEN-01 notifications newest first, with unread state', r.data.items.length >= 3 && r.data.pageSize === 10 && n0.read === false && n0.id && n0.title && n0.message && !('__v' in n0) && new Date(n0.createdAt) >= new Date(r.data.items[1].createdAt), n0);
  const unread = (await u1.get('/notifications/unread-count')).data.unread;
  await u1.patch(`/notifications/${n0.id}/read`);
  check('GEN-01 mark one as read', (await u1.get('/notifications/unread-count')).data.unread === unread - 1 && unread >= 1);
  check('GEN-01 cannot read someone else\'s notification', (await u2.patch(`/notifications/${n0.id}/read`)).status === 404);
  await u1.patch('/notifications/read-all');
  check('GEN-01 mark all as read', (await u1.get('/notifications/unread-count')).data.unread === 0 && (await u1.get('/notifications')).data.items.every((n) => n.read));
  check('GEN-09 a reason is required', (await u1.post('/reports', { targetType: 'post', targetId: pC.id, reason: '  ' })).status === 400);
  check('GEN-09 guests cannot report', (await anon.post('/reports', { targetType: 'post', targetId: pC.id, reason: 'spam' })).status === 401);
  check('GEN-09 unknown content type rejected', (await u1.post('/reports', { targetType: 'user', targetId: pC.id, reason: 'spam' })).status === 400);
  check('GEN-09 report a post', (await u1.post('/reports', { targetType: 'post', targetId: pC.id, reason: 'spam' })).status === 201);
  const cmt = (await anon.get(`/posts/${pB.id}/comments`)).data.items[0];
  check('GEN-09 report a comment', (await u1.post('/reports', { targetType: 'comment', targetId: cmt.id, reason: 'rude' })).status === 201);
  check('GEN-10 only admins see the reports', (await u1.get('/admin/reports')).status === 403);
  r = await admin.get('/admin/reports');
  const repC = r.data.items.find((x) => x.targetId === cmt.id);
  r = await admin.patch(`/admin/reports/${repC.id}`, { action: 'hide' });
  check('GEN-10 hide a reported comment', r.data.status === 'hidden', r.data);
  check('GEN-10 hidden comment not shown to the public, still shown to its author', !(await anon.get(`/posts/${pB.id}/comments`)).data.items.some((c) => c.id === cmt.id)
    && (await u2.get(`/posts/${pB.id}/comments`)).data.items.some((c) => c.id === cmt.id && c.hidden === true));
  check('GEN-10 hidden comment visible to admins', (await admin.get(`/posts/${pB.id}/comments`)).data.items.some((c) => c.id === cmt.id));
  check('GEN-10 a resolved report cannot be resolved twice', (await admin.patch(`/admin/reports/${repC.id}`, { action: 'dismiss' })).status === 409);
  const repP = (await admin.get('/admin/reports')).data.items.find((x) => x.targetId === pC.id);
  r = await admin.patch(`/admin/reports/${repP.id}`, { action: 'delete' });
  check('GEN-10 delete reported content', r.data.status === 'deleted' && (await anon.get(`/posts/${pC.id}`)).status === 404, r.data);
  r = await admin.get('/admin/audit-logs');
  const log = r.data.items.find((x) => x.action === 'content.deleted' && x.targetId === pC.id);
  check('GEN-07 audit entry: action, admin and timestamp', log && log.admin?.email === ADMIN_EMAIL && log.createdAt && r.data.pageSize === 10, r.data.items[0]);
  check('GEN-07 only admins read the audit log', (await u1.get('/admin/audit-logs')).status === 403);
  // account deactivation
  const dz = await newUser('Zed Leaver', `dz_${run}@ex.com`);
  const dzId = (await dz.get('/auth/me')).data.id;
  const zPost = await mkPost(dz, `Zed post ${run}`);
  await dz.post(`/posts/${pB.id}/comments`, { body: 'zed was here' });
  const zIt = (await dz.post('/itineraries', { title: `Zed trip ${run}`, countries: ['EG'], startDate: plusDays(30) })).data;
  await dz.patch(`/itineraries/${zIt.id}`, { visibility: 'Public' });
  r = await dz.del('/users/me');
  check('ACC-12 account deactivated', [200, 201].includes(r.status), r.data);
  check('ACC-12 session ended and login refused', (await dz.get('/auth/me')).status === 401 && (await new Client().login(`dz_${run}@ex.com`, 'Passw0rd1')).status !== 200);
  check('ACC-12 their posts are hidden', (await anon.get(`/posts/${zPost.id}`)).status === 404 && !(await anon.get(`/posts?q=${run}`)).data.items.some((x) => x.id === zPost.id));
  check('ACC-12 their public itineraries are hidden', (await anon.get(`/itineraries/public/${zIt.id}`)).status === 404);
  check('ACC-12 their comments are shown as "Deleted user"', (await anon.get(`/posts/${pB.id}/comments`)).data.items.some((c) => c.body === 'zed was here' && c.author.name === 'Deleted user'));
  check('ACC-12 no public author page', (await anon.get(`/authors/${dzId}`)).status === 404);
  check('ACC-14 admin sees the account as deactivated', (await admin.get(`/admin/accounts?q=dz_${run}`)).data.items[0]?.status === 'deactivated');
  // suspension keeps content and bookings (ACC-16)
  const u2Id = (await u2.get('/auth/me')).data.id;
  await admin.patch(`/admin/accounts/${u2Id}/suspend`);
  check('ACC-16 suspended user content stays visible', (await anon.get(`/tags/${tag}/posts`)).data.total >= 11);
  check('ACC-16 suspended user bookings remain valid', (await admin.get(`/flight-bookings/${b4}`)).data.status === 'Completed');
  check('ACC-16 suspension is written to the audit log', (await admin.get('/admin/audit-logs')).data.items.some((x) => x.action === 'account.suspended' && x.targetId === u2Id));
  check('ACC-15 an admin account cannot be suspended', (await admin.patch(`/admin/accounts/${(await admin.get('/auth/me')).data.id}/suspend`)).status === 403);
  await admin.patch(`/admin/accounts/${u2Id}/reactivate`);
  check('ACC-16 reactivated user can log in again', (await new Client().login(`du2_${run}@ex.com`, 'Passw0rd1')).status === 200);

  await mongoose.disconnect();
  console.log(`\nRESULT: ${L.results.filter((x) => x.ok).length}/${L.results.length} checks passed`);
  process.exit(L.failures ? 1 : 0);
})().catch((e) => { console.error('SUITE ERROR', e); process.exit(2); });
