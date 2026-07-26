import { Controller, Get, Post, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto, CloseShiftDto } from './dto';
import { CurrentUser, CurrentUserData } from '../../common';

@ApiTags('Shifts')
@ApiBearerAuth()
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get()
  findAll(@CurrentUser('organizationId') organizationId: string) {
    return this.shiftsService.findAll(organizationId);
  }

  @Get('current')
  findCurrent(@CurrentUser('organizationId') organizationId: string) {
    return this.shiftsService.findCurrent(organizationId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shiftsService.findOne(organizationId, id);
  }

  @Post('open')
  open(
    @Body() dto: OpenShiftDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.shiftsService.open(user.organizationId, user.id, dto);
  }

  @Post(':id/close')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.shiftsService.close(user.organizationId, id, user.id, dto);
  }
}
