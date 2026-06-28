import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilterDto, ReportPeriod } from './dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private getDateRange(filter: ReportFilterDto): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    switch (filter.period) {
      case ReportPeriod.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case ReportPeriod.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case ReportPeriod.THIS_QUARTER:
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        break;
      case ReportPeriod.LAST_QUARTER:
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarter = lastQuarter < 0 ? 3 : lastQuarter;
        startDate = new Date(year, quarter * 3, 1);
        endDate = new Date(year, (quarter + 1) * 3, 0, 23, 59, 59);
        break;
      case ReportPeriod.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case ReportPeriod.LAST_YEAR:
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
        break;
      case ReportPeriod.CUSTOM:
        startDate = filter.startDate || new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = filter.endDate || now;
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { startDate, endDate };
  }

  private getPreviousDateRange(startDate: Date, endDate: Date, period: ReportPeriod | string): { startDate: Date; endDate: Date } {
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    
    const prevStartDate = new Date(startDate);
    const prevEndDate = new Date(endDate);

    if (period === ReportPeriod.THIS_MONTH || period === ReportPeriod.LAST_MONTH) {
      prevStartDate.setMonth(prevStartDate.getMonth() - 1);
      prevEndDate.setMonth(prevEndDate.getMonth() - 1);
    } else if (period === ReportPeriod.THIS_QUARTER || period === ReportPeriod.LAST_QUARTER) {
      prevStartDate.setMonth(prevStartDate.getMonth() - 3);
      prevEndDate.setMonth(prevEndDate.getMonth() - 3);
    } else if (period === ReportPeriod.THIS_YEAR || period === ReportPeriod.LAST_YEAR) {
      prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);
      prevEndDate.setFullYear(prevEndDate.getFullYear() - 1);
    } else {
      // For CUSTOM, shift back by the exact millisecond difference
      prevStartDate.setTime(prevStartDate.getTime() - diffTime);
      prevEndDate.setTime(prevEndDate.getTime() - diffTime);
    }

    return { startDate: prevStartDate, endDate: prevEndDate };
  }

  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Number((((current - previous) / previous) * 100).toFixed(2));
  }

  async getSummary(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = this.getDateRange(filter);

    // Get previous period range for PoP calculations
    const prevRange = this.getPreviousDateRange(startDate, endDate, filter.period || 'THIS_MONTH');

    // Get total income (payments received)
    const payments = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
      _count: true,
    });

    // Get total expenses
    const expenses = await this.prisma.expense.aggregate({
      where: {
        organizationId,
        expenseDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      _sum: { amount: true },
      _count: true,
    });

    // Get previous period income
    const prevPayments = await this.prisma.payment.aggregate({
      where: {
        organizationId,
        paymentDate: { gte: prevRange.startDate, lte: prevRange.endDate },
      },
      _sum: { amount: true },
    });

    // Get previous period expenses
    const prevExpenses = await this.prisma.expense.aggregate({
      where: {
        organizationId,
        expenseDate: { gte: prevRange.startDate, lte: prevRange.endDate },
        deletedAt: null,
      },
      _sum: { amount: true },
    });

    // Get cumulative payments (since inception)
    const allPayments = await this.prisma.payment.aggregate({
      where: { organizationId },
      _sum: { amount: true },
    });

    // Get cumulative expenses (since inception)
    const allExpenses = await this.prisma.expense.aggregate({
      where: { organizationId, deletedAt: null },
      _sum: { amount: true },
    });

    // Get unpaid/overdue invoice totals (outstanding receivables)
    const unpaidInvoices = await this.prisma.invoice.aggregate({
      where: {
        organizationId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        deletedAt: null,
      },
      _sum: { total: true, amountPaid: true },
    });

    // Get invoice stats for active period
    const invoices = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: {
        organizationId,
        issueDate: { gte: startDate, lte: endDate },
        deletedAt: null,
      },
      _count: true,
      _sum: { total: true },
    });

    const totalIncome = Number(payments._sum.amount || 0);
    const totalExpenses = Number(expenses._sum.amount || 0);
    const profit = totalIncome - totalExpenses;

    const prevIncome = Number(prevPayments._sum.amount || 0);
    const prevExpensesVal = Number(prevExpenses._sum.amount || 0);
    const prevProfit = prevIncome - prevExpensesVal;

    const incomeChange = this.calculatePercentageChange(totalIncome, prevIncome);
    const expensesChange = this.calculatePercentageChange(totalExpenses, prevExpensesVal);
    const profitChange = this.calculatePercentageChange(profit, prevProfit);

    const cumulativeCash = Number(allPayments._sum.amount || 0) - Number(allExpenses._sum.amount || 0);
    const totalOutstanding = Number(unpaidInvoices._sum.total || 0) - Number(unpaidInvoices._sum.amountPaid || 0);

    // Compute average monthly burn rate for active period
    const diffMonths = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth()) +
        1
    );
    const monthlyBurn = totalExpenses / diffMonths;
    const runwayMonths = monthlyBurn > 0 ? (cumulativeCash > 0 ? cumulativeCash / monthlyBurn : 0) : null;

    // Calculate totals by invoice status
    const invoiceStats = invoices.reduce(
      (acc, inv) => {
        acc[inv.status.toLowerCase()] = {
          count: inv._count,
          total: Number(inv._sum.total || 0),
        };
        return acc;
      },
      {} as Record<string, { count: number; total: number }>,
    );

    // Compute Insights
    const insights: { id: string; type: 'info' | 'warning' | 'critical'; title: string; message: string }[] = [];

    // 1. Runway Warning
    if (runwayMonths !== null) {
      if (runwayMonths < 3) {
        insights.push({
          id: 'low-runway',
          type: 'critical',
          title: 'Critical Cash Runway',
          message: `Your cash runway is currently ${runwayMonths.toFixed(1)} months. Consider accelerating overdue invoice collection or optimizing operational expenses.`,
        });
      } else if (runwayMonths < 6) {
        insights.push({
          id: 'low-runway',
          type: 'warning',
          title: 'Low Cash Runway',
          message: `Your cash runway is currently ${runwayMonths.toFixed(1)} months. We recommend reviewing outstanding receivables to safeguard cash flow.`,
        });
      }
    }

    // 2. Client Concentration
    const topClientPayment = await this.prisma.$queryRaw<{ client_name: string; total: number }[]>`
      SELECT 
        c.name as client_name,
        SUM(p.amount)::numeric as total
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN clients c ON i.client_id = c.id
      WHERE p.organization_id = ${organizationId}
        AND p.payment_date >= ${startDate}
        AND p.payment_date <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY total DESC
      LIMIT 1
    `;

    if (topClientPayment && topClientPayment.length > 0 && totalIncome > 0) {
      const topClientRatio = (Number(topClientPayment[0].total) / totalIncome) * 100;
      if (topClientRatio > 30) {
        insights.push({
          id: 'client-concentration',
          type: 'warning',
          title: 'Client Concentration Risk',
          message: `${topClientPayment[0].client_name} accounts for ${topClientRatio.toFixed(1)}% of your income this period. High dependency detected; consider diversifying your client base.`,
        });
      }
    }

    // 3. Burn Rate Spike
    if (expensesChange > 20) {
      insights.push({
        id: 'expense-spike',
        type: 'warning',
        title: 'Expense Spike Detected',
        message: `Your expenses have increased by ${expensesChange.toFixed(1)}% compared to the prior period. Check your category breakdown to isolate the increase.`,
      });
    }

    // 4. Receivables Collector
    if (totalIncome > 0) {
      const receivablesRatio = (totalOutstanding / totalIncome) * 100;
      if (receivablesRatio > 30) {
        insights.push({
          id: 'receivables-leak',
          type: 'info',
          title: 'High Receivables Balance',
          message: `Outstanding overdue invoices equal ${receivablesRatio.toFixed(1)}% of your total income. Consider enabling automated reminders on pending invoices.`,
        });
      }
    }

    return {
      period: { startDate, endDate },
      income: {
        total: totalIncome,
        paymentCount: payments._count,
        change: incomeChange,
      },
      expenses: {
        total: totalExpenses,
        expenseCount: expenses._count,
        change: expensesChange,
      },
      profit,
      profitChange,
      profitMargin: totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(2) : 0,
      cumulativeCash,
      runwayMonths,
      invoices: invoiceStats,
      insights,
    };
  }

  async getIncomeBreakdown(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = this.getDateRange(filter);

    // Income by month
    const monthlyIncome = await this.prisma.$queryRaw<
      { month: string; total: number; count: number }[]
    >`
      SELECT 
        TO_CHAR(payment_date, 'YYYY-MM') as month,
        SUM(amount)::numeric as total,
        COUNT(*)::integer as count
      FROM payments
      WHERE organization_id = ${organizationId}
        AND payment_date >= ${startDate}
        AND payment_date <= ${endDate}
      GROUP BY TO_CHAR(payment_date, 'YYYY-MM')
      ORDER BY month
    `;

    // Income by payment method
    const byMethod = await this.prisma.payment.groupBy({
      by: ['paymentMethod'],
      where: {
        organizationId,
        paymentDate: { gte: startDate, lte: endDate },
      },
      _sum: { amount: true },
      _count: true,
    });

    // Top clients by payment
    const topClients = await this.prisma.$queryRaw<
      { client_id: string; client_name: string; total: number; count: number }[]
    >`
      SELECT 
        c.id as client_id,
        c.name as client_name,
        SUM(p.amount)::numeric as total,
        COUNT(*)::integer as count
      FROM payments p
      JOIN invoices i ON p.invoice_id = i.id
      JOIN clients c ON i.client_id = c.id
      WHERE p.organization_id = ${organizationId}
        AND p.payment_date >= ${startDate}
        AND p.payment_date <= ${endDate}
      GROUP BY c.id, c.name
      ORDER BY total DESC
      LIMIT 10
    `;

    return {
      period: { startDate, endDate },
      monthly: monthlyIncome,
      byPaymentMethod: byMethod.map((m) => ({
        method: m.paymentMethod,
        total: Number(m._sum.amount || 0),
        count: m._count,
      })),
      topClients: topClients.map((c) => ({
        clientId: c.client_id,
        clientName: c.client_name,
        total: Number(c.total),
        paymentCount: c.count,
      })),
    };
  }

  async getExpenseBreakdown(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = this.getDateRange(filter);

    // Expenses by month
    const monthlyExpenses = await this.prisma.$queryRaw<
      { month: string; total: number; count: number }[]
    >`
      SELECT 
        TO_CHAR(expense_date, 'YYYY-MM') as month,
        SUM(amount)::numeric as total,
        COUNT(*)::integer as count
      FROM expenses
      WHERE organization_id = ${organizationId}
        AND expense_date >= ${startDate}
        AND expense_date <= ${endDate}
        AND deleted_at IS NULL
      GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
      ORDER BY month
    `;

    // Expenses by category
    const byCategory = await this.prisma.$queryRaw<
      { category_id: string | null; category_name: string; total: number; count: number }[]
    >`
      SELECT 
        ec.id as category_id,
        COALESCE(ec.name, 'Uncategorized') as category_name,
        SUM(e.amount)::numeric as total,
        COUNT(*)::integer as count
      FROM expenses e
      LEFT JOIN expense_categories ec ON e.category_id = ec.id
      WHERE e.organization_id = ${organizationId}
        AND e.expense_date >= ${startDate}
        AND e.expense_date <= ${endDate}
        AND e.deleted_at IS NULL
      GROUP BY ec.id, ec.name
      ORDER BY total DESC
    `;

    return {
      period: { startDate, endDate },
      monthly: monthlyExpenses,
      byCategory: byCategory.map((c) => ({
        categoryId: c.category_id,
        categoryName: c.category_name,
        total: Number(c.total),
        count: c.count,
      })),
    };
  }

  async getOutstandingInvoices(organizationId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        deletedAt: null,
      },
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    const summary = {
      totalOutstanding: 0,
      overdueCount: 0,
      overdueAmount: 0,
    };

    const processed = invoices.map((inv) => {
      const outstanding = Number(inv.total) - Number(inv.amountPaid);
      const isOverdue = new Date(inv.dueDate) < now && inv.status !== 'PAID';
      
      summary.totalOutstanding += outstanding;
      if (isOverdue) {
        summary.overdueCount++;
        summary.overdueAmount += outstanding;
      }

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        client: inv.client,
        total: Number(inv.total),
        amountPaid: Number(inv.amountPaid),
        outstanding,
        dueDate: inv.dueDate,
        isOverdue,
        daysPastDue: isOverdue
          ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      };
    });

    return {
      summary,
      invoices: processed,
    };
  }

  async getTopServices(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = this.getDateRange(filter);

    const services = await this.prisma.$queryRaw<
      { id: string; label: string; revenue: number; volume: number; count: number }[]
    >`
      SELECT 
        ii.service_item_id as id,
        COALESCE(si.name, ii.description) as label,
        SUM(ii.amount)::numeric as revenue,
        SUM(ii.quantity)::numeric as volume,
        COUNT(ii.id)::integer as count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN service_items si ON ii.service_item_id = si.id
      WHERE i.organization_id = ${organizationId}
        AND ii.service_item_id IS NOT NULL
        AND i.status IN ('PAID', 'PARTIALLY_PAID')
        AND i.issue_date >= ${startDate}
        AND i.issue_date <= ${endDate}
        AND i.deleted_at IS NULL
      GROUP BY ii.service_item_id, si.name, ii.description
      ORDER BY revenue DESC
    `;

    return { 
      period: { startDate, endDate }, 
      services: services.map(s => ({
        id: s.id,
        label: s.label,
        revenue: Number(s.revenue || 0),
        volume: Number(s.volume || 0),
        count: Number(s.count || 0)
      })) 
    };
  }

  async getTopProducts(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = this.getDateRange(filter);

    const products = await this.prisma.$queryRaw<
      { id: string; label: string; revenue: number; volume: number; count: number }[]
    >`
      SELECT 
        ii.inventory_item_id as id,
        COALESCE(inv.name, ii.description) as label,
        SUM(ii.amount)::numeric as revenue,
        SUM(ii.quantity)::numeric as volume,
        COUNT(ii.id)::integer as count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      LEFT JOIN inventory_items inv ON ii.inventory_item_id = inv.id
      WHERE i.organization_id = ${organizationId}
        AND ii.inventory_item_id IS NOT NULL
        AND i.status IN ('PAID', 'PARTIALLY_PAID')
        AND i.issue_date >= ${startDate}
        AND i.issue_date <= ${endDate}
        AND i.deleted_at IS NULL
      GROUP BY ii.inventory_item_id, inv.name, ii.description
      ORDER BY revenue DESC
    `;

    return { 
      period: { startDate, endDate }, 
      products: products.map(p => ({
        id: p.id,
        label: p.label,
        revenue: Number(p.revenue || 0),
        volume: Number(p.volume || 0),
        count: Number(p.count || 0)
      })) 
    };
  }

  async getCashflow(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = this.getDateRange(filter);

    // Monthly income
    const monthlyIncome = await this.prisma.$queryRaw<{ month: string; total: number }[]>`
      SELECT 
        TO_CHAR(payment_date, 'YYYY-MM') as month,
        SUM(amount)::numeric as total
      FROM payments
      WHERE organization_id = ${organizationId}
        AND payment_date >= ${startDate}
        AND payment_date <= ${endDate}
      GROUP BY TO_CHAR(payment_date, 'YYYY-MM')
      ORDER BY month
    `;

    // Monthly expenses
    const monthlyExpenses = await this.prisma.$queryRaw<{ month: string; total: number }[]>`
      SELECT 
        TO_CHAR(expense_date, 'YYYY-MM') as month,
        SUM(amount)::numeric as total
      FROM expenses
      WHERE organization_id = ${organizationId}
        AND expense_date >= ${startDate}
        AND expense_date <= ${endDate}
        AND deleted_at IS NULL
      GROUP BY TO_CHAR(expense_date, 'YYYY-MM')
      ORDER BY month
    `;

    // Combine into monthly cashflow
    const incomeMap = new Map(monthlyIncome.map((i) => [i.month, Number(i.total)]));
    const expenseMap = new Map(monthlyExpenses.map((e) => [e.month, Number(e.total)]));
    
    const allMonths = new Set([...incomeMap.keys(), ...expenseMap.keys()]);
    const cashflow = Array.from(allMonths)
      .sort()
      .map((month) => {
        const income = incomeMap.get(month) || 0;
        const expenses = expenseMap.get(month) || 0;
        return {
          month,
          income,
          expenses,
          net: income - expenses,
        };
      });

    return {
      period: { startDate, endDate },
      monthly: cashflow,
      totals: {
        income: cashflow.reduce((sum, m) => sum + m.income, 0),
        expenses: cashflow.reduce((sum, m) => sum + m.expenses, 0),
        net: cashflow.reduce((sum, m) => sum + m.net, 0),
      },
    };
  }
}
