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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto, UpdateInventoryItemDto, AdjustStockDto } from './dto';
import { CurrentUser, Roles, Role } from '../../common';

@ApiTags('Inventory')
@ApiBearerAuth()
@Controller('inventory-items')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.inventoryService.findAll(organizationId);
  }

  // Must stay above any future GET(':id') route or 'lookup' would be parsed as an id.
  @Get('lookup')
  findByBarcode(
    @CurrentUser('organizationId') organizationId: string,
    @Query('barcode') barcode: string,
  ) {
    return this.inventoryService.findByBarcode(organizationId, barcode);
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.inventoryService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.remove(organizationId, id);
  }

  @Post(':id/adjust')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  adjustStock(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.inventoryService.adjustStock(organizationId, id, userId, dto);
  }

  @Post('import')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  importCsv(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.inventoryService.bulkImport(organizationId, userId, file.buffer.toString('utf-8'));
  }

  @Get(':id/movements')
  getMovements(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inventoryService.getMovements(organizationId, id);
  }
}
