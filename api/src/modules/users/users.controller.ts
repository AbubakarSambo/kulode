import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, SetPinDto } from './dto';
import { CurrentUser, CurrentUserData, Roles, Role, PaginationDto } from '../../common';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'List all users in organization' })
  @ApiResponse({ status: 200, description: 'List of users' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.findAll(organizationId, pagination);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.usersService.findOne(id, organizationId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.create(user.organizationId, dto, user.role);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.update(id, user.organizationId, dto, user.id, user.role);
  }

  @Post(':id/resend-invite')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Resend invite email to user' })
  @ApiResponse({ status: 200, description: 'Invite resent' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async resendInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.usersService.resendInvite(id, organizationId);
  }

  @Post(':id/pin')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Set or reset a user\'s quick-login PIN (POS floor roles only)' })
  @ApiResponse({ status: 200, description: 'PIN set' })
  @ApiResponse({ status: 403, description: 'Role is not PIN-eligible' })
  @ApiResponse({ status: 409, description: 'PIN already in use by another staff member' })
  async setPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPinDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.usersService.setPin(id, organizationId, dto);
  }

  @Delete(':id/pin')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Remove a user\'s quick-login PIN' })
  @ApiResponse({ status: 200, description: 'PIN removed' })
  async clearPin(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.usersService.clearPin(id, organizationId);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.remove(id, user.organizationId, user.id, user.role);
  }
}
