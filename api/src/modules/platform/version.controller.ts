import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common';
import * as fs from 'fs';
import * as path from 'path';

let cachedVersion = '1.0.0';
try {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  cachedVersion = packageJson.version || '1.0.0';
} catch (e) {
  // fallback if package.json cannot be read
}

@ApiTags('System')
@Controller('system')
export class VersionController {
  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Get current system semantic version' })
  @ApiResponse({ status: 200, description: 'Current system version details' })
  getVersion() {
    return {
      version: cachedVersion,
      environment: process.env.NODE_ENV || 'development',
      requiredRefresh: false,
    };
  }
}
