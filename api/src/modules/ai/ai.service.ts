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
  ): Promise<{ message: string }> {
    const today = new Date().toISOString().split('T')[0];

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a knowledgeable business analyst with access to this business's live data.
Answer questions conversationally using the tools to look up real data — never guess or estimate numbers.
Use markdown for formatting: **bold** for key figures, bullet lists, tables where appropriate, ## for section headers.
Do not use emojis. Keep responses concise. Format currency as ₦ (Nigerian Naira).
Today is ${today}.`,
      },
      ...messages.map((m) => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
    ];

    while (true) {
      const response = await this.client.chat.completions.create({
        model: 'deepseek-chat',
        messages: chatMessages,
        tools: CHAT_TOOLS,
        max_tokens: 1024,
      });

      const choice = response.choices[0];
      const message = choice.message;

      if (choice.finish_reason === 'stop') {
        return { message: message.content ?? '' };
      }

      if (choice.finish_reason === 'tool_calls') {
        chatMessages.push(message);

        for (const rawCall of message.tool_calls ?? []) {
          const toolCall = rawCall as FunctionToolCall;
          let result: unknown;
          try {
            const input = JSON.parse(toolCall.function.arguments);
            result = await this.runTool(toolCall.function.name, input, organizationId);
          } catch (err) {
            this.logger.error(`Chat tool ${toolCall.function.name} failed`, err);
            result = { error: err instanceof Error ? err.message : 'Tool execution failed' };
          }

          chatMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }

        continue;
      }

      return { message: message.content ?? 'Something went wrong. Please try again.' };
    }
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
