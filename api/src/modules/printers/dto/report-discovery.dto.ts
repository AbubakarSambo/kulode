import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIP, IsInt, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';

export class DiscoveredDeviceDto {
  @IsIP(4)
  ipAddress: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port: number;

  // Missing when the agent couldn't read the address from the computer's network table.
  @IsOptional()
  @Matches(/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/)
  macAddress?: string;
}

export class ReportDiscoveryDto {
  @IsArray()
  @ArrayMaxSize(256)
  @ValidateNested({ each: true })
  @Type(() => DiscoveredDeviceDto)
  devices: DiscoveredDeviceDto[];
}
