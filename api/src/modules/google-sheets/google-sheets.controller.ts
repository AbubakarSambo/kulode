import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GoogleSheetsService } from './google-sheets.service';

@ApiTags('Google Sheets')
@ApiBearerAuth()
@Controller('google-sheets')
export class GoogleSheetsController {
  constructor(private readonly googleSheetsService: GoogleSheetsService) {}

  @Get('sync-email')
  getSyncEmail() {
    return { email: this.googleSheetsService.getServiceAccountEmail() };
  }
}
