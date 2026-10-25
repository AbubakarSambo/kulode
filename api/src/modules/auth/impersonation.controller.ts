import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { StartImpersonationDto } from './dto';
import { CurrentUser, CurrentUserData } from '../../common';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';

// Lives outside /platform on purpose: PlatformAdminGuard guards that whole controller, but a
// "View as" token deliberately reports isPlatformAdmin=false — exit has to be reachable from it.
@ApiTags('Impersonation')
@ApiBearerAuth()
@Controller('impersonation')
export class ImpersonationController {
  constructor(private readonly authService: AuthService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlatformAdminGuard)
  @ApiOperation({ summary: 'Start a read-only "View as Super Admin" session for an organization' })
  @ApiResponse({ status: 200, description: 'Session started; returns a short-lived token for the target org' })
  @ApiResponse({ status: 403, description: 'Not a platform admin' })
  async start(@CurrentUser() user: CurrentUserData, @Body() dto: StartImpersonationDto, @Req() req: any) {
    return this.authService.startImpersonation(user.id, dto.organizationId, {
      reason: dto.reason,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Post('exit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End the current "View as" session' })
  @ApiResponse({ status: 200, description: 'Session ended' })
  async exit(@CurrentUser() user: CurrentUserData) {
    if (!user.impersonationSessionId) {
      throw new BadRequestException('Not in a "View as" session');
    }
    return this.authService.endImpersonation(user.impersonationSessionId);
  }
}
