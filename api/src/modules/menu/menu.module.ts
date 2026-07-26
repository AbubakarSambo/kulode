import { Module } from '@nestjs/common';
import { MenuService } from './menu.service';
import { MenuCategoriesController, MenuItemsController } from './menu.controller';

@Module({
  controllers: [MenuCategoriesController, MenuItemsController],
  providers: [MenuService],
  exports: [MenuService],
})
export class MenuModule {}
