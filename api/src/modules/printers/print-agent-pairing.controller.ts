import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common';
import { PrintersService } from './printers.service';
import { PairAgentDto } from './dto';

// The one print-agent route with no token: the agent doesn't have one yet. It trades the
// short-lived pairing code an admin read off Settings > Printers for the org's agent token.
// Kept in its own controller because PrintAgentController guards every route with that token.
@ApiExcludeController()
@Public()
@Controller('print-agent')
export class PrintAgentPairingController {
  constructor(private readonly printersService: PrintersService) {}

  // Tightly throttled: the code is the only secret here, so guessing has to be hopeless.
  @Throttle({ global: { limit: 5, ttl: 60000 } })
  @HttpCode(200)
  @Post('pair')
  pair(@Body() dto: PairAgentDto) {
    return this.printersService.redeemPairingCode(dto.code);
  }
}
