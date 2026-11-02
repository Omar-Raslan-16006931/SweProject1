/**
 * Required database seeding (GEN-12, FLT-02, ACC-18, PDF 5.1).
 *  - countries, cities, airports, attractions: from the OFFICIAL reference datasets (same identifiers for every team)
 *  - supported currencies (team decision: the 7 currencies used by the official Countries dataset)
 *  - the administrator account (no admin self-registration), from ADMIN_* environment variables
 * Idempotent: safe to run multiple times. Usage: npm run seed
 */
import * as dotenv from './env-loader';
import mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { readCsv } from './csv';
import { AirportSchema, AttractionSchema, CitySchema, CountrySchema, CurrencySchema } from '../modules/reference/schemas/reference.schemas';
import { UserSchema } from '../modules/users/schemas/user.schema';
import { AccountStatus, Role } from '../common/enums';

dotenv.load();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set (see .env.example)');
  await mongoose.connect(uri);
  const Country = mongoose.model('Country', CountrySchema);
  const City = mongoose.model('City', CitySchema);
  const Airport = mongoose.model('Airport', AirportSchema);
  const Attraction = mongoose.model('Attraction', AttractionSchema);
  const Currency = mongoose.model('Currency', CurrencySchema);
  const User = mongoose.model('User', UserSchema);

  const upsert = async (model: mongoose.Model<any>, docs: any[]) => {
    if (!docs.length) return 0;
    const r = await model.bulkWrite(docs.map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })));
    return r.upsertedCount + r.modifiedCount;
  };

  const countries = readCsv('countries.csv').map((r) => ({ _id: r.code, name: r.name, currency: r.currency }));
  const cities = readCsv('cities.csv').map((r) => ({ _id: r.city_id, name: r.name, countryCode: r.country_code }));
  const airports = readCsv('airports.csv').map((r) => ({
    _id: r.iata_code, name: r.name, cityId: r.city_id, countryCode: r.country_code, timeZone: r.time_zone,
  }));
  const attractions = readCsv('attractions.csv').map((r) => ({ _id: r.attraction_id, name: r.name, cityId: r.city_id }));
  const currencies = readCsv('currencies.csv').map((r) => ({ _id: r.code, name: r.name }));

  console.log(`countries:   ${countries.length} (${await upsert(Country, countries)} written)`);
  console.log(`cities:      ${cities.length} (${await upsert(City, cities)} written)`);
  console.log(`airports:    ${airports.length} (${await upsert(Airport, airports)} written)`);
  console.log(`attractions: ${attractions.length} (${await upsert(Attraction, attractions)} written)`);
  console.log(`currencies:  ${currencies.length} (${await upsert(Currency, currencies)} written)`);

  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set: admin account NOT seeded.');
  } else if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) {
    throw new Error('ADMIN_PASSWORD must have at least 8 characters with at least one letter and one digit');
  } else {
    const existing = await User.findOne({ email });
    if (existing) {
      console.log(`admin:       ${email} already exists (left unchanged)`);
    } else {
      await User.create({
        name: process.env.ADMIN_NAME ?? 'Platform Admin',
        email,
        passwordHash: await bcrypt.hash(password, 12),
        role: Role.ADMIN,
        status: AccountStatus.ACTIVE,
      });
      console.log(`admin:       ${email} created`);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message ?? e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
