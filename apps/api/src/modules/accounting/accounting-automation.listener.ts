/** Event-driven accounting automation — posts GL journals when commerce events fire. */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountingBootstrapService } from './accounting-bootstrap.service';
import { AccountingPostingService } from './accounting-posting.service';

@Injectable()
export class AccountingAutomationListener {
  private readonly logger = new Logger(AccountingAutomationListener.name);

  constructor(
    private readonly bootstrap: AccountingBootstrapService,
    private readonly posting: AccountingPostingService,
  ) {}

  @OnEvent('tenant.registered', { async: true })
  async onTenantRegistered(payload: { tenantId?: string }) {
    if (!payload?.tenantId) return;
    try {
      await this.bootstrap.bootstrapTenant(payload.tenantId);
    } catch (err) {
      this.logger.error(`Bootstrap failed for ${payload.tenantId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('pos.sale.completed', { async: true })
  async onSaleCompleted(payload: { saleId: string; tenantId: string; branchId?: string }) {
    if (!payload?.saleId || !payload?.tenantId) return;
    try {
      await this.posting.postSale(payload.saleId, payload.tenantId);
    } catch (err) {
      this.logger.error(`Sale GL post failed ${payload.saleId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.grn.posted', { async: true })
  async onGrnPosted(payload: { grnId: string; tenantId: string; userId?: string }) {
    if (!payload?.grnId || !payload?.tenantId) return;
    try {
      await this.posting.postGoodsReceipt(payload.grnId, payload.tenantId, payload.userId);
    } catch (err) {
      this.logger.error(`GRN GL post failed ${payload.grnId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.supplier-payment.posted', { async: true })
  async onSupplierPayment(payload: { paymentId: string; tenantId: string; userId?: string }) {
    if (!payload?.paymentId || !payload?.tenantId) return;
    try {
      await this.posting.postSupplierPayment(payload.paymentId, payload.tenantId, payload.userId);
    } catch (err) {
      this.logger.error(`AP payment GL post failed ${payload.paymentId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.customer-credit.payment', { async: true })
  async onCustomerCreditPayment(payload: Parameters<AccountingPostingService['postCustomerCreditPayment']>[0]) {
    if (!payload?.paymentTxnId || !payload?.tenantId) return;
    try {
      await this.posting.postCustomerCreditPayment(payload);
    } catch (err) {
      this.logger.error(`AR collection GL post failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.expense.created', { async: true })
  async onExpenseCreated(payload: { expenseId: string; tenantId: string; userId?: string }) {
    if (!payload?.expenseId || !payload?.tenantId) return;
    try {
      await this.posting.postExpense(payload.expenseId, payload.tenantId, payload.userId);
    } catch (err) {
      this.logger.error(`Expense GL post failed ${payload.expenseId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.return.completed', { async: true })
  async onReturnCompleted(payload: { returnId: string; tenantId: string; userId?: string }) {
    if (!payload?.returnId || !payload?.tenantId) return;
    try {
      await this.posting.postReturn(payload.returnId, payload.tenantId, payload.userId);
    } catch (err) {
      this.logger.error(`Return GL post failed ${payload.returnId}: ${(err as Error).message}`);
    }
  }
}
