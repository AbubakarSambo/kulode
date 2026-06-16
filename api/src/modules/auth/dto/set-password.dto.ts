import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(/^(?=.*[A-Z])(?=.*[\d\W]).{8,}$/, {
    message: 'Password must be at least 8 characters and contain at least 1 uppercase letter and 1 number or special character',
  })
  password: string;
}
