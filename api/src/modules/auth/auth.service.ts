import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto, AuthResponseDto, VerifyEmailDto, SetPasswordDto, ResendVerificationDto, ForgotPasswordDto, ResetPasswordDto, MagicLinkRegisterDto } from './dto';
import { TokenType } from '@prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string; email: string }> {
    // Check if email already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Generate organization slug
    const slug = this.generateSlug(dto.organizationName);

    // Check if slug exists
    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug },
    });

    if (existingOrg) {
      throw new ConflictException('Organization name already taken');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Create organization, user, and verification token in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create organization with Pro trial
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 30);

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          platformFeePercent: this.configService.get<number>('app.platformFeePercent') || 5,
          planTier: 'PRO',
          subscriptionStatus: 'TRIALING',
          trialStartDate: now,
          trialEndDate: trialEnd,
        },
      });

      // Create super admin user
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'SUPER_ADMIN',
          isEmailVerified: false,
        },
      });

      // Create default expense categories
      await tx.expenseCategory.createMany({
        data: [
          { organizationId: organization.id, name: 'Supplies' },
          { organizationId: organization.id, name: 'Salary' },
          { organizationId: organization.id, name: 'Transport' },
          { organizationId: organization.id, name: 'Utilities' },
          { organizationId: organization.id, name: 'Equipment' },
          { organizationId: organization.id, name: 'Marketing' },
          { organizationId: organization.id, name: 'Other' },
        ],
      });

      // Create verification token
      const token = crypto.randomBytes(32).toString('hex');
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          token,
          type: TokenType.EMAIL_VERIFICATION,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      return { user, token };
    });

    // Send verification email
    await this.emailService.sendVerificationEmail(
      dto.email.toLowerCase(),
      dto.firstName,
      result.token,
    );

    return {
      message: 'Registration successful. Please check your email to verify your account.',
      email: dto.email.toLowerCase(),
    };
  }

  async registerMagicLink(dto: MagicLinkRegisterDto): Promise<{ message: string; email: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const slug = this.generateSlug(dto.organizationName);

    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug },
    });

    if (existingOrg) {
      throw new ConflictException('Organization name already taken');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 30);

      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          platformFeePercent: this.configService.get<number>('app.platformFeePercent') || 5,
          planTier: 'PRO',
          subscriptionStatus: 'TRIALING',
          trialStartDate: now,
          trialEndDate: trialEnd,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: dto.email.toLowerCase(),
          passwordHash: null,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'SUPER_ADMIN',
          isEmailVerified: false,
        },
      });

      await tx.expenseCategory.createMany({
        data: [
          { organizationId: organization.id, name: 'Supplies' },
          { organizationId: organization.id, name: 'Salary' },
          { organizationId: organization.id, name: 'Transport' },
          { organizationId: organization.id, name: 'Utilities' },
          { organizationId: organization.id, name: 'Equipment' },
          { organizationId: organization.id, name: 'Marketing' },
          { organizationId: organization.id, name: 'Other' },
        ],
      });

      const token = crypto.randomBytes(32).toString('hex');
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          token,
          type: TokenType.EMAIL_VERIFICATION,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return { user, token };
    });

    await this.emailService.sendMagicLinkEmail(
      dto.email.toLowerCase(),
      dto.firstName,
      result.token,
    );

    return {
      message: 'Account created. Please check your email to activate your account.',
      email: dto.email.toLowerCase(),
    };
  }

  async login(dto: LoginDto): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    if (!user.passwordHash) {
      if (user.googleId) {
        // Google-only user trying password login — send them a link to add a password
        const token = crypto.randomBytes(32).toString('hex');
        await this.prisma.emailVerificationToken.create({
          data: {
            userId: user.id,
            token,
            type: TokenType.PASSWORD_SETUP,
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          },
        });
        this.emailService.sendAddPasswordEmail(user.email, user.firstName, token).catch((err) => {
          this.logger.error(`Failed to send add-password email to ${user.email}: ${err.message}`);
        });
        throw new UnauthorizedException('Your account uses Google Sign-In. We\'ve emailed you a link to set a password.');
      }
      throw new UnauthorizedException('Please check your email for an activation link to set your password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        isPlatformAdmin: user.isPlatformAdmin,
        plan: {
          planTier: user.organization.planTier,
          subscriptionStatus: user.organization.subscriptionStatus,
          trialEndDate: user.organization.trialEndDate,
          isGrandfathered: user.organization.isGrandfathered,
        },
      },
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<any> {
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { token: dto.token },
      include: { user: { include: { organization: true } } },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid verification token');
    }

    if (tokenRecord.usedAt) {
      throw new BadRequestException('This token has already been used');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException('This verification link has expired. Please request a new one.');
    }

    if (tokenRecord.type !== TokenType.EMAIL_VERIFICATION) {
      throw new BadRequestException('Invalid token type');
    }

    // Mark user as verified and token as used; generate password setup token if no password
    const { user, setupToken } = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: { isEmailVerified: true },
      });

      await tx.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });

      let setupToken: string | undefined;
      if (!tokenRecord.user.passwordHash) {
        setupToken = crypto.randomBytes(32).toString('hex');
        await tx.emailVerificationToken.create({
          data: {
            userId: tokenRecord.userId,
            token: setupToken,
            type: TokenType.PASSWORD_SETUP,
            expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
          },
        });
      }

      return { user: tokenRecord.user, setupToken };
    });

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      needsPasswordSetup: !!setupToken,
      setupToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        isPlatformAdmin: user.isPlatformAdmin,
        plan: {
          planTier: user.organization.planTier,
          subscriptionStatus: user.organization.subscriptionStatus,
          trialEndDate: user.organization.trialEndDate,
          isGrandfathered: user.organization.isGrandfathered,
        },
      },
    };
  }

  async setPassword(dto: SetPasswordDto): Promise<any> {
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { token: dto.token },
      include: { user: { include: { organization: true } } },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid token');
    }

    if (tokenRecord.usedAt) {
      throw new BadRequestException('This token has already been used');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException('This invitation link has expired. Please ask your admin to resend the invite.');
    }

    if (tokenRecord.type !== TokenType.PASSWORD_SETUP) {
      throw new BadRequestException('Invalid token type');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash, isEmailVerified: true },
      });

      await tx.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });

      return tokenRecord.user;
    });

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        isPlatformAdmin: user.isPlatformAdmin,
        plan: {
          planTier: user.organization.planTier,
          subscriptionStatus: user.organization.subscriptionStatus,
          trialEndDate: user.organization.trialEndDate,
          isGrandfathered: user.organization.isGrandfathered,
        },
      },
    };
  }

  async resendVerification(dto: ResendVerificationDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Always return same message to prevent email enumeration
    const message = 'If an account with that email exists, a verification email has been sent.';

    if (!user || user.isEmailVerified) {
      return { message };
    }

    // Invalidate old tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        type: TokenType.EMAIL_VERIFICATION,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Create new token
    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        type: TokenType.EMAIL_VERIFICATION,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Send email (fire-and-forget)
    this.emailService.sendVerificationEmail(
      user.email,
      user.firstName,
      token,
    );

    return { message };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const message = 'If an account with that email exists, a password reset link has been sent.';

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      return { message };
    }

    // Invalidate existing PASSWORD_RESET tokens
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        type: TokenType.PASSWORD_RESET,
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });

    // Create new token (1 hour expiry)
    const token = crypto.randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        type: TokenType.PASSWORD_RESET,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    // Send email (fire-and-forget, log errors)
    this.emailService.sendPasswordResetEmail(user.email, user.firstName, token).catch((err) => {
      this.logger.error(`Failed to send password reset email to ${user.email}: ${err.message}`);
    });

    return { message };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<AuthResponseDto> {
    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { token: dto.token },
      include: { user: { include: { organization: true } } },
    });

    if (!tokenRecord) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    if (tokenRecord.usedAt) {
      throw new BadRequestException('This reset link has already been used');
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new BadRequestException('This reset link has expired. Please request a new one.');
    }

    if (tokenRecord.type !== TokenType.PASSWORD_RESET) {
      throw new BadRequestException('Invalid token type');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: { passwordHash },
      });

      await tx.emailVerificationToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      });

      return tokenRecord.user;
    });

    const accessToken = this.generateToken(user);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        isPlatformAdmin: user.isPlatformAdmin,
      },
    };
  }

  async findOrCreateGoogleUser(googleUser: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<string> {
    const email = googleUser.email.toLowerCase();

    // Look up by googleId first
    let user = await this.prisma.user.findFirst({
      where: { googleId: googleUser.googleId },
      include: { organization: true },
    });

    if (!user) {
      // Look up by email (merge case: existing account registered with email/password or magic link)
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
        include: { organization: true },
      });

      if (existingByEmail) {
        // Merge: link googleId to existing account and mark email verified
        user = await this.prisma.user.update({
          where: { id: existingByEmail.id },
          data: { googleId: googleUser.googleId, isEmailVerified: true },
          include: { organization: true },
        });
      } else {
        // New user: create org and account
        const orgName = `${googleUser.firstName}'s Business`;
        const slug = await this.generateUniqueSlug(orgName);

        user = await this.prisma.$transaction(async (tx) => {
          const now = new Date();
          const trialEnd = new Date(now);
          trialEnd.setDate(trialEnd.getDate() + 30);

          const organization = await tx.organization.create({
            data: {
              name: orgName,
              slug,
              platformFeePercent: this.configService.get<number>('app.platformFeePercent') || 5,
              planTier: 'PRO',
              subscriptionStatus: 'TRIALING',
              trialStartDate: now,
              trialEndDate: trialEnd,
            },
          });

          const newUser = await tx.user.create({
            data: {
              organizationId: organization.id,
              email,
              googleId: googleUser.googleId,
              firstName: googleUser.firstName,
              lastName: googleUser.lastName,
              role: 'SUPER_ADMIN',
              isEmailVerified: true,
            },
          });

          await tx.expenseCategory.createMany({
            data: [
              { organizationId: organization.id, name: 'Supplies' },
              { organizationId: organization.id, name: 'Salary' },
              { organizationId: organization.id, name: 'Transport' },
              { organizationId: organization.id, name: 'Utilities' },
              { organizationId: organization.id, name: 'Equipment' },
              { organizationId: organization.id, name: 'Marketing' },
              { organizationId: organization.id, name: 'Other' },
            ],
          });

          return { ...newUser, organization };
        });
      }
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return this.generateToken(user);
  }

  async validateToken(token: string, type: string): Promise<{ valid: boolean; email?: string; firstName?: string }> {
    let tokenType: TokenType;
    if (type === 'PASSWORD_SETUP') {
      tokenType = TokenType.PASSWORD_SETUP;
    } else if (type === 'PASSWORD_RESET') {
      tokenType = TokenType.PASSWORD_RESET;
    } else {
      tokenType = TokenType.EMAIL_VERIFICATION;
    }

    const tokenRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!tokenRecord || tokenRecord.usedAt || tokenRecord.expiresAt < new Date() || tokenRecord.type !== tokenType) {
      return { valid: false };
    }

    return {
      valid: true,
      email: tokenRecord.user.email,
      firstName: tokenRecord.user.firstName,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      isPlatformAdmin: user.isPlatformAdmin,
      plan: {
        planTier: user.organization.planTier,
        subscriptionStatus: user.organization.subscriptionStatus,
        trialEndDate: user.organization.trialEndDate,
        isGrandfathered: user.organization.isGrandfathered,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        isPaystackVerified: user.organization.isPaystackVerified,
      },
    };
  }

  private generateToken(user: { id: string; email: string; organizationId: string; role: string }) {
    const payload = {
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug = this.generateSlug(name);
    let slug = baseSlug;
    let counter = 2;
    while (await this.prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }
    return slug;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
