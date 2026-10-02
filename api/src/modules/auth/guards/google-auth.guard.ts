import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// GoogleStrategy sets no `state` option, so passport-oauth2 falls back to a NullStore (see
// passport-oauth2/lib/strategy.js) — meaning a literal string passed as the `state` authenticate
// option here is sent to Google and echoed back verbatim in req.query.state on the callback, with
// no session/CSRF plumbing involved. That's the only way a query param survives the round trip
// through Google and back, since the whole redirect leaves and re-enters our server.
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const type = typeof req.query?.type === 'string' ? req.query.type.toLowerCase() : undefined;
    const posMode = type === 'retail' ? 'RETAIL' : 'RESTAURANT';
    return { state: posMode };
  }
}
