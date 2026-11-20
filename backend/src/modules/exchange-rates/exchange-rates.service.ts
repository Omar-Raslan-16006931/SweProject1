import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { ExchangeRate } from './exchange-rate.schema';
import { ReferenceService } from '../reference/reference.service';
import { PLATFORM_CURRENCY } from '../../common/enums';

export interface RateTable {
  base: string;
  date: string;
  rates: Record<string, number>;
  stale: boolean;
}

/**
 * ITN-18 / PDF 6.5: FXRatesAPI integration through the backend only.
 * API credentials (if any) stay server-side. Handles invalid codes, missing rates and API failures.
 */
@Injectable()
export class ExchangeRatesService {
  private readonly logger = new Logger(ExchangeRatesService.name);

  constructor(
    @InjectModel(ExchangeRate.name) private model: Model<ExchangeRate>,
    private config: ConfigService,
    private ref: ReferenceService,
  ) {}

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  /** Fetch the latest rates from FXRatesAPI and cache them. Returns null on failure. */
  async fetchAndCache(): Promise<ExchangeRate | null> {
    const codes = await this.ref.supportedCurrencyCodes();
    const base = PLATFORM_CURRENCY;
    const url = new URL('/latest', this.config.get<string>('fxRates.baseUrl'));
    url.searchParams.set('base', base);
    url.searchParams.set('currencies', codes.join(','));
    url.searchParams.set('resolution', '1d');
    url.searchParams.set('amount', '1');
    url.searchParams.set('places', '6');
    const key = this.config.get<string>('fxRates.apiKey');
    if (key) url.searchParams.set('api_key', key);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: any = await res.json();
      if (body?.success === false || !body?.rates) throw new Error(body?.description ?? body?.error ?? 'invalid response');
      const rates: Record<string, number> = { [base]: 1 };
      for (const c of codes) {
        const v = Number(body.rates[c]);
        if (c !== base && Number.isFinite(v) && v > 0) rates[c] = v;
      }
      const date = typeof body.date === 'string' ? body.date.slice(0, 10) : this.today();
      const doc = await this.model.findOneAndUpdate(
        { date },
        { $set: { date, base, rates, fetchedAt: new Date() } },
        { upsert: true, new: true },
      );
      this.logger.log(`Exchange rates cached for ${date}`);
      return doc;
    } catch (e: any) {
      this.logger.warn(`FXRatesAPI request failed: ${e.message}`);
      return null;
    }
  }

  /** Daily refresh (once per day). */
  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async dailyRefresh() {
    await this.fetchAndCache();
  }

  /** Today's rates if cached, otherwise fetch; if the API is unavailable, use the last cached rates. */
  async getRates(): Promise<RateTable> {
    let doc = await this.model.findOne({ fetchedAt: { $gte: new Date(`${this.today()}T00:00:00.000Z`) } }).sort({ fetchedAt: -1 }).lean();
    if (!doc) {
      await this.fetchAndCache();
      doc = await this.model.findOne().sort({ fetchedAt: -1 }).lean();
    }
    if (!doc) {
      throw new ServiceUnavailableException({
        message: 'Exchange rates are currently unavailable and no cached rates exist. Please try again later.',
        code: 'EXCHANGE_RATES_UNAVAILABLE',
      });
    }
    const fetchedToday = new Date(doc.fetchedAt).toISOString().slice(0, 10) === this.today();
    return { base: doc.base, date: doc.date, rates: doc.rates, stale: !fetchedToday };
  }

  async assertSupported(code: string, field = 'currency') {
    return this.ref.assertCurrency(code, field);
  }

  /** Convert using rates relative to the base currency. */
  convert(amount: number, from: string, to: string, table: RateTable): number {
    if (from === to) return amount;
    const rf = table.rates[from];
    const rt = table.rates[to];
    if (!rf || !rt) {
      throw new ServiceUnavailableException({
        message: `No exchange rate available for ${!rf ? from : to}`,
        code: 'EXCHANGE_RATE_MISSING',
      });
    }
    return (amount / rf) * rt;
  }

  async convertAmount(amount: number, from: string, to: string) {
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException({ message: 'amount must be a non-negative number', field: 'amount' });
    const f = await this.assertSupported(from.toUpperCase(), 'from');
    const t = await this.assertSupported(to.toUpperCase(), 'to');
    const table = await this.getRates();
    return {
      amount,
      from: f,
      to: t,
      converted: Math.round(this.convert(amount, f, t, table) * 100) / 100,
      rateDate: table.date,
      stale: table.stale,
    };
  }
}
