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
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { PaystackService } from '../paystack/paystack.service';
import { CreateVendorDto, UpdateVendorDto, VendorFilterDto } from './dto';
import { CurrentUser, Roles, Role, RequiresPlan, PlanGuard } from '../../common';

@ApiTags('Vendors')
@ApiBearerAuth()
@UseGuards(PlanGuard)
@RequiresPlan('PRO')
@Controller('vendors')
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all vendors' })
  @ApiResponse({ status: 200, description: 'List of vendors' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: VendorFilterDto,
  ) {
    return this.vendorsService.findAll(organizationId, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vendor by ID' })
  @ApiResponse({ status: 200, description: 'Vendor details' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.vendorsService.findOne(id, organizationId);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Create a new vendor' })
  @ApiResponse({ status: 201, description: 'Vendor created' })
  async create(
    @Body() dto: CreateVendorDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.vendorsService.create(organizationId, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update vendor' })
  @ApiResponse({ status: 200, description: 'Vendor updated' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVendorDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.vendorsService.update(id, organizationId, dto);
  }

  @Post(':id/pay')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Pay a vendor via Paystack (subaccount + split, no held balance)' })
  @ApiResponse({ status: 201, description: 'Payout checkout initialized' })
  async pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('amount') amount: number,
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('email') userEmail: string,
  ) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }
    return this.paystackService.initializeVendorPayout(organizationId, id, amount, userId, userEmail);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete vendor' })
  @ApiResponse({ status: 200, description: 'Vendor deleted' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.vendorsService.remove(id, organizationId);
  }
}
