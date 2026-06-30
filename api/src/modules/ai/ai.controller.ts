import { Controller, Get, Post, Body, Query, UseGuards, Param, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { ReportFilterDto } from '../reports/dto';
import { CreateChatSessionDto, UpdateChatSessionDto, SearchChatSessionsDto } from './dto/chat-session.dto';
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
    @CurrentUser('id') userId: string,
    @Body() body: { messages: { role: 'user' | 'assistant'; content: string }[], sessionId?: string },
  ) {
    return this.aiService.chat(body.messages, organizationId, userId, body.sessionId);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List all chat sessions' })
  async listSessions(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: SearchChatSessionsDto,
  ) {
    return this.aiService.listSessions(organizationId, userId, query);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Create a new chat session' })
  async createSession(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatSessionDto,
  ) {
    return this.aiService.createSession(organizationId, userId, dto);
  }

  @Patch('sessions/:id')
  @ApiOperation({ summary: 'Update a chat session (rename or pin/unpin)' })
  async updateSession(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateChatSessionDto,
  ) {
    return this.aiService.updateSession(organizationId, userId, id, dto);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Delete a chat session' })
  async deleteSession(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.aiService.deleteSession(organizationId, userId, id);
  }

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: 'Get messages for a chat session' })
  async getMessages(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.aiService.getMessages(organizationId, userId, id);
  }
}

