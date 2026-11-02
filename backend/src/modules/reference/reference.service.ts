import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airport, Attraction, City, Country, Currency } from './schemas/reference.schemas';

@Injectable()
export class ReferenceService {
  constructor(
    @InjectModel(Country.name) private countries: Model<Country>,
    @InjectModel(City.name) private cities: Model<City>,
    @InjectModel(Airport.name) private airports: Model<Airport>,
    @InjectModel(Currency.name) private currencies: Model<Currency>,
    @InjectModel(Attraction.name) private attractions: Model<Attraction>,
  ) {}

  listCountries() {
    return this.countries.find().sort({ name: 1 }).lean();
  }
  listCities(countryCode?: string) {
    return this.cities.find(countryCode ? { countryCode: countryCode.toUpperCase() } : {}).sort({ name: 1 }).lean();
  }
  listAirports(cityId?: string) {
    return this.airports.find(cityId ? { cityId } : {}).sort({ _id: 1 }).lean();
  }
  listCurrencies() {
    return this.currencies.find().sort({ _id: 1 }).lean();
  }
  listAttractions(cityId?: string) {
    return this.attractions.find(cityId ? { cityId } : {}).sort({ _id: 1 }).lean();
  }

  async getAirport(code: string, field = 'airport') {
    const a = await this.airports.findById((code ?? '').toUpperCase()).lean();
    if (!a) throw new BadRequestException({ message: `${field} must be an airport from the predefined list (FLT-02)`, field });
    return a;
  }

  async getCity(cityId: string, field = 'city') {
    const c = await this.cities.findById(cityId).lean();
    if (!c) throw new BadRequestException({ message: `${field} must be a city from the predefined list (GEN-12)`, field });
    return c;
  }

  async getCountry(code: string, field = 'country') {
    const c = await this.countries.findById((code ?? '').toUpperCase()).lean();
    if (!c) throw new BadRequestException({ message: `${field} must be a country from the predefined list (GEN-12)`, field });
    return c;
  }

  async assertCountries(codes: string[], field = 'countries') {
    const upper = [...new Set(codes.map((c) => c.toUpperCase()))];
    const found = await this.countries.countDocuments({ _id: { $in: upper } });
    if (found !== upper.length) {
      throw new BadRequestException({ message: `${field} must only contain countries from the predefined list`, field });
    }
    return upper;
  }

  async assertCurrency(code: string, field = 'currency') {
    const c = await this.currencies.findById((code ?? '').toUpperCase()).lean();
    if (!c) throw new BadRequestException({ message: `${field} must be a supported currency code`, field });
    return c._id;
  }

  async supportedCurrencyCodes(): Promise<string[]> {
    return (await this.currencies.find().lean()).map((c) => c._id);
  }

  airportsInCity(cityId: string) {
    return this.airports.find({ cityId }).lean();
  }

  cityIdsForCountry(code: string) {
    return this.cities.find({ countryCode: code.toUpperCase() }).distinct('_id');
  }
}
