const { Client, check, setSection, dbc, D, L, u, ObjectId, newUser } = require('./lib');

const ECO = (seats = 100, price = 200) => ({ class: 'Economy', seats, price, freeBags: 1, maxBagWeightKg: 23 });
const BUS = (seats = 10, price = 900) => ({ class: 'Business', seats, price, freeBags: 2, maxBagWeightKg: 32 });
let fn = 100;
const nextNo = (p = 'QA') => `${p}${++fn}`;

async function mkFlight(mod, o) {
  const body = { flightNumber: o.no ?? nextNo(), departureAirport: o.from ?? 'CAI', arrivalAirport: o.to ?? 'DXB', departureLocal: o.dep, arrivalLocal: o.arr, cabins: o.cabins ?? [ECO()] };
  return mod.post('/flights', body);
}

module.exports = async function flights(ctx) {
  const mod = ctx.airMod; const mod2 = ctx.airMod2; const admin = ctx.admin; const g = new Client('guest');
  const AIR = ctx.airline.id;
  let r;

  setSection('FLT-02 — airports');
  r = await g.get('/airports');
  check('FLT-02', 'guest can list 8 predefined airports with IATA, name, city, country, tz', r.status === 200 && r.data.length === 8 && r.data.every((a) => a._id && a.name && a.cityId && a.countryCode && a.timeZone), r.data?.length);
  const csv = { CAI: 'Africa/Cairo', DXB: 'Asia/Dubai', LHR: 'Europe/London', JFK: 'America/New_York', CDG: 'Europe/Paris', HND: 'Asia/Tokyo', RUH: 'Asia/Riyadh', FRA: 'Europe/Berlin' };
  check('FLT-02 / PDF 5.1', 'airports match the official Airports.csv (codes + IANA zones)', Object.entries(csv).every(([k, z]) => r.data.find((a) => a._id === k)?.timeZone === z), null);
  r = await mod.post('/flights', { flightNumber: 'ZZ1' });
  r = await admin.get('/airports');

  setSection('FLT-03 — create flight');
  r = await mkFlight(mod, { from: 'CAI', to: 'CAI', dep: L(10, '10:00'), arr: L(10, '12:00') });
  check('FLT-03', 'identical airports rejected', r.status === 400, r.status);
  r = await mkFlight(mod, { from: 'XXX', to: 'DXB', dep: L(10, '10:00'), arr: L(10, '12:00') });
  check('FLT-03 / FLT-02', 'airport not in predefined list rejected', r.status === 400, r.status);
  r = await mkFlight(mod, { from: 'cai', to: 'dxb', dep: L(10, '10:00'), arr: L(10, '15:00') });
  check('FLT-03', 'lowercase IATA codes accepted (normalised)', r.status === 201, r.data);
  r = await mkFlight(mod, { dep: L(-1, '10:00'), arr: L(-1, '15:00') });
  check('FLT-03', 'departure in the past (yesterday) rejected', r.status === 400, r.status);
  const minus1h = new Date(Date.now() + 2 * 3600000 - 3600000); // Cairo = UTC+2, 1h ago local
  const loc = minus1h.toISOString().slice(0, 16);
  r = await mkFlight(mod, { dep: loc, arr: L(1, '23:00') });
  check('FLT-03', 'departure earlier today (1h ago, local Cairo time) rejected', r.status === 400, { status: r.status, dep: loc });
  // arrival compared in UTC: CAI 10:00 (08:00Z) -> DXB 11:00 (07:00Z) is BEFORE departure in UTC
  r = await mkFlight(mod, { from: 'CAI', to: 'DXB', dep: L(12, '10:00'), arr: L(12, '11:00') });
  check('FLT-03', 'arrival later in local clock but earlier in UTC is rejected', r.status === 400, r.data);
  // DXB 10:00 (06:00Z) -> CAI 09:00 (07:00Z) arrives earlier on the local clock but is valid in UTC
  r = await mkFlight(mod, { from: 'DXB', to: 'CAI', dep: L(12, '10:00'), arr: L(12, '09:00') });
  check('FLT-03', 'arrival earlier on local clock but after departure in UTC is accepted', r.status === 201, r.data);
  if (r.status === 201) {
    check('FLT-03 / GEN-06', 'stored UTC times are correct (DXB 10:00 = 06:00Z)', new Date(r.data.departure.utc).toISOString().slice(11, 16) === '06:00', r.data.departure);
    check('GEN-06', 'local times echoed in each airport zone', r.data.departure.localTime.endsWith('10:00') && r.data.arrival.localTime.endsWith('09:00'), r.data);
    check('FLT-17', 'duration computed from UTC (60 min)', r.data.durationMinutes === 60, r.data.durationMinutes);
  }
  r = await mkFlight(mod, { dep: L(12, '10:00'), arr: L(12, '10:00') });
  check('FLT-03', 'arrival equal to departure rejected', r.status === 400, r.status);
  r = await mkFlight(mod, { dep: `${D(12)}T25:00`, arr: L(12, '14:00') });
  check('FLT-03', 'hour 25 rejected', r.status === 400, r.status);
  r = await mkFlight(mod, { dep: '2027-02-30T10:00', arr: '2027-02-30T14:00' });
  check('FLT-03', 'impossible date (Feb 30) rejected', r.status === 400, r.status);
  r = await mkFlight(mod, { dep: '2027-01-10T10:00Z', arr: '2027-01-10T14:00Z' });
  check('FLT-03', 'UTC/offset timestamps rejected (must be airport-local)', r.status === 400, r.status);
  r = await mkFlight(mod, { no: 'QA-1', dep: L(12, '10:00'), arr: L(12, '14:00') });
  check('FLT-03', 'flight number with symbols rejected', r.status === 400, r.status);
  r = await mkFlight(mod, { no: '', dep: L(12, '10:00'), arr: L(12, '14:00') });
  check('FLT-03', 'empty flight number rejected', r.status === 400, r.status);
  // duplicates
  const dupNo = nextNo();
  r = await mkFlight(mod, { no: dupNo, dep: L(15, '08:00'), arr: L(15, '12:00') });
  check('FLT-03', 'create flight', r.status === 201, r.data);
  r = await mkFlight(mod, { no: dupNo, from: 'CAI', to: 'LHR', dep: L(15, '20:00'), arr: L(15, '23:30') });
  check('FLT-03', 'duplicate flight number same airline same departure date rejected', r.status === 409, r.status);
  r = await mkFlight(mod, { no: dupNo.toLowerCase(), dep: L(15, '21:00'), arr: L(15, '23:59') });
  check('FLT-03', 'duplicate check is case-insensitive', r.status === 409, r.status);
  r = await mkFlight(mod, { no: dupNo, dep: L(16, '08:00'), arr: L(16, '12:00') });
  check('FLT-03', 'same flight number on a different date allowed', r.status === 201, r.status);
  r = await mkFlight(mod2, { no: dupNo, dep: L(15, '08:00'), arr: L(15, '12:00') });
  check('FLT-03', 'same number for a different airline on the same date allowed', r.status === 201, r.status);
  // "same departure date" is the local date at the departure airport: JFK 23:30 local and JFK 00:30 next local day
  const jfkNo = nextNo();
  r = await mkFlight(mod, { no: jfkNo, from: 'JFK', to: 'LHR', dep: L(20, '23:30'), arr: L(21, '11:00') });
  const r2 = await mkFlight(mod, { no: jfkNo, from: 'JFK', to: 'LHR', dep: L(21, '00:30'), arr: L(21, '12:00') });
  check('FLT-03', 'duplicate rule uses local departure date (JFK 23:30 vs 00:30 next day both allowed)', r.status === 201 && r2.status === 201, [r.status, r2.status]);
  r = await g.post('/flights', { flightNumber: 'G1', departureAirport: 'CAI', arrivalAirport: 'DXB', departureLocal: L(10, '10:00'), arrivalLocal: L(10, '14:00') });
  check('FLT-03', 'guest cannot create flights', r.status === 401, r.status);
  r = await ctx.user.post('/flights', { flightNumber: 'G1', departureAirport: 'CAI', arrivalAirport: 'DXB', departureLocal: L(10, '10:00'), arrivalLocal: L(10, '14:00') });
  check('FLT-03', 'user cannot create flights', r.status === 403, r.status);
  r = await ctx.hotelMod.post('/flights', { flightNumber: 'G1', departureAirport: 'CAI', arrivalAirport: 'DXB', departureLocal: L(10, '10:00'), arrivalLocal: L(10, '14:00') });
  check('FLT-03', 'hotel moderator cannot create flights', r.status === 403, r.status);
  r = await mod.post('/flights', { flightNumber: 'QA9', departureAirport: 'CAI', arrivalAirport: 'DXB', departureLocal: L(10, '10:00'), arrivalLocal: L(10, '14:00'), airline: ctx.airline2.id });
  check('FLT-03', 'moderator cannot create a flight for another airline via body', r.status === 400 || (r.status === 201 && r.data.airline.id === AIR), r.data?.airline);

  setSection('FLT-04 — cabins');
  r = await mkFlight(mod, { dep: L(18, '10:00'), arr: L(18, '14:00'), cabins: [ECO(), ECO()] });
  check('FLT-04', 'same cabin class twice at creation rejected', r.status === 400, r.status);
  r = await mkFlight(mod, { dep: L(18, '10:00'), arr: L(18, '14:00'), cabins: [{ ...ECO(), class: 'Luxury' }] });
  check('FLT-04', 'class outside fixed set rejected', r.status === 400, r.status);
  for (const [k, v] of [['seats', 0], ['seats', 1.5], ['seats', -3], ['price', 0], ['price', -10], ['price', 10.555], ['freeBags', -1], ['freeBags', 1.5], ['maxBagWeightKg', 0], ['maxBagWeightKg', -5]]) {
    r = await mkFlight(mod, { dep: L(18, '10:00'), arr: L(18, '14:00'), cabins: [{ ...ECO(), [k]: v }] });
    check('FLT-04', `cabin ${k}=${v} rejected`, r.status === 400, r.status);
  }
  r = await mkFlight(mod, { dep: L(18, '10:00'), arr: L(18, '14:00'), cabins: [{ ...ECO(), seats: '50' }] });
  // numeric strings may be coerced; just must not 500
  check('GEN-13', 'numeric string seat count does not crash', r.status < 500, r.status);
  r = await mkFlight(mod, { dep: L(18, '11:00'), arr: L(18, '15:00'), cabins: [] });
  const fc = r.data;
  r = await mod.post(`/flights/${fc.id}/cabins`, ECO(5, 100));
  check('FLT-04', 'add Economy cabin', r.status === 201, r.data);
  r = await mod.post(`/flights/${fc.id}/cabins`, ECO(5, 100));
  check('FLT-04', 'adding the same class again rejected', r.status === 409 || r.status === 400, r.status);
  const par = await Promise.all(['Business', 'Business', 'Business'].map((c) => mod.post(`/flights/${fc.id}/cabins`, BUS())));
  check('FLT-04', 'concurrent adds of the same class create it only once', par.filter((x) => x.status === 201).length === 1, par.map((x) => x.status));
  r = await mod2.post(`/flights/${fc.id}/cabins`, { ...ECO(), class: 'First' });
  check('FLT-04', 'moderator of another airline cannot add cabins', r.status === 403 || r.status === 404, r.status);
  r = await mod.post(`/flights/${new ObjectId()}/cabins`, { ...ECO(), class: 'First' });
  check('FLT-04', 'unknown flight -> 404', r.status === 404, r.status);

  setSection('FLT-08 / FLT-09 — airline policies');
  for (const body of [{ extraBagPrice: 0, maxExtraBags: 2 }, { extraBagPrice: -5, maxExtraBags: 2 }, { extraBagPrice: 30, maxExtraBags: -1 }, { extraBagPrice: 30, maxExtraBags: 1.5 }, { extraBagPrice: 30 }]) {
    r = await mod.put(`/airlines/${AIR}/baggage-policy`, body);
    check('FLT-08', `invalid baggage policy ${JSON.stringify(body)} rejected`, r.status === 400, r.status);
  }
  r = await mod.put(`/airlines/${AIR}/baggage-policy`, { extraBagPrice: 50, maxExtraBags: 2 });
  check('FLT-08', 'set baggage policy', r.status === 200 && r.data.baggagePolicy.extraBagPrice === 50, r.data);
  r = await mod2.put(`/airlines/${AIR}/baggage-policy`, { extraBagPrice: 1, maxExtraBags: 9 });
  check('FLT-08', 'other airline moderator cannot set my baggage policy', r.status === 403, r.status);
  r = await mod.put(`/airlines/${AIR}/cancellation-policy`, { tiers: [{ daysBefore: 7, refundPercent: 50 }, { daysBefore: 7, refundPercent: 80 }] });
  check('FLT-09', 'duplicate thresholds rejected', r.status === 400, r.status);
  for (const t of [{ daysBefore: -1, refundPercent: 50 }, { daysBefore: 1.5, refundPercent: 50 }, { daysBefore: 3, refundPercent: 101 }, { daysBefore: 3, refundPercent: -1 }]) {
    r = await mod.put(`/airlines/${AIR}/cancellation-policy`, { tiers: [t] });
    check('FLT-09', `invalid tier ${JSON.stringify(t)} rejected`, r.status === 400, r.status);
  }
  r = await mod.put(`/airlines/${AIR}/cancellation-policy`, { tiers: [{ daysBefore: 30, refundPercent: 100 }, { daysBefore: 7, refundPercent: 50 }, { daysBefore: 0, refundPercent: 10 }] });
  check('FLT-09', 'set tiers', r.status === 200 && r.data.cancellationTiers.length === 3, r.data);
  r = await mod.put(`/airlines/${ctx.airline2.id}/cancellation-policy`, { tiers: [] });
  check('FLT-09', 'cannot set tiers of another airline', r.status === 403, r.status);
  r = await mod.patch(`/airlines/${AIR}`, { name: 'QA Air Renamed' });
  check('FLT-01', 'moderator edits own airline profile', r.status === 200 && r.data.name === 'QA Air Renamed', r.data);
  r = await mod.patch(`/airlines/${ctx.airline2.id}`, { name: 'Hijacked' });
  check('FLT-01', 'moderator cannot edit another airline', r.status === 403, r.status);
  r = await mod.patch(`/airlines/${AIR}`, { code: ctx.airline2.code });
  check('FLT-01', 'moderator cannot take another airline\'s code', r.status === 409, r.status);
  r = await mod.patch(`/airlines/${AIR}`, { active: false });
  check('ACC-15', 'moderator cannot deactivate own airline via profile edit', r.status === 400, r.status);
  r = await g.get(`/airlines/${AIR}`);
  check('FLT-01', 'public airline profile', r.status === 200 && r.data.name === 'QA Air Renamed', r.status);

  setSection('FLT-11/12/15 — search');
  // fixtures: route CAI->LHR on day 25 with three flights
  const day = 25;
  const fA = (await mkFlight(mod, { from: 'CAI', to: 'LHR', dep: L(day, '06:00'), arr: L(day, '10:00'), cabins: [ECO(3, 300), BUS(2, 1000)] })).data; // 6h
  const fB = (await mkFlight(mod, { from: 'CAI', to: 'LHR', dep: L(day, '09:00'), arr: L(day, '11:00'), cabins: [ECO(50, 150)] })).data; // 4h
  const fC = (await mkFlight(mod2, { from: 'CAI', to: 'LHR', dep: L(day, '22:00'), arr: L(day, '23:30'), cabins: [ECO(50, 450)] })).data; // 3.5h
  const fRet = (await mkFlight(mod, { from: 'LHR', to: 'CAI', dep: L(day + 7, '12:00'), arr: L(day + 7, '19:00'), cabins: [ECO(50, 250)] })).data;
  ctx.fl = { fA, fB, fC, fRet, day };
  const S = (q) => g.get('/flights/search?' + new URLSearchParams(q).toString());
  r = await S({ from: 'CAI', to: 'LHR', date: D(day) });
  const ids = (x) => (x.data.outbound?.items ?? []).map((f) => f.id);
  const mine = (x) => ids(x).filter((i) => [fA.id, fB.id, fC.id].includes(i)); // ignore flights left by earlier runs
  check('FLT-11', 'guest search returns the 3 flights on that date', r.status === 200 && [fA.id, fB.id, fC.id].every((i) => ids(r).includes(i)), ids(r));
  check('FLT-11', 'default sort = departure time ascending', JSON.stringify(mine(r)) === JSON.stringify([fA.id, fB.id, fC.id]), mine(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day + 1) });
  check('FLT-11', 'different date -> "no flights found"', r.status === 200 && r.data.outbound.items.length === 0 && /no flights found/i.test(r.data.outbound.message ?? ''), r.data.outbound);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: 4 });
  check('FLT-11', 'available seats must cover passengers (fA has 3 eco + 2 bus -> excluded for 4)', !ids(r).includes(fA.id) && ids(r).includes(fB.id), ids(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: 2, children: 1 });
  check('FLT-11', '2 adults + 1 child need 3 seats (fA economy exactly 3 -> included)', ids(r).includes(fA.id), ids(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: 3, infants: 3 });
  check('FLT-12b', 'infants occupy no seat (3 adults + 3 infants fit in 3 seats)', ids(r).includes(fA.id), ids(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: 1, infants: 2 });
  check('FLT-12b', 'more infants than adults rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: 0, children: 2 });
  check('FLT-12b', 'search with zero adults rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: -1 });
  check('FLT-11', 'negative passenger count rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), cabinClass: 'Business' });
  check('FLT-12c', 'cabin filter Business -> only fA', r.status === 200 && JSON.stringify(mine(r)) === JSON.stringify([fA.id]) && r.data.outbound.items.every((f) => f.cabins.every((c) => c.class === 'Business')), ids(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), cabinClass: 'Spaceship' });
  check('FLT-12c', 'unknown cabin class rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), minPrice: 150, maxPrice: 300 });
  check('FLT-15', 'price filter inclusive at both ends (150 and 300 included, 450 excluded)', ids(r).includes(fA.id) && ids(r).includes(fB.id) && !ids(r).includes(fC.id), ids(r));
  check('FLT-15', 'price filter preserves other criteria (criteria echoed)', r.data.criteria?.from === 'CAI' && r.data.criteria?.date === D(day), r.data.criteria);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), minPrice: 500, maxPrice: 100 });
  check('FLT-15', 'min > max -> error', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), minPrice: -5 });
  check('FLT-15', 'negative min price rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), sortBy: 'price' });
  check('FLT-15', 'sort by price asc (B 150, A 300(lowest cabin), C 450)', JSON.stringify(mine(r)) === JSON.stringify([fB.id, fA.id, fC.id]), mine(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), sortBy: 'price', sortOrder: 'desc' });
  check('FLT-15', 'sort by price desc', JSON.stringify(mine(r)) === JSON.stringify([fC.id, fA.id, fB.id]), mine(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), sortBy: 'duration' });
  check('FLT-15', 'sort by duration asc (C 3.5h, B 4h, A 6h)', JSON.stringify(mine(r)) === JSON.stringify([fC.id, fB.id, fA.id]), mine(r));
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), sortBy: 'seats' });
  check('FLT-15', 'invalid sort key rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'CAI', date: D(day) });
  check('FLT-11', 'same from/to rejected', r.status === 400, r.status);
  r = await S({ from: 'ABC', to: 'LHR', date: D(day) });
  check('FLT-02', 'search accepts only predefined airports', r.status === 400, r.status);
  r = await S({ to: 'LHR', date: D(day) });
  check('FLT-11', 'missing departure airport rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR' });
  check('FLT-11', 'missing date rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: '2027-02-30' });
  check('FLT-11', 'impossible date (Feb 30) rejected with 400', r.status === 400, { status: r.status, msg: r.data?.outbound?.message });
  r = await S({ from: 'CAI', to: 'LHR', date: '20-12-2026' });
  check('FLT-11', 'malformed date rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(-3) });
  check('FLT-11 (dumb input)', 'departure date in the past rejected with a clear error', r.status === 400, { status: r.status, body: r.data?.outbound?.message ?? r.data?.message });
  // local date semantics (FLT-11): JFK 23:30 local is next day in UTC
  r = await S({ from: 'JFK', to: 'LHR', date: D(20) });
  check('FLT-11 / GEN-06', 'search date is the LOCAL date at the departure airport (JFK 23:30 found on its local date)', r.data.outbound.items.some((f) => f.departure.localTime === L(20, '23:30')), r.data.outbound.items.map((f) => f.departure.localTime));
  // round trip
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), tripType: 'round-trip' });
  check('FLT-12a', 'round trip without returnDate rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), tripType: 'round-trip', returnDate: D(day - 1) });
  check('FLT-12a', 'return date before departure date rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), tripType: 'round-trip', returnDate: D(day + 7) });
  check('FLT-12a', 'round trip returns outbound and return options', r.status === 200 && r.data.outbound.items.length >= 3 && r.data.return?.items?.some((f) => f.id === fRet.id), r.data.return);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), tripType: 'multi-city' });
  check('FLT-12a', 'unknown trip type rejected', r.status === 400, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: 9, children: 9 });
  check('FLT-11', 'large but valid group size does not crash', r.status === 200, r.status);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day), adults: 1000 });
  check('FLT-11', 'absurd passenger count rejected', r.status === 400, r.status);

  setSection('FLT-17 — flight details');
  r = await g.get(`/flights/${fA.id}`);
  const d = r.data;
  check('FLT-17', 'details: airline, flight number, airports, local times, duration', r.status === 200 && d.airline?.name && d.flightNumber && d.departure.airport === 'CAI' && d.arrival.airport === 'LHR' && d.departure.localTime === L(day, '06:00') && d.durationMinutes === 360, d);
  check('FLT-17', 'each cabin shows price, seats remaining, baggage allowance', d.cabins?.every((c) => c.price > 0 && typeof c.seatsRemaining === 'number' && typeof c.freeBags === 'number' && c.maxBagWeightKg > 0), d.cabins);
  check('FLT-17', "airline's cancellation policy shown", Array.isArray(d.cancellationPolicy) && d.cancellationPolicy.length === 3, d.cancellationPolicy);
  r = await g.get(`/flights/${new ObjectId()}`);
  check('FLT-17', 'unknown flight 404', r.status === 404, r.status);
  r = await g.get('/flights/123');
  check('GEN-13', 'malformed flight id 400', r.status === 400, r.status);

  setSection('FLT-05 — edit flight');
  const fe = (await mkFlight(mod, { from: 'CAI', to: 'DXB', dep: L(30, '10:00'), arr: L(30, '14:00'), cabins: [ECO(10, 100)] })).data;
  r = await mod.patch(`/flights/${fe.id}`, { departureLocal: L(30, '11:00'), arrivalLocal: L(30, '15:00') });
  check('FLT-05', 'moderator edits times of own Scheduled flight', r.status === 200 && r.data.departure.localTime === L(30, '11:00'), r.data);
  r = await mod.patch(`/flights/${fe.id}`, { departureLocal: L(30, '16:00') });
  check('FLT-05', 'editing departure to after the existing arrival rejected', r.status === 400, r.status);
  r = await mod.patch(`/flights/${fe.id}`, { departureLocal: L(-2, '10:00'), arrivalLocal: L(-2, '14:00') });
  check('FLT-05', 'editing departure into the past rejected', r.status === 400, r.status);
  r = await mod2.patch(`/flights/${fe.id}`, { departureLocal: L(30, '12:00') });
  check('FLT-05', 'other airline moderator cannot edit', r.status === 403 || r.status === 404, r.status);
  r = await mod.patch(`/flights/${fe.id}`, { arrivalAirport: 'CAI' });
  check('FLT-05', 'editing to identical airports rejected', r.status === 400, r.status);
  r = await mod.patch(`/flights/${fe.id}`, { arrivalAirport: 'RUH' });
  check('FLT-05', 'airports can change while the flight has no booking', r.status === 200 && r.data.arrival.airport === 'RUH', r.data);
  const cab = r.data.cabins[0];
  r = await mod.patch(`/flights/${fe.id}/cabins/${cab.id}`, { price: 0 });
  check('FLT-05', 'cabin price 0 rejected', r.status === 400, r.status);
  r = await mod.patch(`/flights/${fe.id}/cabins/${cab.id}`, { seats: 0 });
  check('FLT-05', 'cabin seats 0 rejected', r.status === 400, r.status);
  r = await mod.patch(`/flights/${fe.id}/cabins/${cab.id}`, { price: 120, seats: 12 });
  check('FLT-05', 'edit cabin price and seats', r.status === 200 && r.data.cabins[0].price === 120 && r.data.cabins[0].seatsRemaining === 12, r.data.cabins);
  r = await mod.patch(`/flights/${fe.id}/cabins/${new ObjectId()}`, { price: 130 });
  check('FLT-05', 'unknown cabin 404', r.status === 404, r.status);
  ctx.fl.fe = fe;

  setSection('FLT-30 / ACC-15 — status & provider visibility');
  const db = await dbc();
  const fDep = (await mkFlight(mod, { from: 'CAI', to: 'LHR', dep: L(day, '13:00'), arr: L(day, '17:00'), cabins: [ECO(10, 100)] })).data;
  await db.collection('flights').updateOne({ _id: new ObjectId(fDep.id) }, { $set: { departureTime: new Date(Date.now() - 60000), arrivalTime: new Date(Date.now() + 3600000) } });
  r = await g.get(`/flights/${fDep.id}`);
  check('FLT-30', 'flight whose departure passed shows Departed', r.data.status === 'Departed', r.data.status);
  r = await mod.patch(`/flights/${fDep.id}`, { arrivalLocal: L(day, '18:00') });
  check('FLT-30', 'Departed flight not editable', r.status === 400 || r.status === 409, r.status);
  r = await mod.post(`/flights/${fDep.id}/cabins`, BUS());
  check('FLT-30', 'Departed flight: cannot add cabins', r.status === 400 || r.status === 409, r.status);
  // deactivated airline hidden
  r = await admin.patch(`/admin/providers/airline/${ctx.airline2.id}/deactivate`);
  check('ACC-15', 'admin deactivates airline', r.status === 200 && r.data.active === false, r.data);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day) });
  check('ACC-15 / FLT-11', 'deactivated airline\'s flights hidden from search', !ids(r).includes(fC.id) && ids(r).includes(fA.id), ids(r));
  r = await admin.patch(`/admin/providers/airline/${ctx.airline2.id}/deactivate`);
  check('ACC-15', 'deactivating twice -> conflict', r.status === 409, r.status);
  r = await admin.patch(`/admin/providers/airline/${ctx.airline2.id}/reactivate`);
  r = await S({ from: 'CAI', to: 'LHR', date: D(day) });
  check('ACC-15', 'reactivated airline visible again', ids(r).includes(fC.id), ids(r));
  r = await admin.patch(`/admin/providers/plane/${ctx.airline2.id}/deactivate`);
  check('ACC-15', 'invalid provider type rejected', r.status === 400, r.status);
  r = await admin.patch(`/admin/providers/hotel/${ctx.airline2.id}/deactivate`);
  check('ACC-15', 'airline id under hotel type -> 404', r.status === 404, r.status);
  r = await mod.patch(`/admin/providers/airline/${ctx.airline2.id}/deactivate`);
  check('ACC-15', 'moderator cannot deactivate providers', r.status === 403, r.status);
};
module.exports.mkFlight = mkFlight; module.exports.ECO = ECO; module.exports.BUS = BUS; module.exports.nextNo = nextNo;
