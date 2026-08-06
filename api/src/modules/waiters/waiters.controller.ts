import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WaitersService } from './waiters.service';
import { CreateWaiterDto, UpdateWaiterDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Waiters')
@ApiBearerAuth()
@Controller('waiters')
export class WaitersController {
  constructor(private readonly waitersService: WaitersService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.waitersService.findAll(organizationId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateWaiterDto,
  ) {
    return this.waitersService.create(organizationId, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWaiterDto,
  ) {
    return this.waitersService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.waitersService.remove(organizationId, id);
  }
}
