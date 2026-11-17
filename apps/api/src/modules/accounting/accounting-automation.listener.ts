/** Event-driven accounting automation — enqueues outbox events for GL posting. */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountingBootstrapService } from './accounting-bootstrap.service';
import { AccountingOutboxService } from './accounting-outbox.service';

@Injectable()
export class AccountingAutomationListener {
  private readonly logger = new Logger(AccountingAutomationListener.name);
  private readonly inFlight = new Map<number, { label: string; promise: Promise<unknown> }>();
  private nextTaskId = 0;

  constructor(
    private readonly bootstrap: AccountingBootstrapService,
    private readonly outbox: AccountingOutboxService,
  ) {}

  async waitForIdle(timeoutMs = 30_000): Promise<void> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('Accounting handler drain timeout must be a positive number');
    }

    const deadline = Date.now() + timeoutMs;
    while (this.inFlight.size > 0) {
      const current = [...this.inFlight.values()];
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw this.createDrainTimeout(timeoutMs);

      let timer: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        Promise.allSettled(current.map((work) => work.promise)).then(() => 'settled' as const),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), remainingMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (outcome === 'timeout' && this.inFlight.size > 0) {
        throw this.createDrainTimeout(timeoutMs);
      }
    }
  }

  @OnEvent('tenant.registered')
  onTenantRegistered(payload: { tenantId?: string }) {
    if (!payload?.tenantId) return;
    this.track(`tenant.registered:${payload.tenantId}`, async () => {
      try {
        await this.bootstrap.bootstrapTenant(payload.tenantId!);
      } catch (err) {
        this.logger.error(`Bootstrap failed for ${payload.tenantId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('pos.sale.completed')
  onSaleCompleted(payload: { saleId: string; tenantId: string; branchId?: string }) {
    if (!payload?.saleId || !payload?.tenantId) return;
    this.track(`SALE:${payload.saleId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'SALE', payload.saleId, {
          branchId: payload.branchId,
        });
      } catch (err) {
        this.logger.error(`Sale GL enqueue failed ${payload.saleId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.grn.posted')
  onGrnPosted(payload: { grnId: string; tenantId: string; userId?: string }) {
    if (!payload?.grnId || !payload?.tenantId) return;
    this.track(`GRN:${payload.grnId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'GRN', payload.grnId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`GRN GL enqueue failed ${payload.grnId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.supplier-payment.posted')
  onSupplierPayment(payload: { paymentId: string; tenantId: string; userId?: string }) {
    if (!payload?.paymentId || !payload?.tenantId) return;
    this.track(`SUPPLIER_PAYMENT:${payload.paymentId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'SUPPLIER_PAYMENT', payload.paymentId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`AP payment GL enqueue failed ${payload.paymentId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.supplier-advance.applied')
  onSupplierAdvanceApplied(payload: { batchId: string; tenantId: string; userId?: string }) {
    if (!payload?.batchId || !payload?.tenantId) return;
    this.track(`SUPPLIER_ADVANCE_APPLIED:${payload.batchId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'SUPPLIER_ADVANCE_APPLIED', payload.batchId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`Supplier advance GL enqueue failed ${payload.batchId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.supplier-invoice.posted')
  onSupplierInvoice(payload: { invoiceId: string; tenantId: string; userId?: string }) {
    if (!payload?.invoiceId || !payload?.tenantId) return;
    this.track(`SUPPLIER_INVOICE:${payload.invoiceId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'SUPPLIER_INVOICE', payload.invoiceId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`Supplier invoice GL enqueue failed ${payload.invoiceId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.supplier-return.posted')
  onSupplierReturn(payload: { returnId: string; tenantId: string; userId?: string }) {
    if (!payload?.returnId || !payload?.tenantId) return;
    this.track(`SUPPLIER_RETURN:${payload.returnId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'SUPPLIER_RETURN', payload.returnId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`Supplier return GL enqueue failed ${payload.returnId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.wallet.topup')
  onWalletTopUp(payload: { walletTxnId: string; tenantId: string; userId?: string }) {
    if (!payload?.walletTxnId || !payload?.tenantId) return;
    this.track(`WALLET_TOPUP:${payload.walletTxnId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'WALLET_TOPUP', payload.walletTxnId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`Wallet top-up GL enqueue failed ${payload.walletTxnId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.customer-credit.payment')
  onCustomerCreditPayment(payload: {
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
    this.track(`CUSTOMER_CREDIT_PAYMENT:${payload.paymentTxnId}`, async () => {
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
    });
  }

  @OnEvent('accounting.expense.created')
  onExpenseCreated(payload: { expenseId: string; tenantId: string; userId?: string }) {
    if (!payload?.expenseId || !payload?.tenantId) return;
    this.track(`EXPENSE:${payload.expenseId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'EXPENSE', payload.expenseId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`Expense GL enqueue failed ${payload.expenseId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.return.completed')
  onReturnCompleted(payload: { returnId: string; tenantId: string; userId?: string }) {
    if (!payload?.returnId || !payload?.tenantId) return;
    this.track(`SALE_RETURN:${payload.returnId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'SALE_RETURN', payload.returnId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`Return GL enqueue failed ${payload.returnId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('cash.wallet.cleared')
  onCashierWalletCleared(payload: { registerId: string; tenantId: string; clearedById?: string }) {
    if (!payload?.registerId || !payload?.tenantId) return;
    this.track(`CASH_WALLET_CLEAR:${payload.registerId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'CASH_WALLET_CLEAR', payload.registerId, {
          userId: payload.clearedById,
        });
      } catch (err) {
        this.logger.error(`Wallet clear GL enqueue failed ${payload.registerId}: ${(err as Error).message}`);
      }
    });
  }

  @OnEvent('accounting.repair.delivered')
  onRepairDelivered(payload: { jobCardId: string; tenantId: string; userId?: string }) {
    if (!payload?.jobCardId || !payload?.tenantId) return;
    this.track(`REPAIR:${payload.jobCardId}`, async () => {
      try {
        await this.outbox.enqueue(payload.tenantId, 'REPAIR', payload.jobCardId, {
          userId: payload.userId,
        });
      } catch (err) {
        this.logger.error(`Repair GL enqueue failed ${payload.jobCardId}: ${(err as Error).message}`);
      }
    });
  }

  private track(label: string, work: () => Promise<unknown>): void {
    const id = ++this.nextTaskId;
    const promise = Promise.resolve().then(work);
    this.inFlight.set(id, { label, promise });
    void promise.then(
      () => this.inFlight.delete(id),
      () => this.inFlight.delete(id),
    );
  }

  private createDrainTimeout(timeoutMs: number): Error {
    const pending = [...this.inFlight.values()].map((work) => work.label);
    return new Error(
      `Timed out after ${timeoutMs}ms waiting for accounting work: ${pending.join(', ') || 'unknown work'}`,
    );
  }
}
