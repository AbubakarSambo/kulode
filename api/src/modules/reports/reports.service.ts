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

  async getSummary(organizationId: string, filter: ReportFilterDto) {
    const { startDate, endDate } = this.getDateRange(filter);

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

    // Get invoice stats
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

    return {
      period: { startDate, endDate },
      income: {
        total: totalIncome,
        paymentCount: payments._count,
      },
      expenses: {
        total: totalExpenses,
        expenseCount: expenses._count,
      },
      profit,
      profitMargin: totalIncome > 0 ? ((profit / totalIncome) * 100).toFixed(2) : 0,
      invoices: invoiceStats,
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

    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          organizationId,
          status: { in: ['PAID', 'PARTIALLY_PAID'] },
          issueDate: { gte: startDate, lte: endDate },
          deletedAt: null,
        },
      },
      select: {
        serviceItemId: true,
        description: true,
        amount: true,
        serviceItem: { select: { name: true } },
      },
    });

    const grouped = new Map<string, { label: string; revenue: number; count: number }>();

    for (const item of items) {
      const key = item.serviceItemId ?? '__other__';
      const label = item.serviceItem?.name ?? 'Other';
      const existing = grouped.get(key);
      if (existing) {
        existing.revenue += Number(item.amount);
        existing.count += 1;
      } else {
        grouped.set(key, { label, revenue: Number(item.amount), count: 1 });
      }
    }

    // Sort descending; cap named services at top 5, keep Other at the end if present
    const other = grouped.get('__other__');
    grouped.delete('__other__');

    const sorted = Array.from(grouped.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    if (other) sorted.push(other);

    return { period: { startDate, endDate }, services: sorted };
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
