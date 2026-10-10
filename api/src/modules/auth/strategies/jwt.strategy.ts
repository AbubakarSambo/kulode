import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  roles: string[];
}

interface ValidatedUser {
  id: string;
  email: string;
  organizationId: string;
  roles: string[];
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // This guard runs on every authenticated request app-wide, so an uncached lookup here — even a
  // lean one — is a full DB round trip on every single request in the app, not just this one.
  // A short cache trades a few seconds of staleness on deactivation/role changes (same trade
  // SubscriptionReadOnlyGuard already makes for subscription status) for skipping that round trip
  // on nearly every request. Kept shorter than the subscription guard's 30s since isActive/roles
  // are access-control-sensitive, not billing-sensitive. Singleton instance, so the Map is shared
  // across all requests, not per-request.
  private static readonly CACHE_TTL_MS = 10_000;
  private cache = new Map<string, { user: ValidatedUser | null; expiresAt: number }>();

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') || 'fallback-secret',
    });
  }

  // `activeOrganizationId` is undefined for a token issued against the user's own default org
  // (the vast majority of tokens) — that path is unchanged from before multi-org support and
  // stays a single query. It's only set for a token minted by POST /auth/switch-org, in which
  // case we re-verify membership (and pull that org's roles) from UserOrganization on every
  // cache miss rather than trusting the JWT's roles claim, since membership can be revoked.
  private async getValidatedUser(
    userId: string,
    activeOrganizationId?: string,
  ): Promise<ValidatedUser | null> {
    const cacheKey = activeOrganizationId ? `${userId}:${activeOrganizationId}` : userId;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.user;
    }

    // A `select` of only what's actually returned below, not `include: { organization: true }`,
    // which fetched (and discarded) the entire Organization row on every single request. Prisma's
    // default relation strategy runs a belongs-to include as a second query, so that was a whole
    // extra DB round trip on every request in the app for data nothing downstream ever read.
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        organizationId: true,
        roles: true,
        firstName: true,
        lastName: true,
        isPlatformAdmin: true,
        isActive: true,
      },
    });

    let user: ValidatedUser | null = null;
    if (row && row.isActive) {
      if (activeOrganizationId && activeOrganizationId !== row.organizationId) {
        const membership = await this.prisma.userOrganization.findUnique({
          where: { userId_organizationId: { userId, organizationId: activeOrganizationId } },
          select: { roles: true },
        });
        // No membership (revoked since the token was issued, or a forged claim) — fail closed
        // rather than silently falling back to the user's default org.
        user = membership
          ? {
              id: row.id,
              email: row.email,
              organizationId: activeOrganizationId,
              roles: membership.roles,
              firstName: row.firstName,
              lastName: row.lastName,
              isPlatformAdmin: row.isPlatformAdmin,
            }
          : null;
      } else {
        user = {
          id: row.id,
          email: row.email,
          organizationId: row.organizationId,
          roles: row.roles,
          firstName: row.firstName,
          lastName: row.lastName,
          isPlatformAdmin: row.isPlatformAdmin,
        };
      }
    }

    this.cache.set(cacheKey, { user, expiresAt: Date.now() + JwtStrategy.CACHE_TTL_MS });
    return user;
  }

  async validate(payload: JwtPayload) {
    const user = await this.getValidatedUser(payload.sub, payload.organizationId);
    if (!user) {
      throw new UnauthorizedException('User not found, inactive, or no longer a member of this organization');
    }
    return user;
  }
}
