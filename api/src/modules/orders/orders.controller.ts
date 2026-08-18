import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Res,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiProduces } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { OrderReceiptPdfService } from './order-receipt-pdf.service';
import { PaystackService } from '../paystack/paystack.service';
import {
  CreateOrderDto,
  AddOrderItemsDto,
  UpdateOrderItemStatusDto,
  UpdateOrderItemDto,
  UpdateOrderCustomerDto,
  UpdateOrderWaiterDto,
  UpdateOrderSourceDto,
  CloseOrderDto,
  OrderFilterDto,
  MergeOrderDto,
  MoveOrderItemsDto,
  ApplyDiscountDto,
} from './dto';
import { CurrentUser, CurrentUserData, Roles, Role } from '../../common';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderReceiptPdfService: OrderReceiptPdfService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get()
  findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: OrderFilterDto,
  ) {
    return this.ordersService.findAll(organizationId, filter);
  }

  @Get(':id')
  findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findOne(organizationId, id);
  }

  @Post()
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ordersService.create(user.organizationId, user.id, dto);
  }

  @Post(':id/items')
  addItems(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddOrderItemsDto,
  ) {
    return this.ordersService.addItems(organizationId, id, dto);
  }

  @Patch(':id/items/:itemId/status')
  updateItemStatus(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemStatusDto,
  ) {
    return this.ordersService.updateItemStatus(organizationId, id, itemId, dto);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateOrderItemDto,
  ) {
    return this.ordersService.updateItem(organizationId, id, itemId, dto);
  }

  @Patch(':id/customer')
  setCustomer(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderCustomerDto,
  ) {
    return this.ordersService.setCustomer(organizationId, id, dto);
  }

  @Patch(':id/waiter')
  setWaiter(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderWaiterDto,
  ) {
    return this.ordersService.setWaiter(organizationId, id, dto);
  }

  @Patch(':id/source')
  setSource(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderSourceDto,
  ) {
    return this.ordersService.setSource(organizationId, id, dto);
  }

  @Post(':id/merge')
  @Roles(Role.WAITER, Role.SUPERVISOR, Role.MANAGER, Role.CASHIER, Role.ADMIN, Role.SUPER_ADMIN)
  merge(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeOrderDto,
  ) {
    return this.ordersService.mergeOrders(organizationId, id, dto.sourceOrderId);
  }

  @Post(':id/move-items')
  @Roles(Role.WAITER, Role.SUPERVISOR, Role.MANAGER, Role.CASHIER, Role.ADMIN, Role.SUPER_ADMIN)
  moveItems(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOrderItemsDto,
  ) {
    return this.ordersService.moveItems(organizationId, id, dto);
  }

  @Post(':id/mark-awaiting-payment')
  @Roles(Role.WAITER, Role.SUPERVISOR, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN, Role.CASHIER)
  markAwaitingPayment(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.markAwaitingPayment(organizationId, id);
  }

  @Post(':id/cancel')
  @Roles(Role.STAFF, Role.ACCOUNTANT, Role.SUPERVISOR, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  cancel(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.cancel(organizationId, id);
  }

  @Patch(':id/discount')
  @Roles(Role.STAFF, Role.ACCOUNTANT, Role.SUPERVISOR, Role.MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  applyDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ordersService.applyDiscount(user.organizationId, id, user.id, dto);
  }

  @Post(':id/close')
  @Roles(Role.STAFF, Role.ACCOUNTANT, Role.CASHIER, Role.ADMIN, Role.SUPER_ADMIN)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseOrderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ordersService.closeWithPayment(user.organizationId, id, user.id, dto);
  }

  @Post(':id/paystack-checkout')
  @Roles(Role.STAFF, Role.ACCOUNTANT, Role.CASHIER, Role.ADMIN, Role.SUPER_ADMIN)
  async paystackCheckout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseOrderDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    if (!dto.customerEmail) {
      throw new BadRequestException('customerEmail is required to initialize a Paystack checkout');
    }
    const order = await this.ordersService.findOne(organizationId, id);
    const amount = dto.amount ?? Number(order.total);
    return this.paystackService.initializeOrderTransaction(organizationId, id, dto.customerEmail, amount);
  }

  @Get(':id/receipt-data')
  receiptData(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.getReceiptData(organizationId, id);
  }

  @Get(':id/receipt')
  @ApiProduces('application/pdf')
  async downloadReceipt(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const receipt = await this.ordersService.getReceiptData(organizationId, id);
    const pdfBuffer = await this.orderReceiptPdfService.generatePdf(receipt as any);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${receipt.receiptNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }
}
