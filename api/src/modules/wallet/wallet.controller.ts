import { Controller, Get, Post, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { TopUpWalletDto, AdjustWalletDto, WalletTransactionFilterDto } from './dto';
import { CurrentUser, CurrentUserData, Roles, Role } from '../../common';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('customers/:customerId/wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  getBalance(
    @CurrentUser('organizationId') organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ) {
    return this.walletService.getBalance(organizationId, customerId);
  }

  @Get('transactions')
  listTransactions(
    @CurrentUser('organizationId') organizationId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() filter: WalletTransactionFilterDto,
  ) {
    return this.walletService.listTransactions(organizationId, customerId, filter);
  }

  @Post('topup')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
  topUp(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: TopUpWalletDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.walletService.topUp(user.organizationId, customerId, user.id, dto);
  }

  @Post('adjust')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  adjust(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: AdjustWalletDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.walletService.adjust(user.organizationId, customerId, user.id, dto);
  }
}
