import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, AuthResponseDto, VerifyEmailDto, SetPasswordDto, ResendVerificationDto, ForgotPasswordDto, ResetPasswordDto, MagicLinkRegisterDto } from './dto';
import { Public, CurrentUser, CurrentUserData } from '../../common';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new organization and super admin' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'Email or organization already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('register-magic-link')
  @ApiOperation({ summary: 'Register without a password — sends a magic activation link' })
  @ApiResponse({ status: 201, description: 'Magic link sent' })
  @ApiResponse({ status: 409, description: 'Email or organization already exists' })
  async registerMagicLink(@Body() dto: MagicLinkRegisterDto) {
    return this.authService.registerMagicLink(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with token' })
  @ApiResponse({ status: 200, description: 'Email verified', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResponseDto> {
    return this.authService.verifyEmail(dto);
  }

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set password for invited user' })
  @ApiResponse({ status: 200, description: 'Password set successfully', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async setPassword(@Body() dto: SetPasswordDto): Promise<AuthResponseDto> {
    return this.authService.setPassword(dto);
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification email' })
  @ApiResponse({ status: 200, description: 'Verification email sent if account exists' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerification(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiResponse({ status: 200, description: 'Password reset successful', type: AuthResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<AuthResponseDto> {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Get('validate-token')
  @ApiOperation({ summary: 'Validate a verification/setup token' })
  @ApiResponse({ status: 200, description: 'Token validation result' })
  async validateToken(
    @Query('token') token: string,
    @Query('type') type: string,
  ) {
    return this.authService.validateToken(token, type);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: CurrentUserData) {
    return this.authService.getProfile(user.id);
  }
}
