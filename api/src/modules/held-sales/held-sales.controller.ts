import { Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HeldSalesService } from './held-sales.service';
import { HoldSaleDto } from './dto';
import { CurrentUser, Can } from '../../common';

// Anyone who can ring up a sale can park and pick up carts — across every till in the org, which
// is the point: a customer who left to fetch something may come back to a different lane.
@ApiTags('Held Sales')
@ApiBearerAuth()
@Controller('held-sales')
export class HeldSalesController {
  constructor(private readonly heldSalesService: HeldSalesService) {}

  @Get()
  @Can('ORDER_SELL')
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.heldSalesService.findAll(organizationId);
  }

  @Post()
  @Can('ORDER_SELL')
  hold(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: HoldSaleDto,
  ) {
    return this.heldSalesService.hold(organizationId, userId, dto);
  }

  @Post(':id/recall')
  @Can('ORDER_SELL')
  recall(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.heldSalesService.recall(organizationId, userId, id);
  }

  @Delete(':id')
  @Can('ORDER_SELL')
  discard(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.heldSalesService.discard(organizationId, id);
  }
}
