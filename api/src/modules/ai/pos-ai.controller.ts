import { Controller, Get, Post, Body, Query, UseGuards, Param, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CreateChatSessionDto, UpdateChatSessionDto, SearchChatSessionsDto } from './dto/chat-session.dto';
import { CurrentUser, Roles, Role, RequiresPlan, PlanGuard, RequiresModule, ModuleGuard } from '../../common';

@ApiTags('POS AI')
@ApiBearerAuth()
@UseGuards(PlanGuard, ModuleGuard)
@RequiresPlan('PRO')
@RequiresModule('POS')
@Controller('pos/ai')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class PosAiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with AI about your restaurant/POS data' })
  @ApiResponse({ status: 200, description: 'AI chat response' })
  async chat(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { messages: { role: 'user' | 'assistant'; content: string }[]; sessionId?: string },
  ) {
    return this.aiService.chat(body.messages, organizationId, userId, body.sessionId, 'POS');
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List all POS AI chat sessions' })
  async listSessions(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: SearchChatSessionsDto,
  ) {
    return this.aiService.listSessions(organizationId, userId, query, 'POS');
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Create a new POS AI chat session' })
  async createSession(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatSessionDto,
  ) {
    return this.aiService.createSession(organizationId, userId, dto, 'POS');
  }

  @Patch('sessions/:id')
  @ApiOperation({ summary: 'Update a POS AI chat session (rename or pin/unpin)' })
  async updateSession(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateChatSessionDto,
  ) {
    return this.aiService.updateSession(organizationId, userId, id, dto, 'POS');
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Delete a POS AI chat session' })
  async deleteSession(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.aiService.deleteSession(organizationId, userId, id, 'POS');
  }

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: 'Get messages for a POS AI chat session' })
  async getMessages(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.aiService.getMessages(organizationId, userId, id, 'POS');
  }
}
