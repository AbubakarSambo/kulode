import { Controller, Get, Post, Patch, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentTypesService } from './payment-types.service';
import { CreatePaymentTypeDto, UpdatePaymentTypeDto } from './dto';
import { CurrentUser, Can } from '../../common';

@ApiTags('Payment Types')
@ApiBearerAuth()
@Controller('payment-types')
export class PaymentTypesController {
  constructor(private readonly paymentTypesService: PaymentTypesService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.paymentTypesService.findAll(organizationId);
  }

  @Post()
  @Can('POS_CONFIG_MANAGE')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreatePaymentTypeDto,
  ) {
    return this.paymentTypesService.create(organizationId, dto);
  }

  @Patch(':id')
  @Can('POS_CONFIG_MANAGE')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentTypeDto,
  ) {
    return this.paymentTypesService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @Can('POS_CONFIG_MANAGE')
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentTypesService.remove(organizationId, id);
  }
}
