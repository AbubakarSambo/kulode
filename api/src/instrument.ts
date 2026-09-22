// Must be imported before any other module in main.ts (Sentry patches Node's core modules for
// auto-instrumentation, which only works if it runs before those modules are first required) —
// so this file has no dependency on the NestJS/ConfigModule bootstrap and reads env vars directly.
import * as Sentry from '@sentry/nestjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // This app's requests carry customer names, order details, and payment data — don't ship
    // that to a third party by default. Revisit deliberately if/when that's actually wanted.
    sendDefaultPii: false,
  });
}
