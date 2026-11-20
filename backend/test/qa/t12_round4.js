const { CFG, Client, check, setSection, dbc, D, L, u, ObjectId, newUser, pay, sendWebhook, png, form, isoDate } = require('./lib');
const { makeModerator } = require('./t2_admin');
const { mkFlight, ECO, BUS } = require('./t3_flights');
const { adult } = require('./t4_fbook');

const localDate = (zone, offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + offsetDays * 86400000));

module.exports = async function round4(ctx) {
  const admin = ctx.admin; const g = new Client(); const db = await dbc();
  let r;

  // ------------------------------------------------------------------ full journey across every module
  setSection('R4 — end-to-end journey (admin -> providers -> traveler -> community -> moderation)');
  const code = ('J' + Math.random().toString(36).slice(2, 4)).toUpperCase();
  const air = (await admin.post('/airlines', { name: 'Journey Air', code })).data;
  const am = await makeModerator(admin, 'airline_moderator', air.id, 'journey-airmod');
  const hotel = (await admin.post('/hotels', { name: 'Journey Paris Hotel', address: '5 Rue de Rivoli', cityId: 'paris', countryCode: 'FR', starClass: 4, amenities: ['WiFi'] })).data;
  const hmod = await makeModerator(admin, 'hotel_moderator', hotel.id, 'journey-hotmod');
  check('ACC-13 / FLT-01 / HTL-01', 'admin set up an airline and a hotel, each with its own moderator', air.id && hotel.id && am.id && hmod.id, null);
  await am.put(`/airlines/${air.id}/baggage-policy`, { extraBagPrice: 35, maxExtraBags: 1 });
  await am.put(`/airlines/${air.id}/cancellation-policy`, { tiers: [{ daysBefore: 30, refundPercent: 80 }, { daysBefore: 0, refundPercent: 0 }] });
  const start = 100;
  const out = (await mkFlight(am, { no: code + '1', from: 'CAI', to: 'CDG', dep: L(start, '06:00'), arr: L(start, '10:30'), cabins: [ECO(50, 300), BUS(8, 1200)] })).data;
  const ret = (await mkFlight(am, { no: code + '2', from: 'CDG', to: 'CAI', dep: L(start + 3, '18:00'), arr: L(start + 3, '23:30'), cabins: [ECO(50, 280)] })).data;
  check('FLT-03', 'airline moderator scheduled outbound and return flights', out?.id && ret?.id, [out, ret]);
  await hmod.put(`/hotels/${hotel.id}/policies`, { checkInTime: '15:00', checkOutTime: '11:00', cancellationTiers: [{ daysBefore: 7, refundPercent: 100 }] });
  const room = (await hmod.post(`/hotels/${hotel.id}/rooms`, { number: 'P1', type: 'Double', beds: 1, maxOccupancy: 2, pricePerNight: 150 })).data;
  await hmod.post(`/hotels/${hotel.id}/rooms/${room.id}/availability`, { from: D(start - 10), to: D(start + 30) });

  const tr = await newUser('Journey Traveler');
  await tr.patch('/users/me', { preferredCurrency: 'EUR' });
  const it = (await tr.post('/itineraries', { title: 'Paris long weekend', countries: ['FR'], startDate: D(start) })).data;
  let days;
  for (let i = 0; i < 4; i++) days = (await tr.post(`/itineraries/${it.id}/days`, { cityId: 'paris' })).data.days;
  check('ITN-05', 'itinerary has 4 Paris days from the start date', days.length === 4 && days[3].date === D(start + 3), days.map((d) => d.date));
  r = await tr.get(`/itineraries/${it.id}/flights?origin=CAI&tripType=round-trip&adults=1`);
  const res0 = r.data.results?.find((x) => x.destinationAirport === 'CDG');
  check('ITN-26', 'flight search from the itinerary finds the outbound on the start date and the return on the last day', r.status === 200 && res0?.outbound.items.some((f) => f.id === out.id) && res0?.return.items.some((f) => f.id === ret.id), r.data);
  const body = { outboundFlightId: out.id, outboundCabinClass: 'Economy', returnFlightId: ret.id, returnCabinClass: 'Economy', passengers: [adult('Journey Traveler', { extraBags: [{ weightKg: 20 }] })] };
  r = await tr.post('/flight-bookings', body);
  check('FLT-21', 'summary: 300 + 280 fares + 2 x 35 bag fees = 650 USD', r.status === 200 && r.data.total === 650 && r.data.currency === 'USD', r.data?.total);
  const fbk = (await tr.post('/flight-bookings/hold', body)).data;
  const fp = await pay(tr, 'flight', fbk.id);
  r = await tr.get(`/flight-bookings/${fbk.id}`);
  check('FLT-23', 'round trip confirmed with one reference', r.data.status === 'Confirmed' && !!r.data.reference && r.data.segments.length === 2, r.data.status);
  const fref = r.data.reference;
  r = await tr.get(`/itineraries/${it.id}/hotels?groupStartDayId=${days[0].id}&guests=2`);
  check('ITN-25', 'hotel search from the Paris group: check-in = day 1, check-out = day after day 4', r.status === 200 && r.data.group.checkIn === D(start) && r.data.group.checkOut === D(start + 4) && r.data.items.some((h) => h.id === hotel.id), r.data.group);
  r = await tr.get(`/hotels/${hotel.id}/rooms/available?checkIn=${D(start)}&checkOut=${D(start + 4)}`);
  check('HTL-15', 'room P1 free for 4 nights, total 600', r.data.rooms?.[0]?.totalStayPrice === 600, r.data.rooms);
  const hbk = (await tr.post('/hotel-bookings', { hotelId: hotel.id, checkIn: D(start), checkOut: D(start + 4), rooms: [{ roomId: room.id, adults: 2 }] })).data;
  await pay(tr, 'hotel', hbk.id);
  r = await tr.get(`/hotel-bookings/${hbk.id}`);
  check('HTL-17', 'hotel reservation confirmed', r.data.status === 'Confirmed' && r.data.total === 600 && r.data.currency === 'USD', r.data.status);
  const href = r.data.reference;
  // budget in mixed currencies, shown in EUR; booking prices stay in USD (PAY-04)
  await tr.post(`/itineraries/${it.id}/days/${days[0].id}/budgets`, { category: 'food', amount: 50, currency: 'EUR' });
  await tr.post(`/itineraries/${it.id}/days/${days[1].id}/activities`, { name: 'Louvre', cost: 22, currency: 'EUR', time: '10:00' });
  r = await tr.get(`/itineraries/${it.id}/budget-summary`);
  check('ITN-18 / PAY-04', 'budget shown in the preferred currency (EUR 72); bookings stay in USD', r.data.currency === 'EUR' && r.data.total === 72, { c: r.data.currency, t: r.data.total });
  r = await tr.get('/notifications');
  check('GEN-01', 'traveler got both booking confirmations', r.data.items.filter((n) => n.type === 'booking_confirmed').length === 2, r.data.items.map((n) => n.type));
  r = await admin.get('/admin/bookings?status=Confirmed');
  const all = (await Promise.all([1, 2, 3, 4, 5].map((p) => admin.get(`/admin/bookings?status=Confirmed&page=${p}`)))).flatMap((x) => x.data.items);
  check('ACC-17', 'admin sees both journey bookings with user and provider', all.some((b) => b.reference === fref && b.provider?.name === 'Journey Air' && b.user?.email === tr.email) && all.some((b) => b.reference === href && b.provider?.name === 'Journey Paris Hotel'), null);
  r = await am.get(`/flights/${out.id}/bookings`);
  check('FLT-29', 'airline moderator sees the booking on the outbound flight', r.data.items.some((b) => b.reference === fref), r.data.items);
  r = await am.get(`/flights/${ret.id}/passengers/export`);
  check('FLT-29', 'passenger CSV of the return flight lists the traveler', r.data.toString().includes('Journey Traveler') && r.data.toString().includes(fref), null);
  r = await hmod.get(`/hotels/${hotel.id}/reservations`);
  check('HTL-22', 'hotel moderator sees the reservation with guest name', r.data.items.some((x) => x.reference === href && x.guest === 'Journey Traveler'), r.data.items);
  r = await ctx.airMod.get(`/flights/${out.id}/bookings`);
  check('ACC-11', 'another airline\'s moderator cannot see it', r.status === 403, r.status);
  // airline reschedules
  r = await am.patch(`/flights/${out.id}`, { departureLocal: L(start, '07:00'), arrivalLocal: L(start, '11:30') });
  r = await tr.get(`/flight-bookings/${fbk.id}`);
  const n1 = (await tr.get('/notifications')).data.items.filter((n) => n.type === 'flight_schedule_change');
  check('FLT-05 / GEN-01', 'reschedule reflected in the booking and notified', r.data.segments[0].departureLocalTime === L(start, '07:00') && n1.length === 1, { t: r.data.segments[0].departureLocalTime, n: n1.length });
  r = await tr.get(`/flight-bookings/${fbk.id}/e-ticket`);
  check('FLT-23', 'e-ticket still downloadable after the change', r.status === 200, r.status);
  r = await tr.get(`/flight-bookings/${fbk.id}/cancellation-preview`);
  check('FLT-26', 'preview uses the accepted tier (100 days out -> 80% of 650 = 520)', r.data.refundPercent === 80 && r.data.refundAmount === 520, r.data);
  // community
  await tr.patch(`/itineraries/${it.id}`, { visibility: 'Public' });
  const reader = await newUser('Journey Reader');
  r = await reader.get('/itineraries/public/search?keyword=Paris&minDays=4&maxDays=4');
  check('ITN-21', 'other users find the published itinerary', r.data.items.some((x) => x.id === it.id), null);
  const cl = (await reader.post(`/itineraries/${it.id}/clone`)).data;
  check('ITN-21', 'clone credits the author', cl.clonedFrom?.authorName === 'Journey Traveler', cl.clonedFrom);
  const post = (await tr.post('/posts', { title: 'Paris in 4 days', body: 'Louvre, cafes and walks.', tags: ['paris', 'france'], status: 'Published' })).data;
  await reader.post(`/posts/${post.id}/like`);
  await reader.post(`/posts/${post.id}/comments`, { body: 'Saving this!' });
  r = await g.get(`/authors/${tr.id}`);
  check('BLG-12', 'author page shows the post and the public itinerary', r.data.posts.items.some((p) => p.id === post.id && p.likeCount === 1 && p.commentCount === 1) && r.data.publicItineraries.items.some((x) => x.id === it.id), null);
  // time passes: the trip happened
  const past = (n) => new Date(Date.now() - n * 86400000);
  await db.collection('flight_bookings').updateOne({ _id: new ObjectId(fbk.id) }, { $set: { 'segments.0.departureTime': past(10), 'segments.1.departureTime': past(7), travelDate: past(10), lastDepartureTime: past(7) } });
  await db.collection('hotel_reservations').updateOne({ _id: new ObjectId(hbk.id) }, { $set: { checkIn: new Date(D(-10)), checkOut: new Date(D(-6)) } });
  r = await tr.get('/flight-bookings?group=past');
  check('GEN-11 / FLT-25', 'trip flights now Completed under Past', r.data.items.some((b) => b.id === fbk.id && b.status === 'Completed'), r.data.items.map((b) => b.status));
  r = await tr.get('/hotel-bookings?group=past');
  check('GEN-11 / HTL-20', 'hotel stay now Completed under Past', r.data.items.some((b) => b.id === hbk.id && b.status === 'Completed'), null);
  r = await tr.post(`/flight-bookings/${fbk.id}/cancel`);
  check('GEN-11', 'completed trip cannot be cancelled', r.status === 409, r.status);
  const rev = (await tr.post(`/hotel-bookings/${hbk.id}/review`, { rating: 5, text: 'Lovely' })).data;
  r = await g.get(`/hotels/${hotel.id}`);
  check('HTL-23 / HTL-02', 'review shows on the hotel page with the new average', r.data.averageRating === 5 && r.data.reviews.items.some((x) => x.id === rev.id), r.data.averageRating);
  await reader.post('/reports', { targetType: 'review', targetId: rev.id, reason: 'Looks fake' });
  const rep = (await admin.get('/admin/reports?targetType=review')).data.items.find((x) => x.targetId === rev.id);
  await admin.patch(`/admin/reports/${rep.id}`, { action: 'hide' });
  r = await g.get(`/hotels/${hotel.id}`);
  check('GEN-10 / HTL-23', 'hidden review leaves the hotel unrated again', r.data.averageRating === null && r.data.ratingsCount === 0, r.data.averageRating);
  r = await admin.get(`/admin/audit-logs?action=content.hidden`);
  check('GEN-07', 'the moderation action is in the audit log', r.data.items.some((x) => x.targetId === rev.id), null);
  await admin.patch(`/admin/providers/hotel/${hotel.id}/deactivate`);
  r = await tr.get(`/hotel-bookings/${hbk.id}`);
  check('ACC-15', 'past reservation still visible after the hotel is deactivated', r.status === 200 && r.data.status === 'Completed', r.status);
  r = await tr.del('/users/me');
  check('ACC-12', 'traveler with only completed trips can deactivate', r.status === 200, r.status);
  r = await g.get(`/posts/${post.id}`);
  check('ACC-12', 'their post disappears', r.status === 404, r.status);
  r = await reader.get(`/itineraries/${cl.id}`);
  check('ITN-21 / ACC-12', "the reader's clone survives the author's deactivation", r.status === 200, r.status);

  // ------------------------------------------------------------------ hotel dates follow the hotel's local calendar
  setSection('R4 — hotel dates in the hotel\'s time zone');
  const tok = (await admin.post('/hotels', { name: 'Tokyo TZ Hotel', address: '1 Ginza', cityId: 'tokyo', countryCode: 'JP', starClass: 3 })).data;
  const tm = await makeModerator(admin, 'hotel_moderator', tok.id, 'tz-hotmod');
  const tr2 = (await tm.post(`/hotels/${tok.id}/rooms`, { number: 'T1', type: 'Single', beds: 1, maxOccupancy: 1, pricePerNight: 90 })).data;
  await tm.post(`/hotels/${tok.id}/rooms/${tr2.id}/availability`, { from: D(-3), to: D(30) });
  const tokyoToday = localDate('Asia/Tokyo'); const tokyoYesterday = localDate('Asia/Tokyo', -1);
  const tz = await newUser('TZ guest');
  r = await tz.post('/hotel-bookings', { hotelId: tok.id, checkIn: tokyoYesterday, checkOut: tokyoToday, rooms: [{ roomId: tr2.id, adults: 1 }] });
  check('HTL-18', "check-in on the hotel's local yesterday rejected (Tokyo)", r.status === 400, { s: r.status, tokyoToday, utcToday: D(0) });
  r = await g.get('/hotels/search?' + new URLSearchParams({ cityId: 'tokyo', checkIn: tokyoYesterday, checkOut: tokyoToday, guests: 1 }));
  check('HTL-11', "search with check-in on Tokyo's local yesterday rejected", r.status === 400, r.status);
  r = await tz.post('/hotel-bookings', { hotelId: tok.id, checkIn: tokyoToday, checkOut: localDate('Asia/Tokyo', 1), rooms: [{ roomId: tr2.id, adults: 1 }] });
  check('HTL-18', "check-in on the hotel's local today allowed", r.status === 201, r.data?.message);

  // ------------------------------------------------------------------ room edits vs existing reservations
  setSection('R4 — room changes vs reservations');
  const rr = (await hmod.post(`/hotels/${hotel.id}/rooms`, { number: 'P2', type: 'Family', beds: 2, maxOccupancy: 4, pricePerNight: 200 })).data;
  await admin.patch(`/admin/providers/hotel/${hotel.id}/reactivate`);
  await hmod.post(`/hotels/${hotel.id}/rooms/${rr.id}/availability`, { from: D(0), to: D(60) });
  const fam = await newUser('Family');
  const fr = (await fam.post('/hotel-bookings', { hotelId: hotel.id, checkIn: D(40), checkOut: D(42), rooms: [{ roomId: rr.id, adults: 2, childrenAges: [3, 6] }] })).data;
  await pay(fam, 'hotel', fr.id);
  r = await hmod.patch(`/hotels/${hotel.id}/rooms/${rr.id}`, { maxOccupancy: 2 });
  check('HTL-05 (dumb input)', 'occupancy cannot drop below the guests of an upcoming reservation (4 booked)', r.status === 409, r.status);
  r = await hmod.patch(`/hotels/${hotel.id}/rooms/${rr.id}`, { maxOccupancy: 5, pricePerNight: 250 });
  check('HTL-05', 'raising occupancy and price is fine; reservation keeps its price', r.status === 200 && (await fam.get(`/hotel-bookings/${fr.id}`)).data.total === 400, r.status);

  // ------------------------------------------------------------------ what is stored in MongoDB
  setSection('R4 — database contents & types');
  const refs = {
    users: ['airline', 'hotel'], flights: ['airline'], flight_bookings: ['user', 'payment', 'refund', 'segments.flight', 'segments.airline'],
    hotel_reservations: ['user', 'hotel', 'payment', 'refund', 'rooms.room'], notifications: ['user'], audit_logs: ['actor'], payments: ['user', 'booking'],
    refunds: ['payment', 'user', 'booking'], reviews: ['hotel', 'reservation', 'user'], comments: ['post', 'author'], likes: ['post', 'user'],
    reports: ['reporter', 'targetId'], itineraries: ['owner', 'transportCosts.dayId'], room_night_locks: ['room', 'hotel', 'reservation'], rooms: ['hotel'], posts: ['author'], sessions: ['user'],
  };
  const strRefs = [];
  for (const [col, fields] of Object.entries(refs)) for (const f of fields) { const n = await db.collection(col).countDocuments({ [f]: { $type: 'string' } }); if (n) strRefs.push(`${col}.${f}: ${n}`); }
  check('PDF 5', 'every reference is stored as an ObjectId (no string ids that break joins)', strRefs.length === 0, strRefs);
  const dates = { flights: ['departureTime', 'arrivalTime'], flight_bookings: ['travelDate', 'holdExpiresAt'], hotel_reservations: ['checkIn', 'checkOut'], itineraries: ['startDate'], sessions: ['lastActivityAt', 'expiresAt'], room_night_locks: ['date'] };
  const strDates = [];
  for (const [col, fields] of Object.entries(dates)) for (const f of fields) { const n = await db.collection(col).countDocuments({ [f]: { $exists: true, $not: { $type: 'date' }, $ne: null } }); if (n) strDates.push(`${col}.${f}: ${n}`); }
  check('PDF 5', 'all dates stored as real Date values', strDates.length === 0, strDates);
  const leak = [];
  for (const col of (await db.listCollections().toArray()).map((c) => c.name)) {
    const doc = await db.collection(col).find({}).limit(200).toArray();
    const txt = JSON.stringify(doc);
    if (col !== 'users' && /passwordHash/.test(txt)) leak.push(`${col}: passwordHash`);
    if (/"(card|cardNumber|cvc|cvv|pan|exp_month)"/i.test(txt)) leak.push(`${col}: card data`);
    if (/\$2[aby]\$/.test(txt) && col !== 'users') leak.push(`${col}: bcrypt hash`);
  }
  check('GEN-13 / PAY-01', 'no password hashes outside users, no card data anywhere in the DB', leak.length === 0, leak);
  const sess = await db.collection('sessions').findOne({});
  check('ACC-19', 'refresh tokens stored only as SHA-256 hashes', /^[a-f0-9]{64}$/.test(sess.refreshTokenHash) && !('refreshToken' in sess), Object.keys(sess));
  const plain = await db.collection('users').countDocuments({ passwordHash: { $not: /^\$2[aby]\$\d\d\$/ } });
  check('GEN-13', 'every stored password is a salted bcrypt hash', plain === 0, plain);
  const ref = { countries: 8, cities: 8, airports: 8, attractions: 8, currencies: 7 };
  const counts = {}; for (const c of Object.keys(ref)) counts[c] = await db.collection(c).countDocuments();
  check('GEN-12 / PDF 5.1', 'reference data seeded exactly once (8 countries, cities, airports, attractions; 7 currencies)', JSON.stringify(counts) === JSON.stringify(ref), counts);
  const admins = await db.collection('users').countDocuments({ role: 'admin' });
  check('ACC-18', 'exactly one seeded admin, none created through the API', admins === 1, admins);
  const badRole = await db.collection('users').countDocuments({ $or: [{ role: 'airline_moderator', airline: null }, { role: 'hotel_moderator', hotel: null }, { role: 'user', $or: [{ airline: { $ne: null } }, { hotel: { $ne: null } }] }, { airline: { $ne: null }, hotel: { $ne: null } }] });
  check('ACC-13', 'every moderator linked to exactly one provider; users to none', badRole === 0, badRole);
};
