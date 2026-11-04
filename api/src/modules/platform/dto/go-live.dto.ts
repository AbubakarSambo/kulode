import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GoLiveDto {
  @ApiProperty({ description: "The organization's name, typed to confirm the wipe" })
  @IsString()
  @IsNotEmpty()
  confirmName: string;

  @ApiPropertyOptional({ description: 'Also delete every customer (off by default: real regulars may have been added during setup)' })
  @IsOptional()
  @IsBoolean()
  deleteCustomers?: boolean;
}
