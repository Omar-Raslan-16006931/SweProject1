import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/** Thin wrapper around the Stripe SDK (test mode, PAY-01). Secret key never leaves the backend. */
@Injectable()
export class StripeService {
  private _client: Stripe | null = null;

  constructor(private config: ConfigService) {}

  get configured() {
    return !!this.config.get<string>('stripe.secretKey');
  }

  get client(): Stripe {
    if (!this._client) {
      const key = this.config.get<string>('stripe.secretKey');
      if (!key) {
        throw new ServiceUnavailableException({ message: 'Stripe is not configured on the server (STRIPE_SECRET_KEY)' });
      }
      // STRIPE_API_BASE is only for local testing against a Stripe mock server; leave it empty normally.
      const base = this.config.get<string>('stripe.apiBase');
      if (base) {
        const u = new URL(base);
        this._client = new Stripe(key, {
          host: u.hostname,
          port: Number(u.port || (u.protocol === 'https:' ? 443 : 80)),
          protocol: u.protocol.replace(':', '') as 'http' | 'https',
        });
      } else {
        this._client = new Stripe(key);
      }
    }
    return this._client;
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = this.config.get<string>('stripe.webhookSecret');
    if (!secret) throw new ServiceUnavailableException({ message: 'Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET)' });
    return this.client.webhooks.constructEvent(rawBody, signature, secret);
  }
}
