const zlib = require('zlib');
const { CFG, Client, check, setSection, dbc, D, L, u, ObjectId, newUser, pay, sendWebhook, png, form } = require('./lib');
const { makeModerator } = require('./t2_admin');
const { mkFlight, ECO } = require('./t3_flights');
const { adult } = require('./t4_fbook');

const localDate = (zone, offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offsetDays * 86400000));

/** Reads every page of a paginated endpoint and reports ids, duplicates and the advertised total. */
async function allPages(c, path) {
  const sep = path.includes('?') ? '&' : '?';
  const first = (await c.get(`${path}${sep}page=1`)).data;
  const ids = [...(first.items ?? []).map((x) => x.id)]; const sizes = [first.items?.length];
  for (let p = 2; p <= (first.totalPages ?? 1); p++) {
    const d = (await c.get(`${path}${sep}page=${p}`)).data;
    ids.push(...d.items.map((x) => x.id)); sizes.push(d.items.length);
  }
  return { ids, unique: new Set(ids).size, total: first.total, sizes, pageSize: first.pageSize };
}

/** Extracts the visible text of a PDFKit document (inflates content streams, decodes hex text runs). */
function pdfText(buf) {
  const s = buf.toString('latin1'); let out = '';
  for (const m of s.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    try {
      const raw = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      for (const h of raw.matchAll(/<([0-9a-fA-F]+)>/g)) out += Buffer.from(h[1], 'hex').toString('latin1');
      for (const t of raw.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) out += t[1];
      out += '\n';
    } catch { /* not a compressed content stream */ }
  }
  return out;
}

module.exports = async function round5(ctx) {
  const admin = ctx.admin; const mod = ctx.airMod; const g = new Client(); const db = await dbc();
  let r;

  // ------------------------------------------------------------------ pagination integrity with ties
  setSection('R5 — paging never skips or repeats items (GEN-05), even when sort values tie');
  const tok = u('Pagetok');
  await Promise.all(Array.from({ length: 23 }, (_, i) => g.post('/auth/register', { name: `${tok} ${i}`, email: `${u('pg')}@qa.test`, password: 'Passw0rd1', acceptTerms: true })));
  let pg = await allPages(admin, `/admin/accounts?q=${tok}`);
  check('GEN-05 / ACC-14', `admin accounts: 23 users created at once, 3 pages -> 23 distinct, none repeated`, pg.total === 23 && pg.ids.length === 23 && pg.unique === 23 && pg.sizes.join() === '10,10,3', pg);
  // a hotel with 23 rooms and 23 reservations all starting the same day
  const ph = (await admin.post('/hotels', { name: 'Paging Hotel', address: 'x', cityId: 'riyadh', countryCode: 'SA', starClass: 3 })).data;
  const phm = await makeModerator(admin, 'hotel_moderator', ph.id, 'pagehm');
  const rooms = [];
  for (let i = 0; i < 23; i++) {
    const rm = (await phm.post(`/hotels/${ph.id}/rooms`, { number: `R${i}`, type: 'Single', beds: 1, maxOccupancy: 1, pricePerNight: 50 })).data;
    await phm.post(`/hotels/${ph.id}/rooms/${rm.id}/availability`, { from: D(1), to: D(60) });
    rooms.push(rm);
  }
  const guest = await newUser('Paging guest');
  const resv = await Promise.all(rooms.map((rm) => guest.post('/hotel-bookings', { hotelId: ph.id, checkIn: D(30), checkOut: D(31), rooms: [{ roomId: rm.id, adults: 1 }] })));
  check('HTL-18', '23 separate one-room holds for the same dates all succeed', resv.every((x) => x.status === 201), resv.map((x) => x.status));
  pg = await allPages(phm, `/hotels/${ph.id}/reservations`);
  check('GEN-05 / HTL-22', 'moderator reservations (same check-in date): every reservation exactly once across pages', pg.total === 23 && pg.unique === 23 && pg.ids.length === 23, pg);
  pg = await allPages(guest, '/hotel-bookings');
  check('GEN-05 / HTL-20', 'guest reservation list (same check-in date): every reservation exactly once', pg.total === 23 && pg.unique === 23 && pg.ids.length === 23, pg);
  pg = await allPages(phm, `/hotels/${ph.id}/rooms`);
  check('GEN-05 / HTL-03', 'room list paginated without repeats', pg.total === 23 && pg.unique === 23, pg);
  // 23 flight holds on the same flight (same travel date)
  const PF = (await mkFlight(mod, { from: 'RUH', to: 'CAI', dep: L(33, '09:00'), arr: L(33, '11:00'), cabins: [ECO(50, 100)] })).data;
  const flyer = await newUser('Paging flyer');
  const fh = await Promise.all(Array.from({ length: 23 }, (_, i) => flyer.post('/flight-bookings/hold', { outboundFlightId: PF.id, outboundCabinClass: 'Economy', passengers: [adult(`Pax ${'abcdefghijklmnopqrstuvw'[i]}`)] })));
  check('FLT-22', '23 holds on one flight succeed', fh.every((x) => x.status === 201), fh.map((x) => x.status));
  pg = await allPages(flyer, '/flight-bookings');
  check('GEN-05 / FLT-25', 'my flight bookings (same travel date): every booking exactly once across pages', pg.total === 23 && pg.unique === 23 && pg.ids.length === 23, pg);
  // 12 flights on the same route/date with identical times and prices -> search pages
  const tiedNo = u('T').slice(-5).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
  for (let i = 0; i < 12; i++) await mkFlight(mod, { no: `${tiedNo}${i}`, from: 'RUH', to: 'DXB', dep: L(34, '09:00'), arr: L(34, '11:00'), cabins: [ECO(5, 100)] });
  const sp = await allPages(g, `/flights/search?from=RUH&to=DXB&date=${D(34)}&sortBy=price`.replace('/flights/search', '/flights/search'));
  // search wraps pages under "outbound"
  const s1 = (await g.get(`/flights/search?from=RUH&to=DXB&date=${D(34)}&sortBy=price&page=1`)).data.outbound;
  const s2 = (await g.get(`/flights/search?from=RUH&to=DXB&date=${D(34)}&sortBy=price&page=2`)).data.outbound;
  const sids = [...s1.items, ...s2.items].map((f) => f.id);
  check('GEN-05 / FLT-15', '12 flights with equal price and time: two search pages hold all 12, none repeated', s1.total === 12 && new Set(sids).size === 12 && sids.length === 12, { total: s1.total, n: sids.length });
  // providers with identical names
  const twin = u('Twin');
  for (let i = 0; i < 12; i++) await admin.post('/hotels', { name: twin, address: `${i} St`, cityId: 'riyadh', countryCode: 'SA', starClass: 2 });
  pg = await allPages(admin, '/admin/hotels');
  check('GEN-05 / ACC-15', 'admin hotel list (12 hotels with the same name): no hotel repeated or skipped', pg.unique === pg.total && pg.ids.length === pg.total, { total: pg.total, unique: pg.unique, n: pg.ids.length });
  r = await g.get('/posts?page=100000000000000000000');
  check('GEN-05 / GEN-13', 'absurd page number -> 400 or empty page, never 500', r.status === 400 || (r.status === 200 && r.data.items.length === 0), r.status);
  r = await g.get('/posts?page=1.5');
  check('GEN-05', 'fractional page rejected', r.status === 400, r.status);
  // every list uses page size 10
  const lists = [[mod, '/flights/mine'], [phm, `/hotels/${ph.id}/reservations`], [admin, '/admin/reports'], [admin, '/admin/audit-logs'], [mod, `/flights/${PF.id}/bookings`],
    [phm, `/hotels/${ph.id}/rooms`], [admin, '/admin/airlines'], [admin, '/admin/hotels'], [guest, '/itineraries'], [guest, '/posts/mine'], [guest, '/hotel-bookings'], [guest, '/notifications'], [g, '/tags/egypt/posts']];
  const wrong = [];
  for (const [c, p] of lists) { const x = (await c.get(p)).data; if (x.pageSize !== 10 || (x.items ?? []).length > 10) wrong.push(`${p}: pageSize ${x.pageSize}, items ${x.items?.length}`); }
  check('GEN-05', `all ${lists.length} other list endpoints page by 10`, wrong.length === 0, wrong);
  r = await mod.get('/flights/mine');
  const mine = (await allPages(mod, '/flights/mine'));
  const foreign = await db.collection('flights').countDocuments({ _id: { $in: mine.ids.map((i) => new ObjectId(i)) }, airline: { $ne: new ObjectId(ctx.airline.id) } });
  check('FLT-03 / ACC-11', "moderator's flight list contains only their own airline's flights, each once", foreign === 0 && mine.unique === mine.total, { foreign, total: mine.total, unique: mine.unique });

  // ------------------------------------------------------------------ sort orders
  setSection('R5 — sort orders');
  const cheap = (await admin.post('/hotels', { name: 'Sort Cheap', address: 'x', cityId: 'frankfurt', countryCode: 'DE', starClass: 2 })).data;
  const dear = (await admin.post('/hotels', { name: 'Sort Dear', address: 'x', cityId: 'frankfurt', countryCode: 'DE', starClass: 5 })).data;
  for (const [h, price] of [[cheap, 40], [dear, 400]]) {
    const m = await makeModerator(admin, 'hotel_moderator', h.id, 'sorthm');
    const rm = (await m.post(`/hotels/${h.id}/rooms`, { number: '1', type: 'Double', beds: 1, maxOccupancy: 2, pricePerNight: price })).data;
    await m.post(`/hotels/${h.id}/rooms/${rm.id}/availability`, { from: D(1), to: D(60) });
  }
  const order = async (q) => (await g.get('/hotels/search?' + new URLSearchParams({ cityId: 'frankfurt', checkIn: D(20), checkOut: D(21), guests: 1, ...q }))).data.items.map((h) => h.id).filter((i) => [cheap.id, dear.id].includes(i));
  check('HTL-12', 'hotel search default sort: price ascending', JSON.stringify(await order({})) === JSON.stringify([cheap.id, dear.id]), await order({}));
  check('HTL-12', 'hotel search price descending', JSON.stringify(await order({ sortOrder: 'desc' })) === JSON.stringify([dear.id, cheap.id]), null);
  r = await g.get('/hotels/search?' + new URLSearchParams({ cityId: 'frankfurt', checkIn: D(20), checkOut: D(21), guests: 1, sortBy: 'stars' }));
  check('HTL-12', 'unknown hotel sort key rejected', r.status === 400, r.status);
  r = await g.get('/posts');
  const dates = r.data.items.map((p) => new Date(p.date).getTime());
  check('BLG-02', 'blog list newest first', dates.every((d, i) => i === 0 || dates[i - 1] >= d), null);

  // ------------------------------------------------------------------ time zones on the departure side
  setSection('R5 — flight dates at airports already in "tomorrow"');
  const tokyoToday = localDate('Asia/Tokyo'); const tokyoYesterday = localDate('Asia/Tokyo', -1);
  if (tokyoToday !== D(0)) {
    r = await g.get(`/flights/search?from=HND&to=CDG&date=${D(0)}`);
    check('FLT-11 / GEN-06', `searching HND for ${D(0)} (already yesterday in Tokyo) rejected as past`, r.status === 400, r.status);
  } else {
    r = await g.get(`/flights/search?from=HND&to=CDG&date=${tokyoYesterday}`);
    check('FLT-11 / GEN-06', "searching HND for Tokyo's yesterday rejected", r.status === 400, r.status);
  }
  r = await g.get(`/flights/search?from=HND&to=CDG&date=${tokyoToday}`);
  check('FLT-11 / GEN-06', "searching HND for Tokyo's local today is allowed", r.status === 200, r.status);
  r = await g.get(`/flights/search?from=JFK&to=LHR&date=${localDate('America/New_York')}`);
  check('FLT-11 / GEN-06', "searching JFK for New York's local today is allowed (even if UTC is already tomorrow)", r.status === 200, r.status);

  // ------------------------------------------------------------------ documents produced for the user
  setSection('R5 — e-ticket and CSV contents');
  const EF = (await mkFlight(mod, { no: 'ET' + Math.floor(Math.random() * 9000 + 1000), from: 'CAI', to: 'JFK', dep: L(41, '23:15'), arr: L(42, '05:40'), cabins: [ECO(10, 650)] })).data;
  const et = await newUser('Ticket holder');
  const eb = (await et.post('/flight-bookings/hold', { outboundFlightId: EF.id, outboundCabinClass: 'Economy', passengers: [adult('Laila Hassan', { extraBags: [{ weightKg: 20 }] }), adult('Karim Hassan')] })).data;
  await pay(et, 'flight', eb.id);
  const ref = (await et.get(`/flight-bookings/${eb.id}`)).data.reference;
  r = await et.get(`/flight-bookings/${eb.id}/e-ticket`);
  const txt = pdfText(r.data);
  check('FLT-23', 'e-ticket names the booking reference', txt.includes(ref), txt.slice(0, 200));
  check('FLT-23', 'e-ticket lists every passenger', txt.includes('Laila Hassan') && txt.includes('Karim Hassan'), null);
  check('FLT-23 / GEN-06', 'e-ticket shows flight number and LOCAL departure/arrival times', txt.includes(EF.flightNumber) && txt.includes(`${D(41)} 23:15`) && txt.includes(`${D(42)} 05:40`), null);
  check('FLT-23', 'e-ticket shows the amount paid (1300 + 50 bag = 1350.00 USD)', txt.includes('1350.00 USD'), null);
  check('FLT-23', 'e-ticket download has a sensible file name', /attachment; filename=.*\.pdf/i.test(r.headers.get('content-disposition') ?? ''), r.headers.get('content-disposition'));
  r = await mod.get(`/flights/${EF.id}/passengers/export`);
  const lines = r.data.toString().trim().split(/\r?\n/);
  check('FLT-29', 'CSV: one header row + one row per passenger', lines.length === 3 && /passenger/i.test(lines[0]), lines);
  check('FLT-29', 'CSV rows carry reference and cabin', lines.slice(1).every((l) => l.includes(ref) && l.includes('Economy')), lines);
  check('FLT-29', 'CSV served as a download', /attachment; filename=.*\.csv/i.test(r.headers.get('content-disposition') ?? ''), r.headers.get('content-disposition'));
  r = await et.get('/notifications');
  const conf = r.data.items.find((n) => n.type === 'booking_confirmed');
  check('GEN-01', 'confirmation notification mentions the booking reference', conf && JSON.stringify(conf).includes(ref), conf);

  // ------------------------------------------------------------------ refund that fails at Stripe
  setSection('R5 — refund failure is visible');
  const cr = await et.post(`/flight-bookings/${eb.id}/cancel`);
  const refund = (await et.get(`/flight-bookings/${eb.id}`)).data.refund;
  const st = await (await fetch(`${CFG.stripeFake}/__state`)).json();
  const sref = st.refunds.find((x) => x.id === refund?.stripeRefundId) ?? st.refunds[st.refunds.length - 1];
  await sendWebhook('refund.updated', { ...sref, status: 'failed', failure_reason: 'expired_or_canceled_card' });
  r = await et.get(`/refunds/${refund?.id}`);
  check('PAY-03', 'a refund that fails at Stripe shows status Failed', cr.status === 200 && r.data.status === 'Failed', { cancel: cr.status, refund: r.data });
  r = await et.get('/notifications');
  check('PAY-03 / GEN-01', 'the user is told the refund failed', r.data.items.some((n) => n.type === 'refund' && /fail/i.test(JSON.stringify(n))), r.data.items.filter((n) => n.type === 'refund'));

  // ------------------------------------------------------------------ input format edge cases
  setSection('R5 — number and date formats');
  const fm = await makeModerator(admin, 'hotel_moderator', ctx.hotel2.id, 'fmthm');
  r = await fm.post(`/hotels/${ctx.hotel2.id}/rooms`, { number: 'D1', type: 'Double', beds: 1, maxOccupancy: 2, pricePerNight: 99.999 });
  check('HTL-03', 'price with 3 decimals rejected', r.status === 400, r.status);
  r = await et.post('/hotel-bookings', { hotelId: ctx.hotel.id, checkIn: D(40), checkOut: D(41), rooms: [{ roomId: ctx.R['102'].id, adults: 1, childrenAges: [5.5] }] });
  check('HTL-16', 'fractional child age rejected', r.status === 400, r.status);
  r = await et.post('/hotel-bookings', { hotelId: ctx.hotel.id, checkIn: D(40), checkOut: D(41), rooms: [{ roomId: ctx.R['102'].id, adults: 1.5 }] });
  check('HTL-16', 'fractional adult count rejected', r.status === 400, r.status);
  r = await et.post('/hotel-bookings', { hotelId: ctx.hotel.id, checkIn: `${D(40)}T15:00`, checkOut: D(41), rooms: [{ roomId: ctx.R['102'].id, adults: 1 }] });
  check('HTL-16', 'date-time where a date is expected rejected', r.status === 400, r.status);
  r = await et.post('/itineraries', { title: 'x', countries: ['EG'], startDate: `${D(10)}T00:00:00Z` });
  check('ITN-01', 'itinerary start date with a time part rejected', r.status === 400, r.status);
  r = await et.post('/flight-bookings', { outboundFlightId: EF.id, outboundCabinClass: 'Economy', passengers: [{ ...adult('Time Born'), dateOfBirth: '1990-01-01T00:00:00Z' }] });
  check('FLT-19', 'date of birth with a time part rejected', r.status === 400, r.status);
  r = await et.post('/flight-bookings', { outboundFlightId: EF.id, outboundCabinClass: 'economy', passengers: [adult('Lower Case')] });
  check('FLT-19', 'cabin class matched case-insensitively or rejected cleanly', r.status === 200 || r.status === 400, r.status);

  // ------------------------------------------------------------------ browser-facing behaviour
  setSection('R5 — CORS and headers');
  const pre = await fetch(`${CFG.api}/api/auth/login`, { method: 'OPTIONS', headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  check('PDF 6 / ACC-19', 'frontend origin may call the API with credentials (CORS preflight)', pre.headers.get('access-control-allow-origin') === 'http://localhost:3000' && pre.headers.get('access-control-allow-credentials') === 'true', [pre.status, pre.headers.get('access-control-allow-origin')]);
  const evil = await fetch(`${CFG.api}/api/auth/me`, { headers: { origin: 'https://evil.example' } });
  check('ACC-19', 'other origins are not allowed to read responses with cookies', evil.headers.get('access-control-allow-origin') !== 'https://evil.example', evil.headers.get('access-control-allow-origin'));
  const hd = await fetch(`${CFG.api}/api/airports`);
  check('GEN-13', 'server technology not advertised (no X-Powered-By header)', !hd.headers.get('x-powered-by'), hd.headers.get('x-powered-by'));
  const lo = new Client(); await lo.login(et.email, 'Passw0rd1');
  await lo.post('/auth/logout');
  check('ACC-06', 'logout clears both cookies (expired Set-Cookie for access and refresh tokens)', lo.rawSetCookie.filter((c) => /^(access_token|refresh_token)=;/.test(c) && /Expires=Thu, 01 Jan 1970/i.test(c)).length === 2, lo.rawSetCookie);
};
