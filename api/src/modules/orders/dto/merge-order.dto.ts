import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class MergeOrderDto {
  @ApiProperty({ description: 'The other open order to fold into this one — its items move here and it gets cancelled' })
  @IsNotEmpty()
  @IsUUID()
  sourceOrderId: string;
}
