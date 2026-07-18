/** Event-driven accounting automation — enqueues outbox events for GL posting. */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountingBootstrapService } from './accounting-bootstrap.service';
import { AccountingOutboxService } from './accounting-outbox.service';

@Injectable()
export class AccountingAutomationListener {
  private readonly logger = new Logger(AccountingAutomationListener.name);

  constructor(
    private readonly bootstrap: AccountingBootstrapService,
    private readonly outbox: AccountingOutboxService,
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
      await this.outbox.enqueue(payload.tenantId, 'SALE', payload.saleId, {
        branchId: payload.branchId,
      });
    } catch (err) {
      this.logger.error(`Sale GL enqueue failed ${payload.saleId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.grn.posted', { async: true })
  async onGrnPosted(payload: { grnId: string; tenantId: string; userId?: string }) {
    if (!payload?.grnId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(payload.tenantId, 'GRN', payload.grnId, {
        userId: payload.userId,
      });
    } catch (err) {
      this.logger.error(`GRN GL enqueue failed ${payload.grnId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.supplier-payment.posted', { async: true })
  async onSupplierPayment(payload: { paymentId: string; tenantId: string; userId?: string }) {
    if (!payload?.paymentId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(payload.tenantId, 'SUPPLIER_PAYMENT', payload.paymentId, {
        userId: payload.userId,
      });
    } catch (err) {
      this.logger.error(`AP payment GL enqueue failed ${payload.paymentId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.supplier-invoice.posted', { async: true })
  async onSupplierInvoice(payload: { invoiceId: string; tenantId: string; userId?: string }) {
    if (!payload?.invoiceId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(payload.tenantId, 'SUPPLIER_INVOICE', payload.invoiceId, {
        userId: payload.userId,
      });
    } catch (err) {
      this.logger.error(`Supplier invoice GL enqueue failed ${payload.invoiceId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.supplier-return.posted', { async: true })
  async onSupplierReturn(payload: { returnId: string; tenantId: string; userId?: string }) {
    if (!payload?.returnId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(payload.tenantId, 'SUPPLIER_RETURN', payload.returnId, {
        userId: payload.userId,
      });
    } catch (err) {
      this.logger.error(`Supplier return GL enqueue failed ${payload.returnId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.customer-credit.payment', { async: true })
  async onCustomerCreditPayment(payload: {
    paymentTxnId: string;
    tenantId: string;
    customerId: string;
    amount: number;
    applied: number;
    advance: number;
    method: string;
    applyFromWallet?: boolean;
    description: string;
    branchId?: string;
    userId?: string;
    date?: string | Date;
  }) {
    if (!payload?.paymentTxnId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(
        payload.tenantId,
        'CUSTOMER_CREDIT_PAYMENT',
        payload.paymentTxnId,
        { ...payload },
      );
    } catch (err) {
      this.logger.error(`AR collection GL enqueue failed: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.expense.created', { async: true })
  async onExpenseCreated(payload: { expenseId: string; tenantId: string; userId?: string }) {
    if (!payload?.expenseId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(payload.tenantId, 'EXPENSE', payload.expenseId, {
        userId: payload.userId,
      });
    } catch (err) {
      this.logger.error(`Expense GL enqueue failed ${payload.expenseId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.return.completed', { async: true })
  async onReturnCompleted(payload: { returnId: string; tenantId: string; userId?: string }) {
    if (!payload?.returnId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(payload.tenantId, 'SALE_RETURN', payload.returnId, {
        userId: payload.userId,
      });
    } catch (err) {
      this.logger.error(`Return GL enqueue failed ${payload.returnId}: ${(err as Error).message}`);
    }
  }

  @OnEvent('accounting.repair.delivered', { async: true })
  async onRepairDelivered(payload: { jobCardId: string; tenantId: string; userId?: string }) {
    if (!payload?.jobCardId || !payload?.tenantId) return;
    try {
      await this.outbox.enqueue(payload.tenantId, 'REPAIR', payload.jobCardId, {
        userId: payload.userId,
      });
    } catch (err) {
      this.logger.error(`Repair GL enqueue failed ${payload.jobCardId}: ${(err as Error).message}`);
    }
  }
}
