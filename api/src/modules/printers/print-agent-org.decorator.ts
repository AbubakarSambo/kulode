import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Reads the organizationId PrintAgentGuard attaches to the request after validating the
// agent's bearer token — the print-agent routes have no logged-in user, so this stands in
// for @CurrentUser('organizationId') on those routes only.
export const PrintAgentOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.organizationId;
});
