import { Controller, Get, Post, Query, Body, Req, Res, Headers, HttpStatus, Logger, ForbiddenException, UnauthorizedException, RawBodyRequest } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common';
import { WhatsappService } from './whatsapp.service';

@ApiExcludeController()
@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private whatsappService: WhatsappService) {}

  // @Res() bypasses the global TransformInterceptor envelope - Meta requires the
  // response body to be the raw challenge value, not JSON.
  @Public()
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    if (mode !== 'subscribe' || !this.whatsappService.isValidVerifyToken(verifyToken)) {
      throw new ForbiddenException('Invalid verify token');
    }
    res.status(HttpStatus.OK).send(challenge);
  }

  // Meta expects a fast 200 regardless of processing outcome - a non-2xx (or a
  // timeout) causes aggressive retries and can eventually disable the subscription.
  @Public()
  @Post('webhook')
  async receiveWebhook(
    @Body() payload: any,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    // With a signing secret configured, a forged or tampered POST is rejected outright. Without one the
    // payload cannot be authenticated: delivery statuses are still recorded, customer replies are not
    // acted on (they change invoice state).
    let authentic = false;
    if (this.whatsappService.canVerifySignatures) {
      if (!this.whatsappService.isValidSignature(req.rawBody, signature)) {
        throw new UnauthorizedException('Invalid webhook signature');
      }
      authentic = true;
    }
    try {
      await this.whatsappService.handleWebhookEvent(payload, { acceptInbound: authentic });
    } catch (error) {
      this.logger.error('Failed to process WhatsApp webhook event', error);
    }
    return { received: true };
  }
}
