import { Injectable } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { PosDashboardService } from '../orders/pos-dashboard.service';
import { ShiftsService } from '../shifts/shifts.service';
import { CustomersService } from '../customers/customers.service';
import { PosReportsService } from '../pos-reports/pos-reports.service';
import { ReportFilterDto } from '../reports/dto';
import { OrderFilterDto } from '../orders/dto/order-filter.dto';
import { CustomerFilterDto } from '../customers/dto/customer-filter.dto';

// Thin facade wrapping existing, already org-scoped POS services in the shapes
// AiService's tool-calling loop expects — the POS analogue of ReportsService
// for the invoicing chat tools.
@Injectable()
export class PosAiDataService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly posDashboardService: PosDashboardService,
    private readonly shiftsService: ShiftsService,
    private readonly customersService: CustomersService,
    private readonly posReportsService: PosReportsService,
  ) {}

  async getSalesSummary(organizationId: string, filter: ReportFilterDto) {
    return this.posDashboardService.getSummary(organizationId, filter);
  }

  async getSalesTrend(organizationId: string, filter: ReportFilterDto) {
    return this.posDashboardService.getTrend(organizationId, filter);
  }

  async getTopMenuItems(organizationId: string, from: string, to?: string) {
    return this.posReportsService.getItemSalesReport(organizationId, from, to);
  }

  async searchOrders(organizationId: string, filter: OrderFilterDto) {
    return this.ordersService.findAll(organizationId, filter);
  }

  async getOrderDetail(organizationId: string, orderId: string) {
    return this.ordersService.findOne(organizationId, orderId);
  }

  async searchCustomers(organizationId: string, search?: string) {
    const filter: CustomerFilterDto = { search, page: 1, limit: 15 };
    return this.customersService.findAll(organizationId, filter);
  }

  async getCustomerHistory(organizationId: string, customerId: string) {
    const [detail, stats] = await Promise.all([
      this.customersService.findOne(customerId, organizationId),
      this.customersService.getStats(customerId, organizationId),
    ]);
    return { ...detail, stats };
  }

  async getShifts(organizationId: string) {
    return this.shiftsService.findAll(organizationId);
  }

  async getCurrentShift(organizationId: string) {
    return this.shiftsService.findCurrent(organizationId);
  }

  async getShiftReport(organizationId: string, shiftId: string) {
    return this.shiftsService.getReportData(organizationId, shiftId);
  }
}
