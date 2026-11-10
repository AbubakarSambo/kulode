import { IsString, MaxLength, MinLength } from 'class-validator';

export class PairAgentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  code: string;
}
