/**
 * Centralised configuration. All values come from environment variables
 * (see /.env.example). Secrets are never exposed to the frontend.
 */
export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  mongodbUri: process.env.MONGODB_URI ?? '',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? '3001'}`,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
    accessTtlSeconds: parseInt(process.env.JWT_ACCESS_TTL_SECONDS ?? '900', 10),
  },
  cookies: {
    // Secure cookies work on http://localhost in modern browsers (localhost is a secure context).
    secure: (process.env.COOKIE_SECURE ?? 'true') === 'true',
    sameSite: (process.env.COOKIE_SAMESITE ?? 'lax') as 'lax' | 'strict' | 'none',
  },
  session: {
    // ACC-06: 30 minutes without an authenticated request -> session expires.
    inactivityMinutes: parseInt(process.env.SESSION_INACTIVITY_MINUTES ?? '30', 10),
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    apiBase: process.env.STRIPE_API_BASE ?? '',
  },
  fxRates: {
    baseUrl: process.env.FXRATES_API_URL ?? 'https://api.fxratesapi.com',
    apiKey: process.env.FXRATES_API_KEY ?? '',
  },
  admin: {
    name: process.env.ADMIN_NAME ?? 'Platform Admin',
    email: process.env.ADMIN_EMAIL ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
  },
  uploadsDir: process.env.UPLOADS_DIR ?? 'uploads',
  enableTestPaymentEndpoint: (process.env.ENABLE_TEST_PAYMENT_ENDPOINT ?? 'true') === 'true' &&
    (process.env.NODE_ENV ?? 'development') !== 'production',
});
