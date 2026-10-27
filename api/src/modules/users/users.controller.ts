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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, SetPinDto, SetOwnPinDto } from './dto';
import { CurrentUser, CurrentUserData, Role, PaginationDto, Can } from '../../common';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users in organization' })
  @ApiResponse({ status: 200, description: 'List of users' })
  @Can('STAFF_MANAGE')
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.usersService.findAll(organizationId, pagination);
  }

  @Get('directory')
  @ApiOperation({
    summary: 'Lightweight staff directory for one or more roles, e.g. assigning a waiter to an order',
    description: 'Unrestricted by role — any authenticated staff member needs this to assign a colleague to an order.',
  })
  @ApiQuery({ name: 'role', enum: Role, isArray: true, description: 'Comma-separated list of roles' })
  @ApiResponse({ status: 200, description: 'Active staff holding any of the given roles' })
  @ApiResponse({ status: 400, description: 'Unknown role' })
  async findDirectory(
    @CurrentUser('organizationId') organizationId: string,
    @Query('role') roleParam: string,
  ) {
    const roles = (roleParam ?? '').split(',').map((r) => r.trim()).filter(Boolean) as Role[];
    const invalid = roles.filter((r) => !Object.values(Role).includes(r));
    if (roles.length === 0 || invalid.length > 0) {
      throw new BadRequestException(`Unknown role(s): ${invalid.join(', ') || roleParam}`);
    }
    return this.usersService.findDirectory(organizationId, roles);
  }

  @Get(':id/waiter-history')
  @ApiOperation({ summary: 'Order history/stats for a staff member (e.g. the Waiters detail view)' })
  @ApiResponse({ status: 200, description: 'Recent orders and totals attributed to this user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOrderHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.usersService.findOrderHistory(id, organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Can('STAFF_MANAGE')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.usersService.findOne(id, organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @Can('STAFF_MANAGE')
  async create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.create(user.organizationId, dto, user.roles);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Can('STAFF_MANAGE')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.update(id, user.organizationId, dto, user.id, user.roles);
  }

  @Post(':id/resend-invite')
  @ApiOperation({ summary: 'Resend invite email to user' })
  @ApiResponse({ status: 200, description: 'Invite resent' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Can('STAFF_MANAGE')
  async resendInvite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.resendInvite(id, user.organizationId, user.roles);
  }

  // Declared before ':id/pin' so "me" never reaches the UUID-parsed route. No @Can — any signed-in
  // user may set their own PIN; the service checks the role can hold one and re-confirms the password.
  @Post('me/pin')
  @ApiOperation({ summary: 'Set or change your own PIN (re-confirms your password)' })
  @ApiResponse({ status: 200, description: 'PIN set' })
  @ApiResponse({ status: 403, description: 'Wrong password, no password on the account, or role cannot hold a PIN' })
  @ApiResponse({ status: 409, description: 'PIN already in use by another staff member' })
  async setOwnPin(
    @Body() dto: SetOwnPinDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.setOwnPin(user.id, user.organizationId, dto);
  }

  @Post(':id/pin')
  @ApiOperation({ summary: 'Set or reset a user\'s quick-login PIN (POS floor roles only)' })
  @ApiResponse({ status: 200, description: 'PIN set' })
  @ApiResponse({ status: 403, description: 'Role is not PIN-eligible' })
  @ApiResponse({ status: 409, description: 'PIN already in use by another staff member' })
  @Can('STAFF_MANAGE')
  async setPin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPinDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.setPin(id, user.organizationId, dto, user.roles);
  }

  @Delete(':id/pin')
  @ApiOperation({ summary: 'Remove a user\'s quick-login PIN' })
  @ApiResponse({ status: 200, description: 'PIN removed' })
  @Can('STAFF_MANAGE')
  async clearPin(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.clearPin(id, user.organizationId, user.roles);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate user' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Can('STAFF_MANAGE')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.usersService.remove(id, user.organizationId, user.id, user.roles);
  }
}
