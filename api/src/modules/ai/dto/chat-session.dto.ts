import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateChatSessionDto {
  @ApiProperty({ description: 'The title of the chat session' })
  @IsString()
  @IsNotEmpty()
  title: string;
}

export class UpdateChatSessionDto {
  @ApiPropertyOptional({ description: 'The new title of the chat session' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({ description: 'Pin status of the session' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class SearchChatSessionsDto {
  @ApiPropertyOptional({ description: 'Search keyword for titles' })
  @IsOptional()
  @IsString()
  search?: string;
}
