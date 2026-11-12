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
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto, UpdateCustomerCreditDto, CustomerFilterDto, QuickAddCustomerDto, CapturePhoneDto, LookupPhoneQueryDto } from './dto';
import { PhoneCaptureService } from './phone-capture.service';
import { PhoneCreditSource } from '@prisma/client';
import { CurrentUser, CurrentUserData, Can } from '../../common';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly phoneCapture: PhoneCaptureService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all customers' })
  @ApiResponse({ status: 200, description: 'List of customers' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: CustomerFilterDto,
  ) {
    return this.customersService.findAll(organizationId, filter);
  }

  // Declared before ':id' so "lookup-phone" isn't parsed as a customer id
  @Get('lookup-phone')
  @ApiOperation({ summary: 'Is this a usable phone number, and which customer (if any) already holds it?' })
  @Can('PHONE_CAPTURE')
  async lookupPhone(@Query() query: LookupPhoneQueryDto, @CurrentUser('organizationId') organizationId: string) {
    return this.phoneCapture.lookup(organizationId, query.phone);
  }

  // Declared before ':id' so "wallet-summary" isn't parsed as a customer id
  @Get('wallet-summary')
  @ApiOperation({ summary: 'Count and total of customers with a negative wallet balance, and how many are over their credit limit' })
  @ApiResponse({ status: 200, description: 'Wallet debt summary' })
  async getWalletSummary(@CurrentUser('organizationId') organizationId: string) {
    return this.customersService.getWalletSummary(organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID with recent orders' })
  @ApiResponse({ status: 200, description: 'Customer details' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.customersService.findOne(id, organizationId);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get lifetime stats for a customer (sales, top items, visit patterns)' })
  @ApiResponse({ status: 200, description: 'Customer stats' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async getStats(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.customersService.getStats(id, organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created' })
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.customersService.create(user.organizationId, user.id, dto);
  }

  @Post('capture-phone')
  @ApiOperation({ summary: 'Save a number typed at the order or Pay screen: attaches to a customer, finds who holds it, or creates one. Credits the staff member for a new number.' })
  @Can('PHONE_CAPTURE')
  async capturePhone(@Body() dto: CapturePhoneDto, @CurrentUser() user: CurrentUserData) {
    return this.phoneCapture.capture(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        source: dto.source === 'PAY' ? PhoneCreditSource.PAY : PhoneCreditSource.ORDER,
        orderId: dto.orderId,
        capturedAt: dto.capturedAt,
        clientRequestId: dto.clientRequestId,
      },
      dto,
    );
  }

  @Post('quick-add')
  @ApiOperation({ summary: 'Add a customer from a paper/QR feedback form; the "collected by" staff member earns the credit' })
  @ApiResponse({ status: 201, description: 'Customer created (credited: true) — or 409 PHONE_EXISTS with the existing customer id' })
  @Can('PHONE_QUICK_ADD')
  async quickAdd(@Body() dto: QuickAddCustomerDto, @CurrentUser() user: CurrentUserData) {
    return this.phoneCapture.quickAdd(
      {
        organizationId: user.organizationId,
        actorId: user.id,
        source: PhoneCreditSource.QUICK_ADD,
        capturedAt: dto.capturedAt,
        clientRequestId: dto.clientRequestId,
      },
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.customersService.update(id, user.organizationId, user.id, dto);
  }

  @Patch(':id/credit')
  @ApiOperation({ summary: 'Set a customer credit limit (how far their wallet may go negative)' })
  @ApiResponse({ status: 200, description: 'Credit limit updated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  @Can('CUSTOMER_CREDIT')
  async updateCredit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerCreditDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.customersService.updateCreditLimit(id, organizationId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate customer' })
  @ApiResponse({ status: 200, description: 'Customer deactivated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.customersService.remove(id, organizationId);
  }
}
