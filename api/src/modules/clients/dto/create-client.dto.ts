import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEmail, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateClientDto {
  @ApiProperty({ example: 'ABC Corporation' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'contact@abc-corp.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+234 123 456 7890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: '456 Business Ave, Lagos' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Preferred client, always pays on time' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'business' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  clientType?: string;

  @ApiPropertyOptional({ description: 'Client has agreed to receive invoice and payment messages via WhatsApp' })
  @IsOptional()
  @IsBoolean()
  whatsappOptIn?: boolean;
}
