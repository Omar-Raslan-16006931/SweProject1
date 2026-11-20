const fs = require('fs');
const path = require('path');
const { CFG, Client, check, setSection, dbc, D, L, u, ObjectId, newUser, pay, sendWebhook, png, jpg, form, sleep } = require('./lib');
const { mkFlight, ECO } = require('./t3_flights');
const { adult } = require('./t4_fbook');
const jwt = require(path.join(CFG.backend, 'node_modules/jsonwebtoken'));

module.exports = async function round3(ctx) {
  const admin = ctx.admin; const mod = ctx.airMod; const hm = ctx.hotelMod; const g = new Client(); const db = await dbc();
  let r;

  // ------------------------------------------------------------------ RBAC matrix over every endpoint
  setSection('R3 — role/permission matrix (every endpoint x every role)');
  const user = await newUser('Matrix User');
  const roles = { G: g, U: user, A: admin, AM: mod, HM: hm };
  const X = () => new ObjectId().toString();
  const AIR = ctx.airline.id; const H = ctx.hotel.id;
  const ALL = ['G', 'U', 'A', 'AM', 'HM']; const AUTH = ['U', 'A', 'AM', 'HM'];
  // [method, path, body, allowed roles, skipCallsForAllowed]
  const M = [
    ['GET', '/airports', undefined, ALL], ['GET', '/countries', undefined, ALL], ['GET', '/cities', undefined, ALL], ['GET', '/currencies', undefined, ALL],
    ['GET', `/flights/search?from=CAI&to=DXB&date=${D(30)}`, undefined, ALL], ['GET', `/flights/${X()}`, undefined, ALL], ['GET', `/airlines/${AIR}`, undefined, ALL],
    ['GET', `/hotels/search?cityId=cairo&checkIn=${D(30)}&checkOut=${D(31)}&guests=1`, undefined, ALL], ['GET', `/hotels/${H}`, undefined, ALL],
    ['GET', `/hotels/${H}/rooms/available?checkIn=${D(30)}&checkOut=${D(31)}`, undefined, ALL], ['GET', `/hotels/${H}/reviews`, undefined, ALL],
    ['GET', '/itineraries/public/search', undefined, ALL], ['GET', `/itineraries/public/${X()}`, undefined, ALL],
    ['GET', '/posts', undefined, ALL], ['GET', `/posts/${X()}`, undefined, ALL], ['GET', '/tags/egypt/posts', undefined, ALL], ['GET', `/authors/${X()}`, undefined, ALL],
    ['GET', '/exchange-rates', undefined, ALL],
    ['GET', '/auth/me', undefined, AUTH], ['GET', '/users/me', undefined, AUTH], ['PATCH', '/users/me', {}, AUTH], ['GET', '/notifications', undefined, AUTH],
    ['GET', '/notifications/unread-count', undefined, AUTH], ['PATCH', `/notifications/${X()}/read`, undefined, AUTH],
    ['DELETE', '/users/me', undefined, ['U'], true],
    // traveler
    ['POST', '/flight-bookings', {}, ['U']], ['POST', '/flight-bookings/hold', {}, ['U']], ['GET', '/flight-bookings', undefined, ['U']],
    ['GET', `/flight-bookings/${X()}`, undefined, ['U', 'A', 'AM']], ['POST', `/flight-bookings/${X()}/cancel`, undefined, ['U']],
    ['GET', `/flight-bookings/${X()}/e-ticket`, undefined, ['U', 'A']], ['GET', `/flight-bookings/${X()}/cancellation-preview`, undefined, ['U']],
    ['POST', '/hotel-bookings', {}, ['U']], ['GET', '/hotel-bookings', undefined, ['U']], ['GET', `/hotel-bookings/${X()}`, undefined, ['U', 'A', 'HM']],
    ['POST', `/hotel-bookings/${X()}/cancel`, undefined, ['U']], ['POST', `/hotel-bookings/${X()}/review`, {}, ['U']],
    ['PATCH', `/reviews/${X()}`, {}, ['U']], ['DELETE', `/reviews/${X()}`, undefined, ['U']],
    ['GET', `/bookings/flight/${X()}/policies`, undefined, ['U']], ['POST', `/bookings/flight/${X()}/accept-policies`, undefined, ['U']],
    ['POST', '/payments', {}, ['U']], ['POST', `/payments/${X()}/retry`, undefined, ['U']], ['GET', `/payments/${X()}`, undefined, ['U', 'A']], ['GET', `/refunds/${X()}`, undefined, ['U', 'A']],
    ['POST', '/itineraries', {}, ['U']], ['GET', '/itineraries', undefined, ['U']], ['GET', `/itineraries/${X()}`, undefined, ['U']], ['PATCH', `/itineraries/${X()}`, {}, ['U']],
    ['DELETE', `/itineraries/${X()}`, undefined, ['U']], ['POST', `/itineraries/${X()}/days`, {}, ['U']], ['PATCH', `/itineraries/${X()}/days/reorder`, {}, ['U']],
    ['PATCH', `/itineraries/${X()}/days/${X()}`, {}, ['U']], ['DELETE', `/itineraries/${X()}/days/${X()}`, undefined, ['U']],
    ['POST', `/itineraries/${X()}/days/${X()}/activities`, {}, ['U']], ['PATCH', `/activities/${X()}`, {}, ['U']], ['DELETE', `/activities/${X()}`, undefined, ['U']],
    ['DELETE', `/activities/${X()}/images/${X()}`, undefined, ['U']], ['POST', `/itineraries/${X()}/days/${X()}/budgets`, {}, ['U']], ['PATCH', `/budgets/${X()}`, {}, ['U']],
    ['DELETE', `/budgets/${X()}`, undefined, ['U']], ['POST', `/itineraries/${X()}/transport-costs`, {}, ['U']], ['PATCH', `/transport-costs/${X()}`, {}, ['U']],
    ['DELETE', `/transport-costs/${X()}`, undefined, ['U']], ['GET', `/itineraries/${X()}/budget-summary`, undefined, ['U']], ['POST', `/itineraries/${X()}/clone`, undefined, ['U']],
    ['GET', `/itineraries/${X()}/hotels?guests=1&groupStartDayId=${X()}`, undefined, ['U']], ['GET', `/itineraries/${X()}/flights?origin=CAI`, undefined, ['U']],
    ['POST', '/posts', {}, ['U']], ['GET', '/posts/mine', undefined, ['U']], ['PATCH', `/posts/${X()}`, {}, ['U']], ['DELETE', `/posts/${X()}`, undefined, ['U']],
    ['POST', `/posts/${X()}/comments`, {}, ['U']], ['PATCH', `/comments/${X()}`, {}, ['U']], ['DELETE', `/comments/${X()}`, undefined, ['U']],
    ['POST', `/posts/${X()}/like`, undefined, ['U']], ['DELETE', `/posts/${X()}/like`, undefined, ['U']], ['DELETE', `/posts/${X()}/images/${X()}`, undefined, ['U']],
    ['POST', '/reports', {}, ['U']],
    // airline moderator
    ['POST', '/flights', {}, ['AM']], ['GET', '/flights/mine', undefined, ['AM']], ['PATCH', `/flights/${X()}`, {}, ['AM']], ['POST', `/flights/${X()}/cancel`, undefined, ['AM']],
    ['POST', `/flights/${X()}/cabins`, {}, ['AM']], ['PATCH', `/flights/${X()}/cabins/${X()}`, {}, ['AM']], ['GET', `/flights/${X()}/bookings`, undefined, ['AM']],
    ['GET', `/flights/${X()}/passengers/export`, undefined, ['AM']], ['PATCH', `/airlines/${AIR}`, {}, ['AM']], ['PUT', `/airlines/${AIR}/baggage-policy`, {}, ['AM']],
    ['PUT', `/airlines/${AIR}/cancellation-policy`, {}, ['AM']], ['DELETE', `/airlines/${AIR}/logo`, undefined, ['AM'], true],
    // hotel moderator
    ['PATCH', `/hotels/${H}`, {}, ['HM']], ['PUT', `/hotels/${H}/policies`, {}, ['HM']], ['GET', `/hotels/${H}/rooms`, undefined, ['HM']], ['POST', `/hotels/${H}/rooms`, {}, ['HM']],
    ['PATCH', `/hotels/${H}/rooms/${X()}`, {}, ['HM']], ['DELETE', `/hotels/${H}/rooms/${X()}`, undefined, ['HM']], ['POST', `/hotels/${H}/rooms/${X()}/availability`, {}, ['HM']],
    ['PATCH', `/hotels/${H}/rooms/${X()}/availability`, {}, ['HM']], ['GET', `/hotels/${H}/availability`, undefined, ['HM']], ['GET', `/hotels/${H}/reservations`, undefined, ['HM']],
    ['DELETE', `/hotels/${H}/photos/${X()}`, undefined, ['HM']],
    // admin
    ['POST', '/airlines', {}, ['A']], ['POST', '/hotels', {}, ['A']], ['POST', '/admin/moderators', {}, ['A']], ['GET', '/admin/accounts', undefined, ['A']],
    ['PATCH', `/admin/accounts/${X()}/suspend`, undefined, ['A']], ['PATCH', `/admin/accounts/${X()}/reactivate`, undefined, ['A']],
    ['POST', `/admin/users/${X()}/reset-password`, {}, ['A']], ['PATCH', `/admin/providers/hotel/${X()}/deactivate`, undefined, ['A']],
    ['PATCH', `/admin/providers/airline/${X()}/reactivate`, undefined, ['A']], ['GET', '/admin/bookings', undefined, ['A']], ['GET', '/admin/reports', undefined, ['A']],
    ['PATCH', `/admin/reports/${X()}`, {}, ['A']], ['DELETE', `/admin/content/post/${X()}`, undefined, ['A']], ['PATCH', `/admin/content/post/${X()}/visibility`, {}, ['A']],
    ['GET', '/admin/audit-logs', undefined, ['A']], ['GET', '/admin/airlines', undefined, ['A']], ['GET', '/admin/hotels', undefined, ['A']],
  ];
  const wrong = []; let calls = 0; const fiveHundreds = [];
  for (const [method, p, body, allowed, skipAllowed] of M) {
    for (const [role, c] of Object.entries(roles)) {
      const ok = allowed.includes(role);
      if (ok && skipAllowed) continue;
      const res = await c.req(method, p, body);
      calls++;
      if (res.status >= 500) fiveHundreds.push(`${role} ${method} ${p} -> ${res.status}`);
      if (ok && (res.status === 401 || res.status === 403)) wrong.push(`${role} ${method} ${p} denied (${res.status}) but should be allowed`);
      if (!ok && !(role === 'G' ? res.status === 401 : res.status === 403)) wrong.push(`${role} ${method} ${p} -> ${res.status}, expected ${role === 'G' ? 401 : 403}`);
    }
  }
  check('ACC-11 / PDF 6.1', `role matrix: ${M.length} endpoints x 5 roles (${calls} calls) all allowed/denied exactly as specified`, wrong.length === 0, wrong.slice(0, 12));
  check('GEN-13', 'no endpoint answers 500 to any role with an empty/invalid request', fiveHundreds.length === 0, fiveHundreds.slice(0, 10));

  // ------------------------------------------------------------------ sessions
  setSection('R3 — tokens & sessions');
  const s = await newUser('Token user');
  const me = (await s.get('/auth/me')).data;
  const sid = (await db.collection('sessions').find({ user: new ObjectId(s.id) }).sort({ createdAt: -1 }).limit(1).toArray())[0]._id.toString();
  const expired = jwt.sign({ sub: me.id, sid, role: 'user', exp: Math.floor(Date.now() / 1000) - 10 }, CFG.jwtSecret);
  const ec = new Client(); ec.cookies.access_token = expired;
  r = await ec.get('/auth/me');
  check('ACC-06', 'expired access token -> 401 with a refresh hint', r.status === 401 && /refresh/i.test(r.data.message), r.data);
  const forgedRole = jwt.sign({ sub: me.id, sid, role: 'admin' }, CFG.jwtSecret, { expiresIn: 300 });
  const fc = new Client(); fc.cookies.access_token = forgedRole;
  r = await fc.get('/admin/accounts');
  check('ACC-11', "a token claiming role=admin for a normal user does not grant admin (role read from the DB)", r.status === 403, r.status);
  const badSecret = jwt.sign({ sub: me.id, sid, role: 'user' }, 'not-the-secret', { expiresIn: 300 });
  const bc = new Client(); bc.cookies.access_token = badSecret;
  r = await bc.get('/auth/me');
  check('ACC-19', 'token signed with another secret rejected', r.status === 401, r.status);
  const noneAlg = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: me.id, sid, role: 'admin' })).toString('base64url') + '.';
  const nc = new Client(); nc.cookies.access_token = noneAlg;
  r = await nc.get('/auth/me');
  check('ACC-19', 'unsigned "alg:none" token rejected', r.status === 401, r.status);
  const otherSid = jwt.sign({ sub: me.id, sid: new ObjectId().toString(), role: 'user' }, CFG.jwtSecret, { expiresIn: 300 });
  const oc = new Client(); oc.cookies.access_token = otherSid;
  r = await oc.get('/auth/me');
  check('ACC-06', 'valid signature but unknown session id rejected', r.status === 401, r.status);
  // two tabs refreshing at once must not log the user out
  const t2 = await newUser('Two tabs');
  const rt = t2.cookies.refresh_token;
  const tabA = new Client(); tabA.cookies.refresh_token = rt; const tabB = new Client(); tabB.cookies.refresh_token = rt;
  const [ra, rb] = await Promise.all([tabA.post('/auth/refresh'), tabB.post('/auth/refresh')]);
  const winner = [tabA, tabB].find((t, i) => [ra, rb][i].status === 200);
  r = winner ? await winner.get('/auth/me') : { status: 0 };
  check('ACC-06', 'concurrent refreshes: at least one tab ends with a working session', !!winner && r.status === 200, [ra.status, rb.status, r.status]);
  // lock cleared by admin reset
  const lk = await newUser('Locked then reset');
  for (let i = 0; i < 5; i++) await new Client().login(lk.email, 'Wrong1234');
  await admin.post(`/admin/users/${lk.id}/reset-password`, { temporaryPassword: 'Temp12345' });
  r = await new Client().login(lk.email, 'Temp12345');
  check('ACC-07a / ACC-05', 'admin reset unlocks a locked account', r.status === 200, r.status);
  // moderator e-mail case
  const memail = `${u('MiXeD')}@QA.test`;
  await admin.post('/admin/moderators', { name: 'Case Mod', email: memail, role: 'hotel_moderator', providerId: H, temporaryPassword: 'TempPass1' });
  r = await new Client().login(memail.toLowerCase(), 'TempPass1');
  check('ACC-13', 'moderator created with mixed-case e-mail can log in with lowercase', r.status === 200, r.status);
  r = await g.post('/auth/register', { name: 'Dup', email: memail.toUpperCase(), password: 'Passw0rd1', acceptTerms: true });
  check('ACC-01', "cannot register a moderator's e-mail in another case", r.status === 409, r.status);

  // ------------------------------------------------------------------ money races
  setSection('R3 — double payment / double refund races');
  const F = (await mkFlight(mod, { from: 'CAI', to: 'FRA', dep: L(70, '09:00'), arr: L(70, '13:00'), cabins: [ECO(20, 333.33)] })).data;
  const pu = await newUser('Double payer');
  const b = (await pu.post('/flight-bookings/hold', { outboundFlightId: F.id, outboundCabinClass: 'Economy', passengers: [adult('Ann Smith'), adult('Bob Smith'), { ...adult('Baby Smith'), dateOfBirth: new Date(Date.now() - 300 * 86400000).toISOString().slice(0, 10), type: 'infant' }] })).data;
  check('FLT-12b', 'fare rounding: 2 x 333.33 + 10% of 333.33 = 699.99', b.total === 699.99, b.total);
  await pu.post(`/bookings/flight/${b.id}/accept-policies`);
  const ps = await Promise.all(Array.from({ length: 6 }, () => pu.post('/payments', { bookingType: 'flight', bookingId: b.id })));
  const pids = new Set(ps.filter((x) => x.status === 201).map((x) => x.data.id));
  check('PAY-01', '6 simultaneous "Pay" clicks create a single PaymentIntent', pids.size === 1, { ids: [...pids], st: ps.map((x) => x.status) });
  const intents = [...new Set(ps.filter((x) => x.status === 201).map((x) => x.data.stripePaymentIntentId))];
  for (const id of intents) { await fetch(`${CFG.stripeFake}/v1/payment_intents/${id}/confirm`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'payment_method=pm_card_visa' }); }
  for (const id of intents) await sendWebhook('payment_intent.succeeded', { id, object: 'payment_intent', status: 'succeeded' });
  const paid = await db.collection('payments').countDocuments({ booking: new ObjectId(b.id), status: 'succeeded' });
  const refunded = await db.collection('refunds').countDocuments({ booking: new ObjectId(b.id) });
  check('PDF 6.4', 'if two payments ever succeed for one booking, the extra one is refunded in full', paid - refunded <= 1, { paid, refunded });
  r = await pu.get(`/flight-bookings/${b.id}`);
  check('FLT-23', 'booking confirmed exactly once', r.data.status === 'Confirmed', r.data.status);
  // a stray second PaymentIntent (e.g. created by an older client) succeeds after the booking is confirmed
  const strayPi = await (await fetch(`${CFG.stripeFake}/v1/payment_intents`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'amount=69999&currency=usd' })).json();
  await fetch(`${CFG.stripeFake}/v1/payment_intents/${strayPi.id}/confirm`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'payment_method=pm_card_visa' });
  const stray = await db.collection('payments').insertOne({ user: new ObjectId(pu.id), bookingType: 'flight', booking: new ObjectId(b.id), stripePaymentIntentId: strayPi.id, amount: 699.99, currency: 'USD', status: 'requires_payment', active: false, createdAt: new Date(), updatedAt: new Date() });
  await sendWebhook('payment_intent.succeeded', { id: strayPi.id, object: 'payment_intent', status: 'succeeded' });
  await sendWebhook('payment_intent.succeeded', { id: strayPi.id, object: 'payment_intent', status: 'succeeded' });
  const strayRefunds = await db.collection('refunds').find({ payment: stray.insertedId }).toArray();
  check('PDF 6.4', 'a second successful payment for an already-confirmed booking is refunded in full, once', strayRefunds.length === 1 && strayRefunds[0].amount === 699.99, strayRefunds.map((x) => x.amount));
  r = await pu.get(`/flight-bookings/${b.id}`);
  check('FLT-23', 'the duplicate payment does not change the confirmed booking', r.data.status === 'Confirmed' && r.data.payment?.id !== String(stray.insertedId), r.data.payment?.id);
  const cs = await Promise.all(Array.from({ length: 5 }, () => pu.post(`/flight-bookings/${b.id}/cancel`)));
  const nref = await db.collection('refunds').countDocuments({ booking: new ObjectId(b.id), reason: /Cancellation/ });
  check('FLT-26 / PAY-03', '5 simultaneous cancels -> one cancellation and one refund', cs.filter((x) => x.status === 200).length === 1 && nref === 1, { st: cs.map((x) => x.status), nref });
  const f = await db.collection('flights').findOne({ _id: new ObjectId(F.id) });
  check('FLT-26', 'seats released exactly once', f.cabins[0].available === 20 && f.cabins[0].booked === 0, f.cabins[0]);
  // hotel double cancel
  const hu = await newUser('Hotel double cancel');
  const hr = (await hu.post('/hotel-bookings', { hotelId: H, checkIn: D(90), checkOut: D(92), rooms: [{ roomId: ctx.R['101'].id, adults: 1 }] })).data;
  await pay(hu, 'hotel', hr.id);
  const hc = await Promise.all(Array.from({ length: 5 }, () => hu.post(`/hotel-bookings/${hr.id}/cancel`)));
  const hn = await db.collection('refunds').countDocuments({ booking: new ObjectId(hr.id) });
  check('HTL-21 / PAY-03', '5 simultaneous hotel cancels -> one refund', hc.filter((x) => x.status === 200).length === 1 && hn === 1, { st: hc.map((x) => x.status), hn });
  // airline cancels the flight while the user cancels
  const F2 = (await mkFlight(mod, { from: 'CAI', to: 'FRA', dep: L(71, '09:00'), arr: L(71, '13:00'), cabins: [ECO(5, 100)] })).data;
  const b2 = (await pu.post('/flight-bookings/hold', { outboundFlightId: F2.id, outboundCabinClass: 'Economy', passengers: [adult('Cat Smith')] })).data;
  await pay(pu, 'flight', b2.id);
  await Promise.all([pu.post(`/flight-bookings/${b2.id}/cancel`), mod.post(`/flights/${F2.id}/cancel`)]);
  const n2 = await db.collection('refunds').countDocuments({ booking: new ObjectId(b2.id) });
  check('FLT-06 / FLT-26', 'user cancel racing airline cancel -> exactly one refund', n2 === 1, n2);
  // block vs booking race
  const room = ctx.R['101'].id;
  const bu = await newUser('Block racer');
  const [rb1, rb2] = await Promise.all([
    bu.post('/hotel-bookings', { hotelId: H, checkIn: D(95), checkOut: D(97), rooms: [{ roomId: room, adults: 1 }] }),
    hm.patch(`/hotels/${H}/rooms/${room}/availability`, { action: 'block', from: D(96), to: D(96) }),
  ]);
  check('HTL-06 / HTL-18', 'booking racing a block on the same night: exactly one wins', [rb1.status === 201, rb2.status === 200].filter(Boolean).length === 1, [rb1.status, rb2.status]);

  // ------------------------------------------------------------------ DST / time zones
  setSection('R3 — daylight saving time');
  r = await mkFlight(mod, { from: 'LHR', to: 'CDG', dep: '2027-03-28T01:30', arr: '2027-03-28T05:00' });
  check('FLT-03 / GEN-06', 'non-existent local time (London clocks jump 01:00->02:00 on 2027-03-28) rejected', r.status === 400, { s: r.status, dep: r.data?.departure?.localTime });
  r = await mkFlight(mod, { from: 'LHR', to: 'CDG', dep: '2027-03-27T23:00', arr: '2027-03-28T03:00' });
  check('GEN-06', 'duration across a DST change computed in UTC (23:00 GMT -> 03:00 CEST = 2h)', r.status === 201 && r.data.durationMinutes === 120, r.data?.durationMinutes);
  r = await mkFlight(mod, { from: 'JFK', to: 'LHR', dep: '2027-03-14T02:30', arr: '2027-03-14T14:00' });
  check('FLT-03 / GEN-06', 'non-existent New York local time (2027-03-14 02:30) rejected', r.status === 400, r.status);

  // ------------------------------------------------------------------ files on disk
  setSection('R3 — files are cleaned up');
  const fu = await newUser('File user');
  const post = (await fu.post('/posts', { title: 'pics', body: 'b' })).data;
  r = await fu.post(`/posts/${post.id}/images`, form('images', [{ buf: png(), type: 'image/png', name: 'a.png' }]));
  const file = r.data.images?.[0]?.url?.split('/uploads/')[1];
  await fu.del(`/posts/${post.id}`);
  check('GEN-08', 'deleting a post removes its image files', file && !fs.existsSync(path.join(CFG.uploadsDir, file)), file);
  r = await fu.post(`/posts/${(await fu.post('/posts', { title: 'x', body: 'b' })).data.id}/images`, form('images', [{ buf: Buffer.alloc(0), type: 'image/png', name: 'empty.png' }]));
  check('GEN-08', 'zero-byte image rejected', r.status === 400, r.status);
  r = await g.get('/../uploads/');
  const dirList = await fetch(`${CFG.api}/uploads/posts/`);
  check('GEN-08', 'no directory listing of uploads', dirList.status === 404, dirList.status);

  // ------------------------------------------------------------------ CSV export injection
  setSection('R3 — CSV export');
  const Fx = (await mkFlight(mod, { from: 'CAI', to: 'FRA', dep: L(72, '09:00'), arr: L(72, '13:00'), cabins: [ECO(5, 100)] })).data;
  const cu = await newUser('CSV user');
  r = await cu.post('/flight-bookings/hold', { outboundFlightId: Fx.id, outboundCabinClass: 'Economy', passengers: [adult('=HYPERLINK("http://evil")')] });
  check('FLT-29', 'formula-like passenger name cannot reach the CSV export', r.status === 400, r.status);

  // ------------------------------------------------------------------ Swagger completeness
  setSection('R3 — Swagger documentation');
  let spec;
  for (const p of ['/api/docs-json', '/api/docs/json', '/api-json']) { const x = await fetch(CFG.api + p); if (x.ok) { spec = await x.json(); break; } }
  const ops = Object.entries(spec?.paths ?? {}).flatMap(([p, o]) => Object.entries(o).map(([m, d]) => ({ p, m, d })));
  const noSummary = ops.filter((o) => !o.d.summary).map((o) => `${o.m} ${o.p}`);
  check('PDF 7.1', 'every endpoint has a Swagger summary', noSummary.length === 0, noSummary);
  const noTag = ops.filter((o) => !o.d.tags?.length).map((o) => `${o.m} ${o.p}`);
  check('PDF 7.1', 'every endpoint is grouped under a Swagger tag', noTag.length === 0, noTag);

  // ------------------------------------------------------------------ global data invariants
  setSection('R3 — whole-database consistency (after every test above)');
  await sleep(1500);
  const flights = await db.collection('flights').find({}).toArray();
  const fb = await db.collection('flight_bookings').find({}).toArray();
  const bad = [];
  for (const fl of flights) {
    for (const c of fl.cabins) {
      const segs = fb.flatMap((x) => x.segments.filter((s) => String(s.flight) === String(fl._id) && s.cabinClass === c.class).map((s) => ({ s, st: x.status })));
      const booked = segs.filter((x) => ['Confirmed', 'Completed'].includes(x.st)).reduce((n, x) => n + x.s.seats, 0);
      const held = segs.filter((x) => x.st === 'Pending Payment').reduce((n, x) => n + x.s.seats, 0);
      const completedOnly = segs.filter((x) => x.st === 'Completed').length;
      if (c.seats !== c.booked + c.held + c.available || c.available < 0 || c.held < 0 || c.booked < 0) bad.push(`${fl.flightNumber} ${c.class}: seats ${c.seats} != ${c.booked}+${c.held}+${c.available}`);
      else if (fl.status !== 'Cancelled' && !completedOnly && (c.booked !== booked || c.held !== held)) bad.push(`${fl.flightNumber} ${c.class}: counters booked ${c.booked}/held ${c.held} vs bookings ${booked}/${held}`);
    }
  }
  check('FLT-22 / FLT-26', `seat counters match the bookings on all ${flights.length} flights`, bad.length === 0, bad.slice(0, 8));
  const res = await db.collection('hotel_reservations').find({}).toArray();
  const locks = await db.collection('room_night_locks').find({ kind: 'reservation' }).toArray();
  const resById = new Map(res.map((x) => [String(x._id), x]));
  const orphanLocks = locks.filter((l) => { const x = resById.get(String(l.reservation)); return !x || ['Cancelled', 'Expired'].includes(x.status); });
  check('HTL-18 / HTL-21', 'no room-night locks left for cancelled/expired/missing reservations', orphanLocks.length === 0, orphanLocks.slice(0, 5).map((l) => resById.get(String(l.reservation))?.status ?? 'missing'));
  const missing = res.filter((x) => x.status === 'Confirmed').filter((x) => locks.filter((l) => String(l.reservation) === String(x._id)).length !== x.rooms.length * x.nights);
  check('HTL-18', 'every Confirmed reservation still owns all its room-nights', missing.length === 0, missing.slice(0, 3).map((x) => x.reference));
  const confirmedNoPay = [...fb, ...res].filter((x) => ['Confirmed', 'Completed'].includes(x.status) && !x.payment);
  check('PAY-01', 'no Confirmed booking without a recorded payment', confirmedNoPay.length === 0, confirmedNoPay.length);
  const pays = await db.collection('payments').find({}).toArray();
  const refs = await db.collection('refunds').find({}).toArray();
  const over = pays.filter((p) => refs.filter((r) => String(r.payment) === String(p._id)).reduce((n, r) => n + r.amount, 0) > p.amount + 0.001);
  check('PAY-03', 'no payment refunded for more than was paid', over.length === 0, over.length);
  const refsNoBooking = refs.filter((r) => !(fb.concat(res)).some((x) => String(x._id) === String(r.booking)));
  check('PAY-03', 'every refund belongs to an existing booking', refsNoBooking.length === 0, refsNoBooking.length);
  const hotels = await db.collection('hotels').find({}).toArray();
  const reviews = await db.collection('reviews').find({ hidden: false }).toArray();
  const badAvg = hotels.filter((h) => { const rs = reviews.filter((r) => String(r.hotel) === String(h._id)); const avg = rs.length ? Math.round((rs.reduce((n, r) => n + r.rating, 0) / rs.length) * 10) / 10 : null; return avg !== h.avgRating || rs.length !== h.ratingsCount; });
  check('HTL-23', 'every hotel average rating & count matches its visible reviews', badAvg.length === 0, badAvg.map((h) => h.name));
  const posts = await db.collection('posts').find({}).toArray();
  const likes = await db.collection('likes').find({}).toArray();
  const comments = await db.collection('comments').find({ hidden: false }).toArray();
  const badCounts = posts.filter((p) => p.likesCount !== likes.filter((l) => String(l.post) === String(p._id)).length || p.commentsCount !== comments.filter((c) => String(c.post) === String(p._id)).length);
  check('BLG-06 / BLG-03', 'every post like/comment counter matches reality', badCounts.length === 0, badCounts.map((p) => p.title).slice(0, 5));
  const orphanComments = (await db.collection('comments').find({}).toArray()).filter((c) => !posts.some((p) => String(p._id) === String(c.post)));
  check('BLG-04', 'no comments left behind by deleted posts', orphanComments.length === 0, orphanComments.length);
  const its = await db.collection('itineraries').find({}).toArray();
  const badDayCount = its.filter((x) => x.dayCount !== x.days.length);
  check('ITN-21', 'stored day counts (used by the duration filter) match the real number of days', badDayCount.length === 0, badDayCount.map((x) => [x.title, x.dayCount, x.days.length]).slice(0, 5));
  const badTransport = its.filter((x) => x.transportCosts.some((t) => !x.days.some((d) => String(d._id) === String(t.dayId))));
  check('ITN-16', 'no transport cost points at a deleted day', badTransport.length === 0, badTransport.length);
  const refsUnique = new Set([...fb, ...res].filter((x) => x.reference).map((x) => x.reference));
  check('FLT-23 / HTL-17', 'all booking references unique', refsUnique.size === [...fb, ...res].filter((x) => x.reference).length, null);
  const pendingStale = [...fb, ...res].filter((x) => x.status === 'Pending Payment' && x.holdExpiresAt < new Date(Date.now() - 90000));
  check('FLT-22 / HTL-18', 'no hold left Pending more than ~1 minute past its expiry', pendingStale.length === 0, pendingStale.length);
};
