import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

/**
 * Report Engine — operational reporting boundary (sales, stock, tax, etc.).
 *
 * Public API (via ReportsService):
 * - salesReport / inventoryReport / profitReport / …
 * - Pure math: report-engine.helper (dayRange, round2, summarize*, cross-checks)
 *
 * Accounting TB/P&L/BS stay on FinancialReportsService.
 * Dashboard KPIs stay on DashboardService.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

/** Alias — Shared Report Engine entrypoint. */
export { ReportsService, ReportsService as ReportEngine } from './reports.service';
export {
  dayRange,
  round2,
  sumField,
  crossCheckTotals,
  summarizeInventoryRows,
  marginPct,
  pctChange,
  groupByKey,
} from './report-engine.helper';
