import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

type FunctionToolCall = { type: 'function'; id: string; function: { name: string; arguments: string } };
import { ReportsService } from '../reports/reports.service';
import { ClientsService } from '../clients/clients.service';
import { ExpensesService } from '../expenses/expenses.service';
import { PaymentsService } from '../payments/payments.service';
import { VendorsService } from '../vendors/vendors.service';
import { InventoryService } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilterDto, ReportPeriod } from '../reports/dto';
import { CreateChatSessionDto, UpdateChatSessionDto, SearchChatSessionsDto } from './dto/chat-session.dto';


export interface Insight {
  title: string;
  body: string;
  recommendation: string;
  sentiment: 'positive' | 'warning' | 'neutral';
  category: 'revenue' | 'expenses' | 'clients' | 'collections' | 'products';
}

export interface InsightsResponse {
  summary: string;
  insights: Insight[];
  period: { startDate: Date; endDate: Date };
}

type Period =
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'THIS_QUARTER'
  | 'LAST_QUARTER'
  | 'THIS_YEAR'
  | 'LAST_YEAR';

function getDateRange(period: Period): { startDate: Date; endDate: Date } {
  const now = new Date();
  let startDate: Date;
  let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (period) {
    case 'THIS_MONTH':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'LAST_MONTH':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case 'THIS_QUARTER': {
      const q = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case 'LAST_QUARTER': {
      const lq = Math.floor(now.getMonth() / 3) - 1;
      const yr = lq < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const qt = lq < 0 ? 3 : lq;
      startDate = new Date(yr, qt * 3, 1);
      endDate = new Date(yr, (qt + 1) * 3, 0, 23, 59, 59);
      break;
    }
    case 'THIS_YEAR':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'LAST_YEAR':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
      break;
  }

  return { startDate, endDate };
}

const PERIOD_ENUM = ['THIS_MONTH', 'LAST_MONTH', 'THIS_QUARTER', 'LAST_QUARTER', 'THIS_YEAR', 'LAST_YEAR'];
const STATUS_ENUM = ['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED'];

const periodParam = { type: 'string', enum: PERIOD_ENUM, description: 'The time period to query.' };

const CHAT_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_financial_summary',
      description: 'Get income collected, total expenses, net profit, profit margin, and invoice status counts for a period.',
      parameters: { type: 'object', properties: { period: periodParam }, required: ['period'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cashflow',
      description: 'Get month-by-month income vs expenses breakdown for a period.',
      parameters: { type: 'object', properties: { period: periodParam }, required: ['period'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_outstanding_invoices',
      description: 'Get all unpaid invoices (sent, partially paid, overdue) with client names, amounts owed, and days overdue.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_clients',
      description: 'Get clients ranked by revenue paid for a period, including payment count.',
      parameters: { type: 'object', properties: { period: periodParam }, required: ['period'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_expense_breakdown',
      description: 'Get expenses broken down by category with monthly trend for a period.',
      parameters: { type: 'object', properties: { period: periodParam }, required: ['period'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_products_and_services',
      description: 'Get best-selling products and services ranked by revenue for a period.',
      parameters: { type: 'object', properties: { period: periodParam }, required: ['period'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_clients',
      description: 'Search for clients by name or email. Returns matching clients with invoice count.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Name or email to search for.' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_client_history',
      description: 'Get full details for a specific client: contact info, recent invoices, and total revenue.',
      parameters: {
        type: 'object',
        properties: { clientId: { type: 'string', description: 'The client UUID from search_clients.' } },
        required: ['clientId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_invoices',
      description: 'Search and filter invoices flexibly. All parameters are optional — combine as needed.',
      parameters: {
        type: 'object',
        properties: {
          clientName: { type: 'string', description: 'Filter by client name (partial match).' },
          status: { type: 'string', enum: STATUS_ENUM, description: 'Filter by invoice status.' },
          startDate: { type: 'string', description: 'Issue date from (YYYY-MM-DD).' },
          endDate: { type: 'string', description: 'Issue date to (YYYY-MM-DD).' },
          minAmount: { type: 'number', description: 'Minimum invoice total.' },
          maxAmount: { type: 'number', description: 'Maximum invoice total.' },
          limit: { type: 'number', description: 'Max results (default 20, max 50).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_payments_list',
      description: 'Get a list of individual payments received in a period, with client and invoice info.',
      parameters: { type: 'object', properties: { period: periodParam }, required: ['period'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_expenses_list',
      description: 'Get individual expense records for a period with category and vendor info.',
      parameters: { type: 'object', properties: { period: periodParam }, required: ['period'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory',
      description: 'Get all inventory items with current stock levels, available quantity, unit price, and reorder status.',
      parameters: {
        type: 'object',
        properties: { search: { type: 'string', description: 'Optional name filter.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_vendors',
      description: 'Get the list of vendors with contact details.',
      parameters: {
        type: 'object',
        properties: { search: { type: 'string', description: 'Optional name/contact search.' } },
      },
    },
  },
];

const INSIGHTS_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'report_insights',
    description: 'Generate structured business insights from the provided financial data.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'A 2-3 sentence executive summary of business health for the period.',
        },
        insights: {
          type: 'array',
          description: 'Array of exactly 5 specific, actionable insights.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short headline (5-8 words).' },
              body: { type: 'string', description: 'What the data shows with specific numbers (2-3 sentences).' },
              recommendation: { type: 'string', description: 'A specific, actionable next step (1-2 sentences).' },
              sentiment: { type: 'string', enum: ['positive', 'warning', 'neutral'] },
              category: { type: 'string', enum: ['revenue', 'expenses', 'clients', 'collections', 'products'] },
            },
            required: ['title', 'body', 'recommendation', 'sentiment', 'category'],
          },
        },
      },
      required: ['summary', 'insights'],
    },
  },
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
  });

  constructor(
    private readonly reportsService: ReportsService,
    private readonly clientsService: ClientsService,
    private readonly expensesService: ExpensesService,
    private readonly paymentsService: PaymentsService,
    private readonly vendorsService: VendorsService,
    private readonly inventoryService: InventoryService,
    private readonly prisma: PrismaService,
  ) {}

  async getInsights(organizationId: string, filter: ReportFilterDto): Promise<InsightsResponse> {
    const effectiveFilter: ReportFilterDto = {
      period: filter.period ?? ReportPeriod.THIS_MONTH,
      startDate: filter.startDate,
      endDate: filter.endDate,
    };

    const [summary, cashflow, outstanding, income, services, products] = await Promise.all([
      this.reportsService.getSummary(organizationId, effectiveFilter),
      this.reportsService.getCashflow(organizationId, effectiveFilter),
      this.reportsService.getOutstandingInvoices(organizationId),
      this.reportsService.getIncomeBreakdown(organizationId, effectiveFilter),
      this.reportsService.getTopServices(organizationId, effectiveFilter),
      this.reportsService.getTopProducts(organizationId, effectiveFilter),
    ]);

    const fmt = (n: number) =>
      n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${n.toLocaleString()}`;

    const dataPrompt = `
BUSINESS FINANCIAL DATA (period: ${effectiveFilter.period})

## Financial Summary
- Total income collected: ${fmt(summary.income.total)} (${summary.income.paymentCount} payments)
- Total expenses: ${fmt(summary.expenses.total)} (${summary.expenses.expenseCount} expenses)
- Net profit: ${fmt(summary.profit)}
- Profit margin: ${summary.profitMargin}%
- Invoice stats: ${JSON.stringify(summary.invoices)}

## Monthly Cashflow Trend
${cashflow.monthly.map((m) => `  ${m.month}: income ${fmt(m.income)}, expenses ${fmt(m.expenses)}, net ${fmt(m.net)}`).join('\n') || '  No data'}
Totals: income ${fmt(cashflow.totals.income)}, expenses ${fmt(cashflow.totals.expenses)}, net ${fmt(cashflow.totals.net)}

## Outstanding & Overdue Invoices
- Total outstanding: ${fmt(outstanding.summary.totalOutstanding)}
- Overdue invoices: ${outstanding.summary.overdueCount} invoices totalling ${fmt(outstanding.summary.overdueAmount)}

## Top Clients by Revenue
${income.topClients.slice(0, 5).map((c, i) => `  ${i + 1}. ${c.clientName}: ${fmt(c.total)} (${c.paymentCount} payments)`).join('\n') || '  No data'}

## Top Services
${services.services.map((s, i) => `  ${i + 1}. ${s.label}: ${fmt(s.revenue)} revenue, sold ${s.count}x`).join('\n') || '  No services data'}

## Top Products
${products.products.map((p, i) => `  ${i + 1}. ${p.label}: ${fmt(p.revenue)} revenue, sold ${p.count}x`).join('\n') || '  No products data'}
`.trim();

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a sharp business analyst. Analyse the financial data and call report_insights with EXACTLY 5 insights. Each must reference specific numbers. Currency is ₦ (Nigerian Naira).`,
        },
        { role: 'user', content: dataPrompt },
      ],
      tools: [INSIGHTS_TOOL],
      tool_choice: { type: 'function', function: { name: 'report_insights' } },
      max_tokens: 2048,
    });

    const rawToolCall = response.choices[0]?.message?.tool_calls?.[0] as FunctionToolCall | undefined;
    if (!rawToolCall || rawToolCall.type !== 'function') {
      this.logger.error('DeepSeek did not return structured insights');
      throw new Error('Failed to generate insights');
    }

    const result = JSON.parse(rawToolCall.function.arguments) as { summary: string; insights: Insight[] };

    return {
      summary: result.summary,
      insights: result.insights,
      period: summary.period,
    };
  }

  async chat(
    messages: { role: 'user' | 'assistant'; content: string }[],
    organizationId: string,
    userId: string,
    sessionId?: string,
  ): Promise<{ message: string; layout?: any; sessionId: string }> {
    const today = new Date().toISOString().split('T')[0];

    let session = sessionId
      ? await this.prisma.chatSession.findFirst({
          where: { id: sessionId, organizationId, userId, deletedAt: null },
        })
      : null;

    const userMessageContent = messages[messages.length - 1]?.content ?? '';

    if (!session) {
      const title = userMessageContent.slice(0, 50) || 'New Chat';
      session = await this.prisma.chatSession.create({
        data: {
          organizationId,
          userId,
          title,
        },
      });
    }

    // Save the user message to the DB
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: userMessageContent,
      },
    });

    // Load last 10 messages from DB to avoid context window explosion
    const dbMessages = await this.prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });
    const recentMessages = dbMessages.slice(-10);

    // --- STAGE 1: Data Analyst Agent (Tool Calling Loop) ---
    const analystMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a precise business database analyst.
Your only job is to query the database using your tools to gather all data needed to answer the user's question.
Do not write essays, summaries, or styling suggestions. Simply execute the tool calls.
Once you have run all necessary tools to fetch the relevant data, output a short message confirming that you have finished gathering data (e.g. "Data gathered.").
Today is ${today}.`,
      },
      ...recentMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      } as OpenAI.Chat.ChatCompletionMessageParam)),
    ];

    const gatheredData: Record<string, any>[] = [];

    while (true) {
      const response = await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages: analystMessages,
        tools: CHAT_TOOLS,
        max_tokens: 1024,
      });

      const choice = response.choices[0];
      const message = choice.message;

      if (choice.finish_reason === 'stop') {
        break;
      }

      if (choice.finish_reason === 'tool_calls') {
        analystMessages.push(message);

        const toolCalls = message.tool_calls ?? [];
        const toolPromises = toolCalls.map(async (rawCall) => {
          const toolCall = rawCall as FunctionToolCall;
          let result: unknown;
          try {
            const input = JSON.parse(toolCall.function.arguments);
            result = await this.runTool(toolCall.function.name, input, organizationId);
          } catch (err) {
            this.logger.error(`Chat tool ${toolCall.function.name} failed`, err);
            result = { error: err instanceof Error ? err.message : 'Tool execution failed' };
          }

          // Truncate list outputs to prevent token bloat
          if (Array.isArray(result) && result.length > 10) {
            result = {
              totalCount: result.length,
              items: result.slice(0, 10),
              note: `Truncated for context length. Showing first 10 out of ${result.length}.`,
            };
          } else if (result && typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
            const dataArr = (result as any).data;
            if (dataArr.length > 10) {
              (result as any).data = dataArr.slice(0, 10);
              (result as any).note = `Truncated for context length. Showing first 10 out of ${dataArr.length}.`;
            }
          }

          return { toolCall, result };
        });

        const executedTools = await Promise.all(toolPromises);

        for (const { toolCall, result } of executedTools) {
          gatheredData.push({
            toolName: toolCall.function.name,
            arguments: toolCall.function.arguments,
            output: result,
          });

          analystMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        continue;
      }

      break;
    }

    // --- STAGE 2: UI/UX Expert & Styling Agent (Synthesis and Design Mapping) ---
    const hasData = gatheredData.length > 0;

    const presenterSystemPrompt = `You are a premium UI/UX Design & Presentation Expert for Tari1, a fintech app built around "The Architectural Ledger" design system.
Your job is to read the raw database JSON records fetched by the Analyst and translate them into a beautiful, scannability-optimized layout for the user.

Adhere strictly to these DESIGN.md guidelines:
1. Title Card Requirement: You must ALWAYS start your summary text with a clear, relevant H2 markdown header (e.g. "## Monthly Cashflow Performance" or "## Top Receivables Alert") to act as a report title.
2. Spacing: Use clean lists and headers (##, ###). Use double line breaks between sections to give the information breathing room.
3. No Markdown Tables: Never write raw markdown tables (e.g. | Month |). Instead, represent tabular data using the custom InteractiveTable JSON component layout below.
4. Chart Selection Rules:
   - Use "LineChart" for single monthly time trends (e.g. monthly cashflow).
   - Use "BarChart" for single category breakdowns.
   - Use "MultiSeriesChart" to compare multiple categories over time (e.g. product sales month-on-month). Set "type" to "bar" or "line", and "stacked" to true if you want a stacked bar chart. Provide a "series" array mapping data keys to colors.
   - Use "InteractiveTable" for lists of clients, payments, or vendors.
5. Component Mapping: You MUST ALWAYS output a JSON object matching the schema below. If it's a simple greeting, put it in the "summary" field and leave "layout" as an empty array. Do not wrap the JSON in markdown code blocks.

SCHEMA:
{
  "summary": "Title header followed by a friendly, plain-text executive summary (2-3 sentences max) outlining key takeaways.",
  "layout": [
    { "component": "KPICard", "props": { "title": "Net Profit", "value": "₦141.1M", "trend": "+12%", "sentiment": "positive" } },
    { "component": "LineChart", "props": { "data": [{ "label": "Jan", "value": 1000000 }] } },
    { "component": "BarChart", "props": { "data": [{ "label": "Jan", "value": 1000000 }] } },
    { "component": "MultiSeriesChart", "props": { "type": "bar", "stacked": true, "data": [{ "label": "Jan", "Product A": 100, "Product B": 50 }], "series": [{ "key": "Product A", "color": "#0037b0" }, { "key": "Product B", "color": "#10b981" }] } },
    { "component": "InteractiveTable", "props": { "headers": ["Header1", "Header2"], "rows": [["Col1", "Col2"]] } },
    { "component": "Tabs", "props": { "tabs": [{ "label": "Tab Name", "content": { "component": "LineChart", "props": { "data": [] } } }] } }
  ]
}

Today is ${today}.`;

    const presenterUserMessage = hasData
      ? `Original User Query: "${userMessageContent}"\n\nFetched Raw Data Payload:\n${JSON.stringify(gatheredData, null, 2)}`
      : userMessageContent;

    const presenterMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: presenterSystemPrompt },
      ...recentMessages.slice(0, -1).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      } as OpenAI.Chat.ChatCompletionMessageParam)),
      { role: 'user', content: presenterUserMessage },
    ];

    const presenterResponse = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: presenterMessages,
      max_tokens: 1536,
      response_format: { type: 'json_object' },
    });

    const presenterText = presenterResponse.choices[0]?.message?.content ?? '{}';
    let layout: any = null;
    let finalContent = 'Sorry, something went wrong formatting the report.';

    try {
      const parsed = JSON.parse(presenterText);
      finalContent = parsed.summary || presenterText;
      layout = parsed.layout || null;
    } catch (err) {
      this.logger.error('Failed to parse JSON layout from UI/UX agent', err);
      finalContent = presenterText;
    }

    // Save assistant message to the DB
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'assistant',
        content: finalContent,
        layout: layout ?? undefined,
      },
    });

    // Update session's last active time
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    return {
      message: finalContent,
      layout,
      sessionId: session.id,
    };
  }

  async listSessions(organizationId: string, userId: string, query: SearchChatSessionsDto) {
    const where: any = {
      organizationId,
      userId,
      deletedAt: null,
    };
    if (query.search) {
      where.title = {
        contains: query.search,
        mode: 'insensitive',
      };
    }
    return this.prisma.chatSession.findMany({
      where,
      orderBy: [
        { isPinned: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async createSession(organizationId: string, userId: string, dto: CreateChatSessionDto) {
    return this.prisma.chatSession.create({
      data: {
        organizationId,
        userId,
        title: dto.title,
      },
    });
  }

  async updateSession(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateChatSessionDto,
  ) {
    await this.prisma.chatSession.findFirstOrThrow({
      where: { id, organizationId, userId, deletedAt: null },
    });

    return this.prisma.chatSession.update({
      where: { id },
      data: {
        title: dto.title !== undefined ? dto.title : undefined,
        isPinned: dto.isPinned !== undefined ? dto.isPinned : undefined,
      },
    });
  }

  async deleteSession(organizationId: string, userId: string, id: string) {
    await this.prisma.chatSession.findFirstOrThrow({
      where: { id, organizationId, userId, deletedAt: null },
    });

    return this.prisma.chatSession.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async getMessages(organizationId: string, userId: string, sessionId: string) {
    await this.prisma.chatSession.findFirstOrThrow({
      where: { id: sessionId, organizationId, userId, deletedAt: null },
    });

    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }


  private async runTool(name: string, input: Record<string, any>, organizationId: string): Promise<unknown> {
    const period = (input.period ?? 'THIS_MONTH') as Period;
    const filter: ReportFilterDto = { period: period as ReportPeriod };

    switch (name) {
      case 'get_financial_summary':
        return this.reportsService.getSummary(organizationId, filter);

      case 'get_cashflow':
        return this.reportsService.getCashflow(organizationId, filter);

      case 'get_outstanding_invoices':
        return this.reportsService.getOutstandingInvoices(organizationId);

      case 'get_top_clients': {
        const income = await this.reportsService.getIncomeBreakdown(organizationId, filter);
        return { topClients: income.topClients, period: income.period };
      }

      case 'get_expense_breakdown':
        return this.reportsService.getExpenseBreakdown(organizationId, filter);

      case 'get_top_products_and_services': {
        const [services, products] = await Promise.all([
          this.reportsService.getTopServices(organizationId, filter),
          this.reportsService.getTopProducts(organizationId, filter),
        ]);
        return { services: services.services, products: products.products, period: services.period };
      }

      case 'search_clients':
        return this.clientsService.findAll(organizationId, { search: input.query, page: 1, limit: 15 });

      case 'get_client_history':
        return this.clientsService.findOne(input.clientId, organizationId);

      case 'search_invoices': {
        const { clientName, status, startDate, endDate, minAmount, maxAmount, limit = 20 } = input;
        const where: any = { organizationId, deletedAt: null };
        if (status) where.status = status;
        if (startDate || endDate) {
          where.issueDate = {};
          if (startDate) where.issueDate.gte = new Date(startDate);
          if (endDate) where.issueDate.lte = new Date(endDate);
        }
        if (minAmount !== undefined || maxAmount !== undefined) {
          where.total = {};
          if (minAmount !== undefined) where.total.gte = minAmount;
          if (maxAmount !== undefined) where.total.lte = maxAmount;
        }
        if (clientName) {
          where.client = { name: { contains: clientName, mode: 'insensitive' } };
        }
        const invoices = await this.prisma.invoice.findMany({
          where,
          take: Math.min(limit, 50),
          orderBy: { issueDate: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            total: true,
            amountPaid: true,
            issueDate: true,
            dueDate: true,
            client: { select: { id: true, name: true } },
          },
        });
        return invoices.map((inv) => ({
          ...inv,
          total: Number(inv.total),
          amountPaid: Number(inv.amountPaid),
          outstanding: Number(inv.total) - Number(inv.amountPaid),
        }));
      }

      case 'get_payments_list': {
        const { startDate, endDate } = getDateRange(period);
        return this.paymentsService.findAll(organizationId, { startDate, endDate, page: 1, limit: 50 });
      }

      case 'get_expenses_list': {
        const { startDate, endDate } = getDateRange(period);
        return this.expensesService.findAll(organizationId, { startDate, endDate, page: 1, limit: 50 });
      }

      case 'get_inventory': {
        const items = await this.inventoryService.findAll(organizationId);
        if (input.search) {
          const q = (input.search as string).toLowerCase();
          return items.filter((i: any) => i.name.toLowerCase().includes(q));
        }
        return items;
      }

      case 'get_vendors':
        return this.vendorsService.findAll(organizationId, { search: input.search, page: 1, limit: 50 });

      default:
        return { error: `Unknown tool: ${name}` };
    }
  }
}
