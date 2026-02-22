import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto, AuthResponseDto, VerifyEmailDto, SetPasswordDto, ResendVerificationDto, ForgotPasswordDto, ResetPasswordDto } from './dto';
import { TokenType } from '@prisma/client';

@Injectable()
export class AuthService {
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
      // Create organization
      const organization = await tx.organization.create({
        data: {
          name: dto.organizationName,
          slug,
          platformFeePercent: this.configService.get<number>('app.platformFeePercent') || 5,
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

  async login(dto: LoginDto): Promise<AuthResponseDto> {
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
      },
    };
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResponseDto> {
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

    // Mark user as verified and token as used
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: { isEmailVerified: true },
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

  async setPassword(dto: SetPasswordDto): Promise<AuthResponseDto> {
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

    // Send email (fire-and-forget)
    this.emailService.sendPasswordResetEmail(user.email, user.firstName, token);

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

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
