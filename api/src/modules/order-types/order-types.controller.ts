import { Controller, Get, Post, Patch, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderTypesService } from './order-types.service';
import { CreateOrderTypeDto, UpdateOrderTypeDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Order Types')
@ApiBearerAuth()
@Controller('order-types')
export class OrderTypesController {
  constructor(private readonly orderTypesService: OrderTypesService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.orderTypesService.findAll(organizationId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateOrderTypeDto,
  ) {
    return this.orderTypesService.create(organizationId, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderTypeDto,
  ) {
    return this.orderTypesService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orderTypesService.remove(organizationId, id);
  }
}
