import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { UpdateOrganizationDto, CreateDirectorDto, UpdateDirectorDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current organization details' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  async findCurrent(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.findOne(organizationId);
  }

  @Patch('current')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update organization settings' })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  async update(
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.organizationsService.update(organizationId, dto);
  }

  @Post('current/logo')
  @Roles(Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload organization logo' })
  @ApiResponse({ status: 200, description: 'Logo uploaded' })
  async uploadLogo(
    @CurrentUser('organizationId') organizationId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('Only image files are allowed');

    const logoUrl = await this.cloudinaryService.uploadImage(
      file.buffer,
      'kulode/logos',
      `org-${organizationId}`,
    );
    return this.organizationsService.update(organizationId, { logo: logoUrl });
  }

  @Delete('current/logo')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remove organization logo' })
  @ApiResponse({ status: 200, description: 'Logo removed' })
  async removeLogo(@CurrentUser('organizationId') organizationId: string) {
    await this.cloudinaryService.deleteImage('kulode/logos', `org-${organizationId}`);
    return this.organizationsService.update(organizationId, { logo: null });
  }

  @Get('onboarding-status')
  @ApiOperation({ summary: 'Get onboarding checklist status' })
  @ApiResponse({ status: 200, description: 'Onboarding status' })
  async getOnboardingStatus(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.getOnboardingStatus(organizationId);
  }

  @Patch('onboarding-dismiss')
  @ApiOperation({ summary: 'Dismiss onboarding checklist' })
  @ApiResponse({ status: 200, description: 'Onboarding dismissed' })
  async dismissOnboarding(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.dismissOnboarding(organizationId);
  }

  @Get('paystack-status')
  @ApiOperation({ summary: 'Get Paystack setup status' })
  @ApiResponse({ status: 200, description: 'Paystack status' })
  async getPaystackStatus(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.getPaystackStatus(organizationId);
  }

  @Get('current/directors')
  @ApiOperation({ summary: 'List organization directors' })
  @ApiResponse({ status: 200, description: 'List of directors' })
  async listDirectors(@CurrentUser('organizationId') organizationId: string) {
    return this.organizationsService.listDirectors(organizationId);
  }

  @Post('current/directors')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add an organization director' })
  @ApiResponse({ status: 201, description: 'Director created' })
  async createDirector(
    @Body() dto: CreateDirectorDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.organizationsService.createDirector(organizationId, dto);
  }

  @Patch('current/directors/:directorId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an organization director' })
  @ApiResponse({ status: 200, description: 'Director updated' })
  @ApiResponse({ status: 404, description: 'Director not found' })
  async updateDirector(
    @Param('directorId', ParseUUIDPipe) directorId: string,
    @Body() dto: UpdateDirectorDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.organizationsService.updateDirector(organizationId, directorId, dto);
  }

  @Delete('current/directors/:directorId')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remove an organization director' })
  @ApiResponse({ status: 200, description: 'Director removed' })
  @ApiResponse({ status: 404, description: 'Director not found' })
  async deleteDirector(
    @Param('directorId', ParseUUIDPipe) directorId: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.organizationsService.deleteDirector(organizationId, directorId);
  }
}
