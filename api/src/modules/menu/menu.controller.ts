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
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { MenuService } from './menu.service';
import {
  CreateMenuCategoryDto,
  UpdateMenuCategoryDto,
  CreateMenuItemDto,
  UpdateMenuItemDto,
  SetMenuItemIngredientsDto,
} from './dto';
import { CurrentUser, Can } from '../../common';

@ApiTags('Menu Categories')
@ApiBearerAuth()
@Controller('menu-categories')
export class MenuCategoriesController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.menuService.findAllCategories(organizationId);
  }

  @Post()
  @Can('MENU_MANAGE')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateMenuCategoryDto,
  ) {
    return this.menuService.createCategory(organizationId, dto);
  }

  @Patch(':id')
  @Can('MENU_MANAGE')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuCategoryDto,
  ) {
    return this.menuService.updateCategory(organizationId, id, dto);
  }

  @Delete(':id')
  @Can('MENU_MANAGE')
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.menuService.removeCategory(organizationId, id);
  }
}

@ApiTags('Menu Items')
@ApiBearerAuth()
@Controller('menu-items')
export class MenuItemsController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.menuService.findAllItems(organizationId, categoryId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.menuService.findOneItem(organizationId, id);
  }

  @Get(':id/history')
  getHistory(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.menuService.getItemHistory(organizationId, id);
  }

  @Post()
  @Can('MENU_MANAGE')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.menuService.createItem(organizationId, dto);
  }

  @Patch(':id')
  @Can('MENU_MANAGE')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menuService.updateItem(organizationId, id, dto);
  }

  @Delete(':id')
  @Can('MENU_MANAGE')
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.menuService.removeItem(organizationId, id);
  }

  // Full-replace, matching how categoryIds works on the item itself — the client always sends
  // the complete recipe rather than diffing individual lines.
  @Patch(':id/ingredients')
  @Can('MENU_MANAGE')
  setIngredients(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetMenuItemIngredientsDto,
  ) {
    return this.menuService.setIngredients(organizationId, id, dto);
  }
}
