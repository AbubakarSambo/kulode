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
import { CreateCustomerDto, UpdateCustomerDto, UpdateCustomerCreditDto, CustomerFilterDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'List all customers' })
  @ApiResponse({ status: 200, description: 'List of customers' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: CustomerFilterDto,
  ) {
    return this.customersService.findAll(organizationId, filter);
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

  @Post()
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created' })
  async create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.customersService.create(organizationId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.customersService.update(id, organizationId, dto);
  }

  @Patch(':id/credit')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: 'Set a customer credit limit (how far their wallet may go negative)' })
  @ApiResponse({ status: 200, description: 'Credit limit updated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
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
