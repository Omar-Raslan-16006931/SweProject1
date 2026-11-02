/**
 * OPTIONAL demo data for trying the API in Swagger (approved team assumption #5).
 * Not part of the required seed; never run it against the evaluation database unless intended.
 * Creates: a demo airline + flights for the next 14 days, two demo hotels with rooms and availability,
 * demo moderator accounts and a demo traveler. Idempotent (skips what already exists).
 * Password for all demo accounts: DEMO_PASSWORD (default "Demo12345").
 * Usage: npm run seed   (first)   then   npm run seed:demo
 */
import * as dotenv from './env-loader';
import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { AirlineSchema } from '../modules/flights/schemas/airline.schema';
import { FlightSchema } from '../modules/flights/schemas/flight.schema';
import { HotelSchema, RoomSchema } from '../modules/hotels/schemas/hotel.schema';
import { UserSchema } from '../modules/users/schemas/user.schema';
import { AirportSchema } from '../modules/reference/schemas/reference.schemas';
import { CabinClass, Role } from '../common/enums';

dotenv.load();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  const Airline = mongoose.model('Airline', AirlineSchema);
  const Flight = mongoose.model('Flight', FlightSchema);
  const Hotel = mongoose.model('Hotel', HotelSchema);
  const Room = mongoose.model('Room', RoomSchema);
  const User = mongoose.model('User', UserSchema);
  const Airport = mongoose.model('Airport', AirportSchema);
  await Flight.syncIndexes();
  await Room.syncIndexes();

  if ((await Airport.countDocuments()) === 0) throw new Error('Reference data missing: run "npm run seed" first');
  const pwd = await bcrypt.hash(process.env.DEMO_PASSWORD ?? 'Demo12345', 12);

  // ---- airline + flights
  let airline = await Airline.findOne({ code: 'DM' });
  if (!airline) {
    airline = await Airline.create({
      name: 'Demo Air',
      code: 'DM',
      baggagePolicy: { extraBagPrice: 40, maxExtraBags: 2 },
      cancellationTiers: [
        { daysBefore: 30, refundPercent: 100 },
        { daysBefore: 7, refundPercent: 50 },
        { daysBefore: 1, refundPercent: 10 },
      ],
    });
    const routes = [
      { no: 'DM101', from: 'CAI', to: 'DXB', dep: '08:00', arr: '12:30', addDay: 0 },
      { no: 'DM102', from: 'DXB', to: 'CAI', dep: '14:00', arr: '16:00', addDay: 0 },
      { no: 'DM201', from: 'CAI', to: 'LHR', dep: '09:15', arr: '13:30', addDay: 0 },
      { no: 'DM202', from: 'LHR', to: 'CAI', dep: '15:00', arr: '22:00', addDay: 0 },
      { no: 'DM301', from: 'JFK', to: 'CAI', dep: '18:00', arr: '11:30', addDay: 1 },
      { no: 'DM302', from: 'CAI', to: 'JFK', dep: '13:00', arr: '18:15', addDay: 0 },
    ];
    const airports = new Map((await Airport.find().lean()).map((a: any) => [a._id, a]));
    const docs = [];
    for (let d = 1; d <= 14; d++) {
      for (const r of routes) {
        const depTz = airports.get(r.from).timeZone;
        const arrTz = airports.get(r.to).timeZone;
        const day = DateTime.utc().plus({ days: d }).toISODate();
        const dep = DateTime.fromISO(`${day}T${r.dep}`, { zone: depTz });
        const arr = DateTime.fromISO(`${DateTime.fromISO(day!).plus({ days: r.addDay }).toISODate()}T${r.arr}`, { zone: arrTz });
        docs.push({
          airline: airline._id,
          flightNumber: r.no,
          departureAirport: r.from,
          arrivalAirport: r.to,
          departureTime: dep.toUTC().toJSDate(),
          arrivalTime: arr.toUTC().toJSDate(),
          departureLocalDate: dep.toISODate(),
          cabins: [
            { class: CabinClass.ECONOMY, seats: 150, price: 220, freeBags: 1, maxBagWeightKg: 23, booked: 0, held: 0, available: 150 },
            { class: CabinClass.BUSINESS, seats: 20, price: 900, freeBags: 2, maxBagWeightKg: 32, booked: 0, held: 0, available: 20 },
          ],
        });
      }
    }
    await Flight.insertMany(docs);
    console.log(`Demo Air created with ${docs.length} flights`);
  } else {
    console.log('Demo Air already exists (skipped)');
  }

  // ---- hotels
  const today = DateTime.utc().startOf('day');
  const availability = [{ from: today.toJSDate(), to: today.plus({ days: 365 }).toJSDate() }];
  const hotelsSpec = [
    {
      name: 'Demo Nile Hotel', address: '1 Corniche El Nil', cityId: 'cairo', countryCode: 'EG', starClass: 4,
      amenities: ['WiFi', 'Pool', 'Breakfast'], rooms: [
        { number: '101', type: 'Single', beds: 1, maxOccupancy: 1, pricePerNight: 60 },
        { number: '102', type: 'Double', beds: 2, maxOccupancy: 2, pricePerNight: 90 },
        { number: '103', type: 'Double', beds: 2, maxOccupancy: 3, pricePerNight: 110 },
        { number: '201', type: 'Family Suite', beds: 3, maxOccupancy: 5, pricePerNight: 180 },
      ],
    },
    {
      name: 'Demo Marina Hotel', address: '10 Marina Walk', cityId: 'dubai', countryCode: 'AE', starClass: 5,
      amenities: ['WiFi', 'Gym', 'Spa'], rooms: [
        { number: 'M1', type: 'Double', beds: 2, maxOccupancy: 2, pricePerNight: 200 },
        { number: 'M2', type: 'Double', beds: 2, maxOccupancy: 2, pricePerNight: 210 },
        { number: 'M3', type: 'Suite', beds: 2, maxOccupancy: 4, pricePerNight: 350 },
      ],
    },
  ];
  const hotelIds: any[] = [];
  for (const spec of hotelsSpec) {
    let h = await Hotel.findOne({ name: spec.name });
    if (!h) {
      const { rooms, ...profile } = spec;
      h = await Hotel.create({
        ...profile,
        description: `${spec.name} (demo data).`,
        checkInTime: '15:00',
        checkOutTime: '12:00',
        cancellationTiers: [
          { daysBefore: 14, refundPercent: 100 },
          { daysBefore: 3, refundPercent: 50 },
        ],
      });
      await Room.insertMany(rooms.map((r) => ({ ...r, hotel: h!._id, availability })));
      console.log(`${spec.name} created with ${rooms.length} rooms`);
    } else {
      console.log(`${spec.name} already exists (skipped)`);
    }
    hotelIds.push(h._id);
  }

  // ---- demo accounts
  const accounts = [
    { email: 'demo.airline@example.com', name: 'Demo Airline Moderator', role: Role.AIRLINE_MODERATOR, airline: airline._id },
    { email: 'demo.hotel@example.com', name: 'Demo Hotel Moderator', role: Role.HOTEL_MODERATOR, hotel: hotelIds[0] },
    { email: 'demo.hotel2@example.com', name: 'Demo Hotel Moderator 2', role: Role.HOTEL_MODERATOR, hotel: hotelIds[1] },
    { email: 'demo.traveler@example.com', name: 'Demo Traveler', role: Role.USER },
    { email: 'demo.traveler2@example.com', name: 'Demo Traveler Two', role: Role.USER },
  ];
  for (const a of accounts) {
    if (await User.exists({ email: a.email })) {
      console.log(`${a.email} already exists (skipped)`);
      continue;
    }
    await User.create({ ...a, passwordHash: pwd, termsAcceptedAt: a.role === Role.USER ? new Date() : undefined });
    console.log(`${a.email} created (${a.role})`);
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message ?? e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
