const { Client, check, setSection, dbc, D, u, ObjectId, newUser, pay, sendWebhook, png, jpg, form } = require('./lib');

// Cairo's local calendar date (hotel stay rules use the hotel's own date, not UTC)
const cairo = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 86400000));

module.exports = async function hotels(ctx) {
  const hm = ctx.hotelMod; const hm2 = ctx.hotelMod2; const admin = ctx.admin; const g = new Client('guest'); const db = await dbc();
  const H = ctx.hotel.id; const H2 = ctx.hotel2.id;
  let r;

  setSection('HTL-01/09/10 — hotel profile & policies');
  r = await hm.patch(`/hotels/${H}`, { description: 'Updated', amenities: ['WiFi', 'Gym'] });
  check('HTL-01', 'hotel moderator edits own hotel', r.status === 200 && r.data.description === 'Updated', r.data);
  r = await hm.patch(`/hotels/${H2}`, { description: 'Hijack' });
  check('HTL-01', 'moderator cannot edit another hotel', r.status === 403, r.status);
  r = await hm.patch(`/hotels/${H}`, { starClass: 9 });
  check('HTL-01', 'invalid star class on edit rejected', r.status === 400, r.status);
  r = await hm.patch(`/hotels/${H}`, { cityId: 'tokyo' });
  check('HTL-01', 'city change to another country without country change rejected', r.status === 400, r.status);
  r = await hm.patch(`/hotels/${H}`, { active: false });
  check('ACC-15', 'moderator cannot deactivate the hotel via profile edit', r.status === 400, r.status);
  r = await hm.put(`/hotels/${H}/policies`, { checkInTime: '25:00' });
  check('HTL-09', 'invalid check-in time rejected', r.status === 400, r.status);
  r = await hm.put(`/hotels/${H}/policies`, { checkInTime: '3pm' });
  check('HTL-09', 'non HH:mm time rejected', r.status === 400, r.status);
  r = await hm.put(`/hotels/${H}/policies`, { cancellationTiers: [{ daysBefore: 3, refundPercent: 50 }, { daysBefore: 3, refundPercent: 70 }] });
  check('HTL-10', 'duplicate thresholds rejected', r.status === 400, r.status);
  r = await hm.put(`/hotels/${H}/policies`, { cancellationTiers: [{ daysBefore: 2, refundPercent: 150 }] });
  check('HTL-10', 'refund % > 100 rejected', r.status === 400, r.status);
  r = await hm.put(`/hotels/${H}/policies`, { checkInTime: '14:00', checkOutTime: '11:00', cancellationTiers: [{ daysBefore: 14, refundPercent: 100 }, { daysBefore: 3, refundPercent: 50 }, { daysBefore: 1, refundPercent: 20 }] });
  check('HTL-09/10', 'set times and tiers', r.status === 200 && r.data.checkInTime === '14:00' && r.data.cancellationPolicy.length === 3, r.data);
  r = await hm2.put(`/hotels/${H}/policies`, { checkInTime: '10:00' });
  check('HTL-09', 'other moderator cannot set my policies', r.status === 403, r.status);

  setSection('HTL-03/04 — rooms & availability');
  const room = (o) => ({ number: o.number, type: o.type ?? 'Double', beds: o.beds ?? 1, maxOccupancy: o.occ ?? 2, pricePerNight: o.price ?? 80 });
  for (const [k, v] of [['maxOccupancy', 0], ['pricePerNight', 0], ['pricePerNight', -1], ['beds', 0], ['maxOccupancy', 1.5]]) {
    r = await hm.post(`/hotels/${H}/rooms`, { ...room({ number: 'bad' }), [k]: v });
    check('HTL-03', `room ${k}=${v} rejected`, r.status === 400, r.status);
  }
  r = await hm.post(`/hotels/${H}/rooms`, { ...room({ number: '' }) });
  check('HTL-03', 'empty room number rejected', r.status === 400, r.status);
  const R = {};
  for (const spec of [{ number: '101', type: 'Single', occ: 1, price: 50 }, { number: '102', occ: 2, price: 80 }, { number: '103', type: 'Family', occ: 4, price: 150, beds: 3 }, { number: '104', occ: 2, price: 90 }, { number: '105', occ: 2, price: 95 }]) {
    r = await hm.post(`/hotels/${H}/rooms`, room(spec));
    R[spec.number] = r.data;
  }
  check('HTL-03', 'moderator adds rooms', Object.values(R).every((x) => x?.id), R);
  r = await hm.post(`/hotels/${H}/rooms`, room({ number: '101' }));
  check('HTL-03', 'duplicate room number within hotel rejected', r.status === 409, r.status);
  r = await hm.post(`/hotels/${H}/rooms`, room({ number: ' 101 ' }));
  check('HTL-03', 'duplicate room number with spaces rejected', r.status === 409, r.status);
  r = await hm2.post(`/hotels/${H2}/rooms`, room({ number: '101', price: 300 }));
  check('HTL-03', 'same room number in a different hotel allowed', r.status === 201, r.status);
  const R2 = r.data;
  r = await hm2.post(`/hotels/${H}/rooms`, room({ number: '999' }));
  check('HTL-03', 'other hotel moderator cannot add rooms to my hotel', r.status === 403, r.status);
  r = await ctx.user.post(`/hotels/${H}/rooms`, room({ number: '998' }));
  check('HTL-03', 'user cannot add rooms', r.status === 403, r.status);
  // availability
  const av = (id, from, to) => hm.post(`/hotels/${H}/rooms/${id}/availability`, { from, to });
  r = await av(R['101'].id, D(10), D(5));
  check('HTL-04', 'availability range with to < from rejected', r.status === 400, r.status);
  r = await av(R['101'].id, '2027-02-30', '2027-03-05');
  check('HTL-04', 'impossible date rejected', r.status === 400, r.status);
  for (const k of Object.keys(R)) await av(R[k].id, D(0), D(60));
  r = await av(R['101'].id, D(50), D(70));
  check('HTL-04', 'overlapping availability range rejected', r.status === 409 || r.status === 400, r.status);
  r = await av(R['101'].id, D(61), D(120));
  check('HTL-04', 'adjacent non-overlapping range accepted', r.status === 201 || r.status === 200, r.status);
  await hm2.post(`/hotels/${H2}/rooms/${R2.id}/availability`, { from: D(0), to: D(120) });
  r = await hm.post(`/hotels/${H}/rooms/${R2.id}/availability`, { from: D(0), to: D(10) });
  check('HTL-04', 'room of another hotel addressed through my hotel -> 404', r.status === 404 || r.status === 403, r.status);

  setSection('HTL-11/12 — hotel search');
  const S = (q) => g.get('/hotels/search?' + new URLSearchParams(q));
  const has = (x, id) => (x.data.items ?? []).some((h) => h.id === id);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2 });
  check('HTL-11', 'guest search by city finds hotel', r.status === 200 && has(r, H), r.data);
  const hit = r.data.items?.find((h) => h.id === H);
  check('HTL-12', 'listed price = cheapest qualifying room (50)', hit?.pricePerNight === 50, hit);
  r = await S({ countryCode: 'EG', checkIn: D(20), checkOut: D(23), guests: 2 });
  check('HTL-11', 'search by country', has(r, H), r.status);
  r = await S({ countryCode: 'eg', checkIn: D(20), checkOut: D(23), guests: 2 });
  check('HTL-11', 'country code case-insensitive', has(r, H), r.status);
  r = await S({ checkIn: D(20), checkOut: D(23), guests: 2 });
  check('HTL-11', 'missing city and country rejected', r.status === 400, r.status);
  r = await S({ cityId: 'gotham', checkIn: D(20), checkOut: D(23), guests: 2 });
  check('HTL-11', 'unknown city rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: D(-1), checkOut: D(2), guests: 2 });
  check('HTL-11', 'check-in in the past rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(20), guests: 2 });
  check('HTL-11', 'check-out equal to check-in rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(18), guests: 2 });
  check('HTL-11', 'check-out before check-in rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: cairo(0), checkOut: cairo(1), guests: 1 });
  check('HTL-11', 'check-in today allowed', r.status === 200, r.status);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 0 });
  check('HTL-11', 'zero guests rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2, rooms: 0 });
  check('HTL-11', 'zero rooms rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 5 });
  check('HTL-11', 'single room cannot cover 5 guests (max 4) -> hotel not listed', !has(r, H), r.data.items?.length);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 5, rooms: 2 });
  check('HTL-11', 'two rooms (4+2) cover 5 guests -> listed', has(r, H), r.data.items?.length);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2, rooms: 6 });
  check('HTL-11', 'more rooms than the hotel has -> not listed', !has(r, H), null);
  r = await S({ cityId: 'cairo', checkIn: D(55), checkOut: D(65), guests: 1 });
  check('HTL-11', 'stay beyond some rooms\' availability still lists hotel via room 101 (two adjacent ranges)', has(r, H), r.data.items?.map((h) => h.freeRooms));
  r = await S({ cityId: 'cairo', checkIn: D(130), checkOut: D(131), guests: 1 });
  check('HTL-11', 'no room bookable for those dates -> not listed', !has(r, H), null);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2, minPrice: 50, maxPrice: 50 });
  check('HTL-12', 'price filter inclusive', has(r, H), null);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2, minPrice: 51 });
  check('HTL-12', 'min price above cheapest room excludes hotel', !has(r, H), null);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2, minPrice: 100, maxPrice: 10 });
  check('HTL-12', 'min > max rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2, minRating: 1 });
  check('HTL-12', 'unrated hotels excluded when rating filter set', !has(r, H), null);
  r = await S({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 2, minRating: 6 });
  check('HTL-12', 'rating filter > 5 rejected', r.status === 400, r.status);
  r = await S({ cityId: 'cairo', checkIn: '2027-02-30', checkOut: '2027-03-02', guests: 2 });
  check('HTL-11', 'impossible check-in date rejected', r.status === 400, r.status);

  setSection('HTL-15 / HTL-02 — rooms & details');
  r = await g.get(`/hotels/${H}/rooms/available?checkIn=${D(20)}&checkOut=${D(23)}`);
  check('HTL-15', 'free rooms with type, beds, occupancy, price/night and total stay price', r.status === 200 && r.data.rooms.length === 5 && r.data.rooms.every((x) => x.type && x.beds && x.maxOccupancy && x.pricePerNight && x.totalStayPrice === x.pricePerNight * 3), r.data.rooms);
  r = await g.get(`/hotels/${H}/rooms/available?checkIn=${D(-2)}&checkOut=${D(1)}`);
  check('HTL-15', 'past dates rejected', r.status === 400, r.status);
  r = await g.get(`/hotels/${H}?checkIn=${D(20)}&checkOut=${D(23)}`);
  check('HTL-02', 'details: profile, photos, amenities, check-in/out, policy, rating, reviews, rooms for dates', r.status === 200 && r.data.checkInTime === '14:00' && r.data.checkOutTime === '11:00' && Array.isArray(r.data.photos) && Array.isArray(r.data.amenities) && r.data.cancellationPolicy.length === 3 && 'averageRating' in r.data && r.data.reviews && r.data.availableRooms?.length === 5, Object.keys(r.data));
  r = await g.get(`/hotels/${new ObjectId()}`);
  check('HTL-02', 'unknown hotel 404', r.status === 404, r.status);

  setSection('HTL-16/18 — reservations & holds');
  const ut = await newUser('Hotel Guest');
  const book = (c, o) => c.post('/hotel-bookings', { hotelId: H, checkIn: o.ci ?? D(20), checkOut: o.co ?? D(23), rooms: o.rooms });
  r = await new Client().post('/hotel-bookings', { hotelId: H, checkIn: D(20), checkOut: D(23), rooms: [{ roomId: R['102'].id, adults: 1 }] });
  check('ACC-10', 'guest cannot book a hotel (401)', r.status === 401, r.status);
  r = await book(ut, { rooms: [{ roomId: R['102'].id, adults: 0, childrenAges: [5] }] });
  check('HTL-16', 'reservation needs at least one adult', r.status === 400, r.status);
  r = await book(ut, { rooms: [{ roomId: R['102'].id, adults: 2, childrenAges: [5] }] });
  check('HTL-16', 'room guests exceeding max occupancy rejected', r.status === 400, r.status);
  r = await book(ut, { rooms: [{ roomId: R['102'].id, adults: 1, childrenAges: [18] }] });
  check('HTL-16', 'child age 18 rejected (children 0-17)', r.status === 400, r.status);
  r = await book(ut, { rooms: [{ roomId: R['102'].id, adults: 1, childrenAges: [-1] }] });
  check('HTL-16', 'negative child age rejected', r.status === 400, r.status);
  r = await book(ut, { rooms: [{ roomId: R['102'].id, adults: 1 }, { roomId: R['102'].id, adults: 1 }] });
  check('HTL-16', 'same room twice rejected', r.status === 400, r.status);
  r = await book(ut, { rooms: [{ roomId: R['102'].id, adults: 1 }, { roomId: R2.id, adults: 1 }] });
  check('HTL-16', 'rooms from two hotels in one reservation rejected', r.status === 400, r.status);
  r = await book(ut, { rooms: [] });
  check('HTL-16', 'no rooms rejected', r.status === 400, r.status);
  r = await book(ut, { ci: D(-1), co: D(2), rooms: [{ roomId: R['102'].id, adults: 1 }] });
  check('HTL-18', 'check-in in the past rejected', r.status === 400, r.status);
  r = await book(ut, { ci: D(23), co: D(20), rooms: [{ roomId: R['102'].id, adults: 1 }] });
  check('HTL-18', 'check-out before check-in rejected', r.status === 400, r.status);
  r = await book(ut, { ci: D(130), co: D(132), rooms: [{ roomId: R['102'].id, adults: 1 }] });
  check('HTL-04', 'dates outside the room\'s bookable ranges rejected', r.status === 409 || r.status === 400, r.status);
  r = await book(ut, { rooms: [{ roomId: R['103'].id, adults: 2, childrenAges: [4, 10] }, { roomId: R['101'].id, adults: 1 }] });
  check('HTL-16/18', 'multi-room reservation held as one Pending Payment reservation', r.status === 201 && r.data.status === 'Pending Payment' && r.data.rooms.length === 2, r.data);
  check('HTL-16', 'total = sum over rooms of nights x price (3x150 + 3x50 = 600)', r.data.total === 600, r.data.total);
  const res1 = r.data;
  const hm_ = (new Date(res1.holdExpiresAt) - Date.now()) / 60000;
  check('HTL-18', 'hold lasts 10 minutes', hm_ > 9.5 && hm_ <= 10.05, hm_);
  r = await g.get(`/hotels/${H}/rooms/available?checkIn=${D(21)}&checkOut=${D(22)}`);
  check('HTL-18', 'held rooms disappear from availability (unexpired hold)', !r.data.rooms.some((x) => [R['101'].id, R['103'].id].includes(x.id)), r.data.rooms.map((x) => x.number));
  r = await book(ctx.user, { ci: D(22), co: D(25), rooms: [{ roomId: R['101'].id, adults: 1 }] });
  check('HTL-18', 'overlapping stay on a held room rejected', r.status === 409, r.status);
  r = await book(ctx.user, { ci: D(23), co: D(25), rooms: [{ roomId: R['101'].id, adults: 1 }] });
  check('HTL-18', 'back-to-back stay (check-in on previous check-out day) allowed', r.status === 201, r.data);
  const backToBack = r.data;
  // all-or-nothing: one free room + one held room -> nothing held
  r = await book(ctx.user, { ci: D(20), co: D(21), rooms: [{ roomId: R['104'].id, adults: 1 }, { roomId: R['103'].id, adults: 1 }] });
  check('HTL-18', 'request with one unavailable room rejected as a whole', r.status === 409, r.status);
  r = await g.get(`/hotels/${H}/rooms/available?checkIn=${D(20)}&checkOut=${D(21)}`);
  check('HTL-18', '...and nothing was held (104 still free)', r.data.rooms.some((x) => x.id === R['104'].id), r.data.rooms.map((x) => x.number));
  // concurrency: 10 users race for room 105 same dates
  const users = await Promise.all(Array.from({ length: 10 }, () => newUser('Room Racer')));
  const race = await Promise.all(users.map((c) => book(c, { ci: D(30), co: D(33), rooms: [{ roomId: R['105'].id, adults: 1 }] })));
  check('HTL-18', '10 concurrent reservations of one room -> exactly 1 succeeds', race.filter((x) => x.status === 201).length === 1, race.map((x) => x.status));
  // partially overlapping concurrent ranges
  const race2 = await Promise.all([
    book(users[0], { ci: D(40), co: D(43), rooms: [{ roomId: R['104'].id, adults: 1 }] }),
    book(users[1], { ci: D(42), co: D(45), rooms: [{ roomId: R['104'].id, adults: 1 }] }),
    book(users[2], { ci: D(41), co: D(42), rooms: [{ roomId: R['104'].id, adults: 1 }] }),
  ]);
  check('HTL-18', 'concurrent partially-overlapping stays -> exactly one wins', race2.filter((x) => x.status === 201).length === 1, race2.map((x) => x.status));
  // crossed multi-room race: A wants [102,104], B wants [104,102] for same dates
  const race3 = await Promise.all([
    book(users[3], { ci: D(47), co: D(48), rooms: [{ roomId: R['102'].id, adults: 1 }, { roomId: R['104'].id, adults: 1 }] }),
    book(users[4], { ci: D(47), co: D(48), rooms: [{ roomId: R['104'].id, adults: 1 }, { roomId: R['102'].id, adults: 1 }] }),
  ]);
  const locks = await db.collection('room_night_locks').countDocuments({ room: { $in: [new ObjectId(R['102'].id), new ObjectId(R['104'].id)] }, date: new Date(D(47)) });
  check('HTL-18', 'crossed multi-room race: at most one wins and no orphan locks remain', race3.filter((x) => x.status === 201).length <= 1 && locks === 2 * race3.filter((x) => x.status === 201).length, { st: race3.map((x) => x.status), locks });

  setSection('HTL-17 / PAY — confirmation');
  r = await ut.post('/payments', { bookingType: 'hotel', bookingId: res1.id });
  check('PAY-02', 'hotel payment blocked until policies accepted', r.status === 400, r.status);
  r = await ut.get(`/bookings/hotel/${res1.id}/policies`);
  check('PAY-02', 'hotel policies: cancellation + check-in/out times', r.status === 200 && r.data.checkInTime === '14:00' && r.data.checkOutTime === '11:00' && r.data.cancellationPolicy.length === 3, r.data);
  const p = await pay(ut, 'hotel', res1.id);
  r = await ut.get(`/hotel-bookings/${res1.id}`);
  check('HTL-17', 'reservation Confirmed with unique reference after webhook', r.data.status === 'Confirmed' && /^HT-[A-Z0-9]{8}$/.test(r.data.reference), { st: r.data.status, ref: r.data.reference, err: p.error });
  const refH = r.data.reference;
  const n = await db.collection('notifications').countDocuments({ user: new ObjectId(ut.id), type: 'booking_confirmed' });
  check('HTL-17 / GEN-01', 'confirmation notification', n === 1, n);
  r = await ut.get('/hotel-bookings');
  check('HTL-20', 'my reservations (upcoming) show reference, hotel, rooms, dates, guests, total, status', r.data.items.some((x) => x.id === res1.id && x.reference === refH && x.hotel && x.rooms.length === 2 && x.checkIn === D(20) && x.guests.adults === 3 && x.guests.children === 2 && x.total === 600), r.data.items);
  r = await ctx.user.get(`/hotel-bookings/${res1.id}`);
  check('ACC-11', "another user cannot view my reservation", r.status === 404 || r.status === 403, r.status);
  r = await hm.get(`/hotel-bookings/${res1.id}`);
  check('ACC-11 / HTL-22', 'hotel moderator can view reservations of own hotel', r.status === 200, r.status);
  r = await hm2.get(`/hotel-bookings/${res1.id}`);
  check('ACC-11', 'other hotel moderator cannot', r.status === 404 || r.status === 403, r.status);
  r = await ctx.airMod.get(`/hotel-bookings/${res1.id}`);
  check('ACC-11', 'airline moderator cannot view hotel reservations', r.status === 403 || r.status === 404, r.status);
  r = await hm.get(`/hotels/${H}/reservations`);
  check('HTL-22', 'moderator lists hotel reservations (guest, dates, status)', r.status === 200 && r.data.items.some((x) => x.reference === refH && x.guest && x.checkIn && x.status === 'Confirmed'), r.data.items?.[0]);
  r = await hm2.get(`/hotels/${H}/reservations`);
  check('HTL-22', 'other moderator cannot list my reservations', r.status === 403, r.status);

  setSection('HTL-05/06/08 — inventory management with reservations');
  r = await hm.patch(`/hotels/${H}/rooms/${R['103'].id}`, { pricePerNight: 999 });
  r = await ut.get(`/hotel-bookings/${res1.id}`);
  check('HTL-05', 'room price change does not affect existing reservation', r.data.total === 600, r.data.total);
  await hm.patch(`/hotels/${H}/rooms/${R['103'].id}`, { pricePerNight: 150 });
  const room103 = (await hm.get(`/hotels/${H}/rooms?page=1`)).data.items.find((x) => x.id === R['103'].id);
  const rangeId = room103.availability[0].id;
  r = await hm.patch(`/hotels/${H}/rooms/${R['103'].id}/availability`, { action: 'update', rangeId, from: D(25), to: D(60) });
  check('HTL-05', 'availability cannot be removed for dates with confirmed reservations', r.status === 409, r.status);
  r = await hm.patch(`/hotels/${H}/rooms/${R['103'].id}/availability`, { action: 'remove', rangeId });
  check('HTL-05', 'removing the whole range with a reservation rejected', r.status === 409, r.status);
  r = await hm.patch(`/hotels/${H}/rooms/${R['103'].id}/availability`, { action: 'block', from: D(21), to: D(21), reason: 'Maintenance' });
  check('HTL-06', 'blocking over a Confirmed reservation rejected', r.status === 409, r.status);
  r = await hm.patch(`/hotels/${H}/rooms/${R['101'].id}/availability`, { action: 'block', from: D(24), to: D(24) });
  check('HTL-06', 'blocking over a Pending Payment reservation rejected', r.status === 409, r.status);
  r = await hm.patch(`/hotels/${H}/rooms/${R['103'].id}`, { active: false });
  check('HTL-06', 'deactivating a room with reservations rejected', r.status === 409, r.status);
  r = await hm.del(`/hotels/${H}/rooms/${R['103'].id}`);
  check('HTL-06', 'deleting a reserved room rejected', r.status === 409, r.status);
  r = await hm.patch(`/hotels/${H}/rooms/${R['104'].id}/availability`, { action: 'block', from: D(10), to: D(12), reason: 'Paint' });
  check('HTL-06', 'block free dates', r.status === 200 && r.data.blocks.length === 1, r.data);
  const blockId = r.data.blocks?.[0]?.id;
  r = await hm.patch(`/hotels/${H}/rooms/${R['104'].id}/availability`, { action: 'block', from: D(11), to: D(13) });
  check('HTL-06', 'overlapping block rejected', r.status === 409, r.status);
  r = await book(ctx.user, { ci: D(11), co: D(12), rooms: [{ roomId: R['104'].id, adults: 1 }] });
  check('HTL-18', 'booking a blocked night rejected', r.status === 409, r.status);
  r = await g.get('/hotels/search?' + new URLSearchParams({ cityId: 'cairo', checkIn: D(10), checkOut: D(13), guests: 1, rooms: 5 }));
  check('HTL-11', 'blocked room not counted as free in search (only 4 free -> hotel not listed for 5 rooms)', !has(r, H), r.data.items?.map((x) => x.freeRooms));
  r = await hm.get(`/hotels/${H}/availability?from=${D(10)}&to=${D(21)}`);
  const grid = r.data.rooms;
  const g104 = grid?.find((x) => x.roomId === R['104'].id)?.days.find((d) => d.date === D(11));
  const g103 = grid?.find((x) => x.roomId === R['103'].id)?.days.find((d) => d.date === D(20));
  const g105 = grid?.find((x) => x.roomId === R['105'].id)?.days.find((d) => d.date === D(15));
  check('HTL-08', 'grid: Blocked', g104?.status === 'Blocked', g104);
  check('HTL-08', 'grid: Booked with reservation reference', g103?.status === 'Booked' && g103.reservationReference === refH, g103);
  check('HTL-08', 'grid: Available', g105?.status === 'Available', g105);
  r = await hm.get(`/hotels/${H}/availability?from=${D(20)}&to=${D(10)}`);
  check('HTL-08', 'grid with to < from rejected', r.status === 400, r.status);
  r = await hm2.get(`/hotels/${H}/availability?from=${D(10)}&to=${D(21)}`);
  check('HTL-08', 'other moderator cannot view my grid', r.status === 403, r.status);
  r = await hm.patch(`/hotels/${H}/rooms/${R['104'].id}/availability`, { action: 'unblock', rangeId: blockId });
  check('HTL-06', 'unblock', r.status === 200 && r.data.blocks.length === 0, r.status);
  const fresh = (await hm.post(`/hotels/${H}/rooms`, room({ number: 'TMP' }))).data;
  r = await hm.del(`/hotels/${H}/rooms/${fresh.id}`);
  check('HTL-06', 'never-reserved room can be deleted', r.status === 200, r.status);
  r = await hm.patch(`/hotels/${H}/rooms/${R['105'].id}`, { active: false });
  // 105 has a pending hold from the race -> should be rejected
  check('HTL-06', 'deactivating a room with a Pending Payment hold rejected', r.status === 409, r.status);

  setSection('HTL-18 — hold expiry');
  const winner = race.findIndex((x) => x.status === 201);
  const held = race[winner].data;
  await db.collection('hotel_reservations').updateOne({ _id: new ObjectId(held.id) }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
  await db.collection('room_night_locks').updateMany({ reservation: new ObjectId(held.id) }, { $set: { expiresAt: new Date(Date.now() - 1000) } }); // time passes for the hold
  r = await g.get(`/hotels/${H}/rooms/available?checkIn=${D(30)}&checkOut=${D(33)}`);
  check('HTL-18', 'room of an expired hold is free again immediately', r.data.rooms.some((x) => x.id === R['105'].id), r.data.rooms.map((x) => x.number));
  r = await book(users[(winner + 1) % 10], { ci: D(30), co: D(33), rooms: [{ roomId: R['105'].id, adults: 1 }] });
  check('HTL-18', 'another user can now book the released room', r.status === 201, r.data);
  r = await users[winner].get(`/hotel-bookings/${held.id}`);
  check('HTL-18 / GEN-11', 'expired reservation shows Expired', r.data.status === 'Expired', r.data.status);
  r = await users[winner].post('/payments', { bookingType: 'hotel', bookingId: held.id });
  check('PAY-01', 'expired reservation cannot be paid', r.status === 409, r.status);

  setSection('HTL-21 — cancellation');
  // 20 days out, tier 14 -> 100%
  r = await ut.get(`/hotel-bookings/${res1.id}/cancellation-preview`);
  check('HTL-21', 'refund preview on full total (tier 14d -> 100% of 600)', r.status === 200 && r.data.refundPercent === 100 && r.data.refundAmount === 600, r.data);
  // calendar days: check-in tomorrow is 1 day before check-in -> tier daysBefore=1 (20%)
  const tm = (await book(ut, { ci: cairo(1), co: cairo(2), rooms: [{ roomId: R['102'].id, adults: 1 }] })).data;
  await pay(ut, 'hotel', tm.id);
  r = await ut.get(`/hotel-bookings/${tm.id}/cancellation-preview`);
  check('HTL-21 / HTL-10', 'check-in tomorrow = 1 day before check-in -> 20% tier applies', r.data.refundPercent === 20, { days: r.data.daysBeforeCheckIn, pct: r.data.refundPercent });
  // policy change after booking
  await hm.put(`/hotels/${H}/policies`, { cancellationTiers: [{ daysBefore: 0, refundPercent: 0 }] });
  r = await ut.get(`/hotel-bookings/${res1.id}/cancellation-preview`);
  check('PDF 6.4 / PAY-02', 'hotel refund follows the policy accepted at booking, not a later change', r.data.refundPercent === 100, r.data.refundPercent);
  await hm.put(`/hotels/${H}/policies`, { cancellationTiers: [{ daysBefore: 14, refundPercent: 100 }, { daysBefore: 3, refundPercent: 50 }, { daysBefore: 1, refundPercent: 20 }] });
  r = await ctx.user.post(`/hotel-bookings/${res1.id}/cancel`);
  check('ACC-11', 'another user cannot cancel my reservation', r.status === 404 || r.status === 403, r.status);
  r = await ut.post(`/hotel-bookings/${res1.id}/cancel`, { rooms: [R['101'].id] });
  check('HTL-21', 'partial cancellation not supported (whole reservation or nothing)', r.status === 400 || (r.status === 200 && r.data.booking.status === 'Cancelled'), r.status);
  r = await ut.get(`/hotel-bookings/${res1.id}`);
  if (r.data.status !== 'Cancelled') r = { data: (await ut.post(`/hotel-bookings/${res1.id}/cancel`)).data.booking };
  check('HTL-21', 'reservation Cancelled', r.data.status === 'Cancelled', r.data.status);
  r = await g.get(`/hotels/${H}/rooms/available?checkIn=${D(20)}&checkOut=${D(23)}`);
  check('HTL-21', 'all rooms released for those dates', r.data.rooms.some((x) => x.id === R['103'].id), r.data.rooms.map((x) => x.number));
  r = await ut.get(`/hotel-bookings/${res1.id}`);
  check('PAY-03', 'refund recorded and visible', r.data.refund?.amount === 600 && ['Pending', 'Refunded', 'Failed'].includes(r.data.refund?.status), r.data.refund);
  r = await ut.post(`/hotel-bookings/${res1.id}/cancel`);
  check('HTL-21', 'cancel twice -> 409', r.status === 409, r.status);
  // on/after check-in date
  const today = (await book(ut, { ci: cairo(0), co: cairo(2), rooms: [{ roomId: R['104'].id, adults: 1 }] })).data;
  await pay(ut, 'hotel', today.id);
  r = await ut.post(`/hotel-bookings/${today.id}/cancel`);
  check('HTL-21', 'cancellation on the check-in date blocked', r.status === 409, r.status);
  r = await ut.get('/hotel-bookings?group=cancelled');
  check('HTL-20', 'cancelled group', r.data.items.some((x) => x.id === res1.id), null);

  setSection('HTL-23/24 — reviews');
  const stay = (await book(ut, { ci: D(5), co: D(7), rooms: [{ roomId: R['102'].id, adults: 1 }, { roomId: R['104'].id, adults: 1 }] })).data;
  await pay(ut, 'hotel', stay.id);
  r = await ut.post(`/hotel-bookings/${stay.id}/review`, { rating: 5, text: 'Great' });
  check('HTL-23', 'cannot review before the stay is Completed', r.status === 409, r.status);
  // time-travel: the stay happened in the past
  await db.collection('hotel_reservations').updateOne({ _id: new ObjectId(stay.id) }, { $set: { checkIn: new Date(D(-5)), checkOut: new Date(D(-3)) } });
  r = await ut.get(`/hotel-bookings/${stay.id}`);
  check('HTL-23 / GEN-11', 'Confirmed reservation becomes Completed after check-out date', r.data.status === 'Completed', r.data.status);
  r = await ut.get('/hotel-bookings?group=past');
  check('HTL-20', 'completed stay listed under Past', r.data.items.some((x) => x.id === stay.id), null);
  for (const bad of [{ rating: 0 }, { rating: 6 }, { rating: 4.5 }, { rating: 5, text: 'x'.repeat(1001) }, {}]) {
    r = await ut.post(`/hotel-bookings/${stay.id}/review`, bad);
    check('HTL-23', `invalid review ${JSON.stringify(bad).slice(0, 40)} rejected`, r.status === 400, r.status);
  }
  r = await ctx.user.post(`/hotel-bookings/${stay.id}/review`, { rating: 1 });
  check('HTL-23', "cannot review someone else's stay", r.status === 404 || r.status === 403, r.status);
  r = await ut.post(`/hotel-bookings/${stay.id}/review`, { rating: 4, text: 'x'.repeat(1000) });
  check('HTL-23', 'one review per completed reservation (2 rooms, one review, 1000 chars ok)', r.status === 201, r.data);
  const rev = r.data;
  r = await ut.post(`/hotel-bookings/${stay.id}/review`, { rating: 5 });
  check('HTL-23', 'second review on same reservation rejected', r.status === 409, r.status);
  r = await g.get(`/hotels/${H}`);
  check('HTL-23', 'average rating recalculated (4, 1 rating)', r.data.averageRating === 4 && r.data.ratingsCount === 1, { a: r.data.averageRating, c: r.data.ratingsCount });
  const ut2 = await newUser('Second Reviewer');
  const st2 = (await book(ut2, { ci: D(8), co: D(9), rooms: [{ roomId: R['102'].id, adults: 1 }] })).data;
  await pay(ut2, 'hotel', st2.id);
  await db.collection('hotel_reservations').updateOne({ _id: new ObjectId(st2.id) }, { $set: { checkIn: new Date(D(-2)), checkOut: new Date(D(-1)) } });
  r = await ut2.post(`/hotel-bookings/${st2.id}/review`, { rating: 1 });
  r = await g.get(`/hotels/${H}/reviews`);
  check('HTL-24', 'average 2.5 over 2 ratings, newest first', r.data.averageRating === 2.5 && r.data.ratingsCount === 2 && r.data.items[0].rating === 1, { a: r.data.averageRating, items: r.data.items?.map((x) => x.rating) });
  r = await ut2.patch(`/reviews/${rev.id}`, { rating: 1 });
  check('HTL-23', "cannot edit someone else's review", r.status === 404 || r.status === 403, r.status);
  r = await ut.patch(`/reviews/${rev.id}`, { rating: 5 });
  r = await g.get(`/hotels/${H}`);
  check('HTL-23', 'edit recalculates average (5+1)/2 = 3', r.data.averageRating === 3, r.data.averageRating);
  r = await ut.patch(`/reviews/${rev.id}`, { rating: 0 });
  check('HTL-23', 'edit with invalid rating rejected', r.status === 400, r.status);
  r = await ut.del(`/reviews/${rev.id}`);
  r = await g.get(`/hotels/${H}`);
  check('HTL-23', 'delete recalculates average (1, 1 rating)', r.data.averageRating === 1 && r.data.ratingsCount === 1, { a: r.data.averageRating, c: r.data.ratingsCount });
  r = await ut.post(`/hotel-bookings/${stay.id}/review`, { rating: 3 });
  check('HTL-23', 'after deleting, user may review again', r.status === 201, r.status);
  r = await g.get('/hotels/search?' + new URLSearchParams({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 1, minRating: 1, sortBy: 'rating' }));
  check('HTL-12', 'rated hotel now passes rating filter', has(r, H), null);
  r = await g.get(`/hotels/${H}/reviews?page=0`);
  check('HTL-24', 'reviews page=0 rejected', r.status === 400, r.status);
  ctx.reviewId = (await g.get(`/hotels/${H}/reviews`)).data.items[0]?.id;
  ctx.reviewUser = ut2; ctx.reviewer = ut;

  setSection('GEN-08 — hotel photos');
  r = await hm.post(`/hotels/${H}/photos`, form('images', [1, 2, 3].map((i) => ({ buf: png(), type: 'image/png', name: `p${i}.png` }))));
  check('GEN-08', 'upload 3 PNG photos', r.status === 201 && r.data.photos.length === 3, r.data?.photos?.length);
  r = await hm.post(`/hotels/${H}/photos`, form('images', [1, 2, 3].map((i) => ({ buf: png(), type: 'image/png', name: `q${i}.png` }))));
  check('GEN-08', 'more than 5 photos per hotel rejected', r.status === 400, r.status);
  const hb5 = await Promise.all([0, 1, 2].map(() => hm2.post(`/hotels/${H2}/photos`, form('images', [1, 2].map((i) => ({ buf: jpg(), type: 'image/jpeg', name: `h${i}.jpg` }))))));
  r = await g.get(`/hotels/${H2}`);
  check('GEN-08', 'parallel uploads cannot push a hotel above 5 photos', r.data.photos.length <= 5, { n: r.data.photos.length, st: hb5.map((x) => x.status) });
  r = await hm2.post(`/hotels/${H}/photos`, form('images', [{ buf: png(), type: 'image/png', name: 'x.png' }]));
  check('GEN-08', 'other moderator cannot upload photos to my hotel', r.status === 403, r.status);

  setSection('ACC-15 — hotel deactivation');
  const keep = (await book(ut2, { ci: D(50), co: D(52), rooms: [{ roomId: R['102'].id, adults: 1 }] })).data;
  await pay(ut2, 'hotel', keep.id);
  r = await admin.patch(`/admin/providers/hotel/${H}/deactivate`);
  check('ACC-15', 'admin deactivates hotel', r.status === 200 && r.data.active === false, r.data);
  r = await g.get('/hotels/search?' + new URLSearchParams({ cityId: 'cairo', checkIn: D(20), checkOut: D(23), guests: 1 }));
  check('ACC-15', 'deactivated hotel hidden from search', !has(r, H), null);
  r = await book(ut2, { ci: D(55), co: D(56), rooms: [{ roomId: R['102'].id, adults: 1 }] });
  check('ACC-15', 'deactivated hotel cannot be booked', r.status === 400 || r.status === 409, r.status);
  r = await ut2.get(`/hotel-bookings/${keep.id}`);
  check('ACC-15', 'existing Confirmed reservation stays valid', r.data.status === 'Confirmed', r.data.status);
  const nn = await db.collection('notifications').countDocuments({ user: new ObjectId(ut2.id), type: 'provider_deactivated' });
  const nm = await db.collection('notifications').countDocuments({ user: new ObjectId(hm.id ?? (await hm.get('/auth/me')).data.id), type: 'provider_deactivated' });
  check('ACC-15', 'affected customer and the hotel moderator notified', nn === 1 && nm === 1, { nn, nm });
  await admin.patch(`/admin/providers/hotel/${H}/reactivate`);
  ctx.R = R;
};
