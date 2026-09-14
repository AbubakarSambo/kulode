import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';

export class MenuItemIngredientInputDto {
  @ApiProperty({ description: 'Inventory item this recipe line consumes' })
  @IsUUID()
  inventoryItemId: string;

  @ApiProperty({
    description: "Quantity consumed per one unit of the menu item sold, in the inventory item's own on-hand unit",
    example: 0.15,
  })
  @IsNumber()
  @Min(0.001)
  quantityPerUnit: number;
}

export class SetMenuItemIngredientsDto {
  @ApiProperty({
    type: [MenuItemIngredientInputDto],
    description: 'Full recipe for this menu item — replaces any existing ingredients',
  })
  @IsArray()
  @ArrayUnique((line: MenuItemIngredientInputDto) => line.inventoryItemId)
  @ValidateNested({ each: true })
  @Type(() => MenuItemIngredientInputDto)
  ingredients: MenuItemIngredientInputDto[];
}
