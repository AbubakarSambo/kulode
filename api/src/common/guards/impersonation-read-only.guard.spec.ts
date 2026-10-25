import { ForbiddenException } from '@nestjs/common';
import { ImpersonationReadOnlyGuard } from './impersonation-read-only.guard';

function makeContext(user: any, method: string, originalUrl: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user, method, originalUrl, url: originalUrl }),
    }),
  } as any;
}

describe('ImpersonationReadOnlyGuard', () => {
  const guard = new ImpersonationReadOnlyGuard();
  const impersonating = { id: 'admin-1', organizationId: 'org-1', impersonationSessionId: 'sess-1' };
  const normal = { id: 'user-1', organizationId: 'org-1' };

  it('lets a normal session write', () => {
    expect(guard.canActivate(makeContext(normal, 'POST', '/api/v1/orders'))).toBe(true);
  });

  it('lets unauthenticated (public) requests through', () => {
    expect(guard.canActivate(makeContext(undefined, 'POST', '/api/v1/webhooks/paystack'))).toBe(true);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('allows %s while impersonating', (method) => {
    expect(guard.canActivate(makeContext(impersonating, method, '/api/v1/orders'))).toBe(true);
  });

  it.each([
    ['POST', '/api/v1/orders'],
    ['PATCH', '/api/v1/organizations/current'],
    ['DELETE', '/api/v1/customers/c-1'],
    ['POST', '/api/v1/auth/switch-org'],
    ['POST', '/api/v1/impersonation/start'],
  ])('blocks %s %s while impersonating', (method, url) => {
    expect(() => guard.canActivate(makeContext(impersonating, method, url))).toThrow(ForbiddenException);
  });

  it('allows exiting the session', () => {
    expect(guard.canActivate(makeContext(impersonating, 'POST', '/api/v1/impersonation/exit'))).toBe(true);
  });

  it('does not treat a query string as the exit path', () => {
    expect(() =>
      guard.canActivate(makeContext(impersonating, 'POST', '/api/v1/orders?x=/impersonation/exit')),
    ).toThrow(ForbiddenException);
  });
});
