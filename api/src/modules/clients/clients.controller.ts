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
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto, ClientFilterDto } from './dto';
import { CurrentUser } from '../../common';

@ApiTags('Clients')
@ApiBearerAuth()
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @ApiOperation({ summary: 'List all clients' })
  @ApiResponse({ status: 200, description: 'List of clients' })
  async findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ClientFilterDto,
  ) {
    return this.clientsService.findAll(organizationId, filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client by ID with recent invoices' })
  @ApiResponse({ status: 200, description: 'Client details' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.clientsService.findOne(id, organizationId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new client' })
  @ApiResponse({ status: 201, description: 'Client created' })
  async create(
    @Body() dto: CreateClientDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.clientsService.create(organizationId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update client' })
  @ApiResponse({ status: 200, description: 'Client updated' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.clientsService.update(id, organizationId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete or deactivate client' })
  @ApiResponse({ status: 200, description: 'Client deleted/deactivated' })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    return this.clientsService.remove(id, organizationId);
  }
}
