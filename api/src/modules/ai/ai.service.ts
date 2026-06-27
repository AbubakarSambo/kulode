import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ReportsService } from '../reports/reports.service';
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

const INSIGHTS_TOOL: Anthropic.Tool = {
  name: 'report_insights',
  description: 'Generate structured business insights from the provided financial data.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A 2-3 sentence executive summary of business health for the period.',
      },
      insights: {
        type: 'array',
        description: 'Array of 4-6 specific, actionable insights.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short headline for the insight (5-8 words).' },
            body: { type: 'string', description: 'What the data shows, with specific numbers (2-3 sentences).' },
            recommendation: { type: 'string', description: 'A specific, actionable next step (1-2 sentences).' },
            sentiment: {
              type: 'string',
              enum: ['positive', 'warning', 'neutral'],
              description: '"positive" for good news, "warning" for risks or declines, "neutral" for informational.',
            },
            category: {
              type: 'string',
              enum: ['revenue', 'expenses', 'clients', 'collections', 'products'],
              description: 'The area of business this insight relates to.',
            },
          },
          required: ['title', 'body', 'recommendation', 'sentiment', 'category'],
        },
      },
    },
    required: ['summary', 'insights'],
  },
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly anthropic = new Anthropic();

  constructor(private readonly reportsService: ReportsService) {}

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

    const currency = '₦';
    const fmt = (n: number) =>
      n >= 1_000_000 ? `${currency}${(n / 1_000_000).toFixed(1)}M` : `${currency}${n.toLocaleString()}`;

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

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are a sharp business analyst reviewing financial data for a small business owner.
Analyse the data and call the report_insights tool with EXACTLY 5 insights — no more, no fewer.
Each insight must reference specific numbers from the data.
Be direct and use the actual numbers from the data provided. Avoid generic advice.
Currency is Nigerian Naira (₦).`,
      tools: [INSIGHTS_TOOL],
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: dataPrompt }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    if (!toolUse) {
      this.logger.error('AI did not return structured insights');
      throw new Error('Failed to generate insights');
    }

    const result = toolUse.input as { summary: string; insights: Insight[] };

    return {
      summary: result.summary,
      insights: result.insights,
      period: summary.period,
    };
  }
}
