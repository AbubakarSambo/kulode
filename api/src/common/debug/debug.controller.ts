import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';

// Sentry's own recommended way to verify an install actually reports errors: hit this route and
// confirm the error shows up in the Sentry dashboard. Safe to leave in place — it does nothing but
// throw, no auth/data exposure — but fine to delete once you've confirmed Sentry is wired up.
@ApiExcludeController()
@Public()
@Controller('debug-sentry')
export class DebugController {
  @Get()
  throwError() {
    throw new Error('Test error from /api/v1/debug-sentry — Sentry is wired up correctly if you see this in the dashboard.');
  }
}
