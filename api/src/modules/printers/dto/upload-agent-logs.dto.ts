import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsISO8601, IsString, MaxLength, ValidateNested } from 'class-validator';

export class AgentLogLineDto {
  @IsISO8601()
  at: string;

  @IsString()
  @MaxLength(2000)
  message: string;
}

export class UploadAgentLogsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AgentLogLineDto)
  lines: AgentLogLineDto[];
}
