import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ReportFilterDto } from '../reports/dto';
import { CurrentUser, Roles, Role, RequiresPlan, PlanGuard } from '../../common';

@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(PlanGuard)
@RequiresPlan('PRO')
@Controller('ai')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.ACCOUNTANT)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('insights')
  @ApiOperation({ summary: 'Get AI-generated business insights' })
  @ApiResponse({ status: 200, description: 'AI business insights' })
  async getInsights(
    @CurrentUser('organizationId') organizationId: string,
    @Query() filter: ReportFilterDto,
  ) {
    return this.aiService.getInsights(organizationId, filter);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI about your business data' })
  @ApiResponse({ status: 200, description: 'AI chat response' })
  async chat(
    @CurrentUser('organizationId') organizationId: string,
    @Body() body: { messages: { role: 'user' | 'assistant'; content: string }[] },
  ) {
    return this.aiService.chat(body.messages, organizationId);
  }
}
