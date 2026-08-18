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
import { TablesService } from './tables.service';
import { CreateTableDto, UpdateTableDto, UpdateTableStatusDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Restaurant Tables')
@ApiBearerAuth()
@Controller('restaurant-tables')
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.tablesService.findAll(organizationId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tablesService.findOne(organizationId, id);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER)
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateTableDto,
  ) {
    return this.tablesService.create(organizationId, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER)
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableDto,
  ) {
    return this.tablesService.update(organizationId, id, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTableStatusDto,
  ) {
    return this.tablesService.updateStatus(organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.CASHIER)
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tablesService.remove(organizationId, id);
  }
}
