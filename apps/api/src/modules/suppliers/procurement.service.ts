import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ChequeDirection,
  ChequeStatus,
  GoodsReceiptSource,
  GoodsReceiptStatus,
  PaymentMethod,
  Prisma,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  StockMovementType,
  SupplierInvoiceStatus,
  SupplierLedgerEntryType,
  SupplierReturnStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { InventoryService } from '@/modules/inventory/inventory.module';
import { WorkflowService } from '@/modules/workflow/workflow.module';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { createLinkedExpense } from '@/shared/expense.helper';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import {
  applyInvoicePayment,
  applyPartialReceive,
  canConvertPurchaseRequest,
  canReceiveAgainstPo,
} from './procurement.helper';
import {
  assertSupplierCreditLimit,
  syncSupplierBalanceWithLedger,
} from './supplier-ap.helper';
import { chequeSourceNotes } from '@/modules/accounting/finance.helper';

export type PrItemInput = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  requestedQty: number;
  unitCostHint?: number;
  notes?: string;
};

export type GrnLineInput = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  receivedQty: number;
  rejectedQty?: number;
  unitCost: number;
  orderedQty?: number;
  purchaseItemId?: string;
  batchNumber?: string;
  expiryDate?: string;
  manufactureDate?: string;
};

@Injectable()
export class ProcurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly workflowService: WorkflowService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async nextNumber(tenantId: string, prefix: string, table: 'pr' | 'grn' | 'sret' | 'sinv') {
    const year = new Date().getFullYear();
    const count =
      table === 'pr'
        ? await this.prisma.purchaseRequest.count({ where: { tenantId } })
        : table === 'grn'
          ? await this.prisma.goodsReceipt.count({ where: { tenantId } })
          : table === 'sret'
            ? await this.prisma.supplierReturn.count({ where: { tenantId } })
            : await this.prisma.supplierInvoice.count({ where: { tenantId } });
    return `${prefix}-${year}-${String(count + 1).padStart(5, '0')}`;
  }

  // ── Purchase Requests ─────────────────────────────────────────────

  async createPurchaseRequest(
    tenantId: string,
    branchId: string,
    userId: string,
    items: PrItemInput[],
    notes?: string,
  ) {
    if (!items?.length) throw new BadRequestException('At least one item is required');
    const requestNumber = await this.nextNumber(tenantId, 'PR', 'pr');
    return this.prisma.purchaseRequest.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        requestNumber,
        notes,
        createdBy: userId,
        items: {
          create: items.map((i) => ({
            variantId: i.variantId,
            productName: i.productName,
            variantName: i.variantName,
            sku: i.sku,
            requestedQty: i.requestedQty,
            unitCostHint: i.unitCostHint ?? 0,
            notes: i.notes,
          })),
        },
      },
      include: { items: true },
    });
  }

  async listPurchaseRequests(tenantId: string, query: PaginationDto & { status?: PurchaseRequestStatus }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = { tenantId, ...(query.status && { status: query.status }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseRequest.findMany({
        where,
        skip,
        take,
        include: { items: true, convertedPo: { select: { id: true, poNumber: true, status: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async getPurchaseRequest(id: string, tenantId: string) {
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId },
      include: { items: true, convertedPo: true },
    });
    if (!pr) throw new NotFoundException('Purchase request not found');
    return pr;
  }

  async submitPurchaseRequest(id: string, tenantId: string, userId: string, userRoles: string[]) {
    const pr = await this.getPurchaseRequest(id, tenantId);
    if (pr.status !== PurchaseRequestStatus.DRAFT && pr.status !== PurchaseRequestStatus.REJECTED) {
      throw new BadRequestException('Only draft/rejected requests can be submitted');
    }

    if (bypassesWorkflowApproval(userRoles)) {
      return this.prisma.purchaseRequest.update({
        where: { id },
        data: { status: PurchaseRequestStatus.APPROVED, approvedBy: userId },
        include: { items: true },
      });
    }

    await this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: PurchaseRequestStatus.PENDING_APPROVAL },
    });
    await this.workflowService.start(tenantId, userId, {
      key: 'purchase_request',
      entityType: 'PurchaseRequest',
      entityId: id,
      metadata: { requestNumber: pr.requestNumber },
    });
    return this.getPurchaseRequest(id, tenantId);
  }

  async convertPurchaseRequestToPo(
    id: string,
    tenantId: string,
    branchId: string,
    userId: string,
    supplierId: string,
  ) {
    const pr = await this.getPurchaseRequest(id, tenantId);
    if (!canConvertPurchaseRequest(pr.status)) {
      throw new BadRequestException('Purchase request must be approved before converting to PO');
    }
    if (pr.convertedPoId) throw new BadRequestException('Already converted to a purchase order');

    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const itemsData = pr.items.map((item) => {
      const unitCost = item.unitCostHint || 0;
      const lineTotal = unitCost * item.requestedQty;
      return {
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        orderedQty: item.requestedQty,
        unitCost,
        discount: 0,
        taxRate: 0,
        taxAmount: 0,
        total: lineTotal,
      };
    });
    const subtotal = itemsData.reduce((s, i) => s + i.total, 0);

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: {
          tenantId,
          branchId: pr.branchId || branchId || undefined,
          supplierId,
          poNumber,
          status: PurchaseOrderStatus.DRAFT,
          subtotal,
          taxAmount: 0,
          discountAmount: 0,
          total: subtotal,
          notes: pr.notes ? `From PR ${pr.requestNumber}: ${pr.notes}` : `From PR ${pr.requestNumber}`,
          createdBy: userId,
          items: { create: itemsData },
        },
        include: { items: true, supplier: true },
      });

      await tx.purchaseRequest.update({
        where: { id },
        data: { status: PurchaseRequestStatus.CONVERTED, convertedPoId: po.id },
      });

      return po;
    });
  }

  // ── Goods Receipts ────────────────────────────────────────────────

  async listGoodsReceipts(tenantId: string, query: PaginationDto & { purchaseId?: string }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.purchaseId && { purchaseId: query.purchaseId }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.goodsReceipt.findMany({
        where,
        skip,
        take,
        include: {
          supplier: { select: { id: true, name: true } },
          purchase: { select: { id: true, poNumber: true } },
          _count: { select: { items: true } },
        },
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async getGoodsReceipt(id: string, tenantId: string) {
    const grn = await this.prisma.goodsReceipt.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        purchase: true,
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!grn) throw new NotFoundException('Goods receipt not found');
    return grn;
  }

  /**
   * Core GRN poster — used by PO receive, Direct GRN, and Quick GRN.
   * Always creates a GoodsReceipt document and posts stock.
   */
  async postGoodsReceipt(params: {
    tenantId: string;
    branchId: string;
    userId: string;
    supplierId: string;
    source: GoodsReceiptSource;
    purchaseId?: string;
    notes?: string;
    supplierInvoiceRef?: string;
    lines: GrnLineInput[];
    /** Runs inside the same DB transaction after stock is posted (e.g. PO qty updates). */
    afterStock?: (tx: Prisma.TransactionClient, grn: { id: string; items: { id: string; variantId: string; lotId: string | null }[] }) => Promise<void>;
  }) {
    const { tenantId, branchId, userId, supplierId, source, purchaseId, notes, supplierInvoiceRef, lines, afterStock } = params;
    if (!lines?.length) throw new BadRequestException('At least one GRN line is required');
    if (!branchId) throw new BadRequestException('Branch is required to post GRN');

    const effectiveLines = lines.filter((l) => l.receivedQty > 0 || (l.rejectedQty ?? 0) > 0);
    if (!effectiveLines.length) throw new BadRequestException('Enter at least one received quantity');

    const grnNumber = await this.nextNumber(tenantId, 'GRN', 'grn');

    const grn = await this.prisma.$transaction(async (tx) => {
      const created = await tx.goodsReceipt.create({
        data: {
          tenantId,
          branchId,
          grnNumber,
          source,
          status: GoodsReceiptStatus.POSTED,
          purchaseId,
          supplierId,
          receivedBy: userId,
          notes,
          supplierInvoiceRef,
          items: {
            create: effectiveLines.map((l) => ({
              purchaseItemId: l.purchaseItemId,
              variantId: l.variantId,
              productName: l.productName,
              variantName: l.variantName,
              sku: l.sku,
              orderedQty: l.orderedQty ?? 0,
              receivedQty: l.receivedQty,
              rejectedQty: l.rejectedQty ?? 0,
              unitCost: l.unitCost,
              batchNumber: l.batchNumber,
              expiryDate: l.expiryDate ? new Date(l.expiryDate) : undefined,
              manufactureDate: l.manufactureDate ? new Date(l.manufactureDate) : undefined,
            })),
          },
        },
        include: { items: true },
      });

      for (const line of effectiveLines) {
        if (line.receivedQty <= 0) continue;
        await this.inventoryService.adjustStock(tenantId, branchId, userId, {
          variantId: line.variantId,
          quantity: line.receivedQty,
          movementType: StockMovementType.PURCHASE,
          referenceId: created.id,
          referenceType: 'GoodsReceipt',
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          manufactureDate: line.manufactureDate,
          unitCost: line.unitCost,
          notes: line.batchNumber ? `GRN ${grnNumber} batch ${line.batchNumber}` : `GRN ${grnNumber}`,
        }, tx);

        const lotLog = await tx.inventoryLog.findFirst({
          where: {
            tenantId,
            referenceId: created.id,
            referenceType: 'GoodsReceipt',
            variantId: line.variantId,
            lotId: { not: null },
            NOT: { notes: 'LOT_ALLOCATION' },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (lotLog?.lotId) {
          const item = created.items.find((i) => i.variantId === line.variantId && !i.lotId);
          if (item) {
            await tx.goodsReceiptItem.update({
              where: { id: item.id },
              data: { lotId: lotLog.lotId },
            });
          }
        }
      }

      if (afterStock) {
        await afterStock(tx, created);
      }

      // Direct/Quick GRN (no PO): auto-post supplier invoice so Outstanding includes it
      const receivedValue = effectiveLines.reduce(
        (s, l) => s + Math.max(0, l.receivedQty) * l.unitCost,
        0,
      );
      if (!purchaseId && receivedValue > 0.01) {
        try {
          await assertSupplierCreditLimit(tx, tenantId, supplierId, receivedValue);
        } catch (e) {
          throw new BadRequestException((e as Error).message);
        }
        await tx.supplierInvoice.create({
          data: {
            tenantId,
            supplierId,
            invoiceNumber: `AUTO-${grnNumber}`,
            invoiceDate: new Date(),
            goodsReceiptId: created.id,
            subtotal: receivedValue,
            taxAmount: 0,
            total: receivedValue,
            status: SupplierInvoiceStatus.POSTED,
            notes: `Auto invoice from ${grnNumber}`,
            createdBy: userId,
          },
        });
      }

      await syncSupplierBalanceWithLedger(tx, tenantId, supplierId, {
        entryType: SupplierLedgerEntryType.GRN,
        amount: receivedValue,
        referenceType: 'GoodsReceipt',
        referenceId: created.id,
        notes: `GRN ${grnNumber}`,
        createdBy: userId,
      });

      return created;
    });

    this.eventEmitter.emit('accounting.grn.posted', {
      grnId: grn.id,
      tenantId,
      userId,
    });

    return this.getGoodsReceipt(grn.id, tenantId);
  }

  /** GRN from PO — also updates PO line qtys / status (partial receive). */
  async receiveFromPurchaseOrder(
    poId: string,
    tenantId: string,
    branchId: string,
    userId: string,
    items: {
      itemId: string;
      receivedQty: number;
      rejectedQty?: number;
      batchNumber?: string;
      expiryDate?: string;
      manufactureDate?: string;
    }[],
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      include: { items: true, supplier: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!canReceiveAgainstPo(po.status)) {
      throw new BadRequestException('Purchase order must be approved before receiving items');
    }

    const receiveBranchId = po.branchId || branchId;
    if (po.branchId && branchId && po.branchId !== branchId) {
      throw new BadRequestException('Switch to the purchase order branch before receiving goods');
    }

    const planLines = po.items.map((pi) => {
      const incoming = items.find((i) => i.itemId === pi.id);
      return {
        orderedQty: pi.orderedQty,
        receivedQty: pi.receivedQty,
        thisReceive: incoming?.receivedQty ?? 0,
      };
    });
    const plan = applyPartialReceive(planLines);

    const grnLines: GrnLineInput[] = [];
    for (const item of items) {
      const poItem = po.items.find((i) => i.id === item.itemId);
      if (!poItem) throw new BadRequestException(`Invalid line item: ${item.itemId}`);
      if (item.receivedQty <= 0 && (item.rejectedQty ?? 0) <= 0) continue;
      grnLines.push({
        variantId: poItem.variantId,
        productName: poItem.productName,
        variantName: poItem.variantName,
        sku: poItem.sku,
        receivedQty: item.receivedQty,
        rejectedQty: item.rejectedQty,
        unitCost: poItem.unitCost,
        orderedQty: poItem.orderedQty,
        purchaseItemId: poItem.id,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        manufactureDate: item.manufactureDate,
      });
    }

    const receiveValue = grnLines.reduce((s, l) => s + Math.max(0, l.receivedQty) * l.unitCost, 0);
    try {
      await assertSupplierCreditLimit(this.prisma, tenantId, po.supplierId, receiveValue);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const grn = await this.postGoodsReceipt({
      tenantId,
      branchId: receiveBranchId,
      userId,
      supplierId: po.supplierId,
      source: GoodsReceiptSource.FROM_PO,
      purchaseId: poId,
      notes: `GRN from PO ${po.poNumber}`,
      lines: grnLines,
      afterStock: async (tx) => {
        for (const item of items) {
          if (item.receivedQty <= 0 && (item.rejectedQty ?? 0) <= 0) continue;
          await tx.purchaseOrderItem.update({
            where: { id: item.itemId },
            data: {
              receivedQty: { increment: item.receivedQty },
              rejectedQty: { increment: item.rejectedQty ?? 0 },
            },
          });
        }
        await tx.purchaseOrder.update({
          where: { id: poId },
          data: {
            status:
              plan.status === 'RECEIVED'
                ? PurchaseOrderStatus.RECEIVED
                : plan.status === 'PARTIALLY_RECEIVED'
                  ? PurchaseOrderStatus.PARTIALLY_RECEIVED
                  : po.status,
            receivedDate: plan.fullyReceived ? new Date() : undefined,
          },
        });
      },
    });

    return {
      grn,
      purchaseOrder: await this.prisma.purchaseOrder.findUnique({
        where: { id: poId },
        include: { items: true, supplier: true },
      }),
    };
  }

  /** Direct GRN — no PO required. */
  async createDirectGrn(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: { supplierId: string; notes?: string; supplierInvoiceRef?: string; lines: GrnLineInput[] },
  ) {
    return this.postGoodsReceipt({
      tenantId,
      branchId,
      userId,
      supplierId: dto.supplierId,
      source: GoodsReceiptSource.DIRECT,
      notes: dto.notes,
      supplierInvoiceRef: dto.supplierInvoiceRef,
      lines: dto.lines,
    });
  }

  /** Quick GRN for cashier — simplified single/multi SKU cash purchase receive. */
  async createQuickGrn(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: {
      supplierId: string;
      notes?: string;
      lines: {
        variantId: string;
        quantity: number;
        unitCost: number;
        batchNumber?: string;
        expiryDate?: string;
        manufactureDate?: string;
      }[];
      payment?: {
        amount: number;
        method: PaymentMethod;
        reference?: string;
        notes?: string;
        chequeNumber?: string;
        chequeDueDate?: string;
        chequeBankName?: string;
        chequeBankAccountId?: string;
      };
    },
  ) {
    if (!dto.lines?.length) throw new BadRequestException('Add at least one product');
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: dto.lines.map((l) => l.variantId) }, product: { tenantId } },
      include: { product: true },
    });
    const map = new Map(variants.map((v) => [v.id, v]));

    const lines: GrnLineInput[] = dto.lines.map((l) => {
      const v = map.get(l.variantId);
      if (!v) throw new BadRequestException(`Variant not found: ${l.variantId}`);
      if (l.quantity <= 0) throw new BadRequestException('Quantity must be positive');
      return {
        variantId: v.id,
        productName: v.product.name,
        variantName: v.name,
        sku: v.sku,
        receivedQty: l.quantity,
        unitCost: l.unitCost,
        batchNumber: l.batchNumber,
        expiryDate: l.expiryDate,
        manufactureDate: l.manufactureDate,
      };
    });

    const grn = await this.postGoodsReceipt({
      tenantId,
      branchId,
      userId,
      supplierId: dto.supplierId,
      source: GoodsReceiptSource.QUICK,
      notes: dto.notes ?? 'Quick GRN (cashier)',
      lines,
    });

    let payment: unknown = null;
    if (dto.payment && dto.payment.amount > 0) {
      const inv = await this.prisma.supplierInvoice.findFirst({
        where: { tenantId, goodsReceiptId: grn.id, status: { not: SupplierInvoiceStatus.CANCELLED } },
        orderBy: { createdAt: 'desc' },
      });
      if (!inv) {
        throw new BadRequestException('Auto invoice not found for GRN — cannot record payment');
      }
      payment = await this.paySupplierInvoice(inv.id, tenantId, branchId, userId, {
        amount: dto.payment.amount,
        method: dto.payment.method,
        reference: dto.payment.reference,
        notes: dto.payment.notes ?? `Payment on GRN ${grn.grnNumber}`,
        chequeNumber: dto.payment.chequeNumber,
        chequeDueDate: dto.payment.chequeDueDate,
        chequeBankName: dto.payment.chequeBankName,
        chequeBankAccountId: dto.payment.chequeBankAccountId,
      });
    }

    return { ...grn, payment };
  }

  // ── Supplier Returns ──────────────────────────────────────────────

  async createSupplierReturn(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: {
      supplierId: string;
      purchaseId?: string;
      goodsReceiptId?: string;
      reason?: string;
      notes?: string;
      items: {
        variantId: string;
        productName: string;
        sku: string;
        quantity: number;
        unitCost?: number;
        lotId?: string;
        batchNumber?: string;
        reason?: string;
      }[];
    },
  ) {
    if (!dto.items?.length) throw new BadRequestException('At least one return line is required');
    const returnNumber = await this.nextNumber(tenantId, 'SRET', 'sret');
    return this.prisma.supplierReturn.create({
      data: {
        tenantId,
        branchId,
        returnNumber,
        supplierId: dto.supplierId,
        purchaseId: dto.purchaseId,
        goodsReceiptId: dto.goodsReceiptId,
        reason: dto.reason,
        notes: dto.notes,
        createdBy: userId,
        status: SupplierReturnStatus.DRAFT,
        items: {
          create: dto.items.map((i) => ({
            variantId: i.variantId,
            productName: i.productName,
            sku: i.sku,
            quantity: i.quantity,
            unitCost: i.unitCost ?? 0,
            lotId: i.lotId,
            batchNumber: i.batchNumber,
            reason: i.reason,
          })),
        },
      },
      include: { items: true, supplier: true },
    });
  }

  async postSupplierReturn(id: string, tenantId: string, userId: string) {
    const doc = await this.prisma.supplierReturn.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!doc) throw new NotFoundException('Supplier return not found');
    if (doc.status !== SupplierReturnStatus.DRAFT) {
      throw new BadRequestException('Only draft returns can be posted');
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of doc.items) {
        await this.inventoryService.adjustStock(tenantId, doc.branchId, userId, {
          variantId: item.variantId,
          quantity: item.quantity,
          movementType: StockMovementType.DAMAGE,
          referenceId: doc.id,
          referenceType: 'SupplierReturn',
          lotId: item.lotId ?? undefined,
          batchNumber: item.batchNumber ?? undefined,
          notes: `Supplier return ${doc.returnNumber}`,
        }, tx);
      }

      const credit = doc.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

      // Apply credit against linked PO or GRN auto-invoice so outstanding drops
      if (doc.purchaseId) {
        await tx.purchaseOrder.update({
          where: { id: doc.purchaseId },
          data: { paidAmount: { increment: credit } },
        });
      } else if (doc.goodsReceiptId) {
        const inv = await tx.supplierInvoice.findFirst({
          where: { tenantId, goodsReceiptId: doc.goodsReceiptId },
          orderBy: { createdAt: 'desc' },
        });
        if (inv) {
          const nextPaid = Math.min(inv.total, inv.paidAmount + credit);
          const status =
            nextPaid >= inv.total - 0.01
              ? SupplierInvoiceStatus.PAID
              : nextPaid > 0.01
                ? SupplierInvoiceStatus.PARTIALLY_PAID
                : inv.status;
          await tx.supplierInvoice.update({
            where: { id: inv.id },
            data: { paidAmount: nextPaid, status },
          });
        }
      }

      await tx.supplierReturn.update({
        where: { id },
        data: { status: SupplierReturnStatus.POSTED, postedAt: new Date() },
      });

      await syncSupplierBalanceWithLedger(tx, tenantId, doc.supplierId, {
        entryType: SupplierLedgerEntryType.RETURN,
        amount: -credit,
        referenceType: 'SupplierReturn',
        referenceId: doc.id,
        notes: `Return ${doc.returnNumber}`,
        createdBy: userId,
      });
    });

    return this.prisma.supplierReturn.findUnique({
      where: { id },
      include: { items: true, supplier: true },
    });
  }

  async listSupplierReturns(tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = { tenantId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierReturn.findMany({
        where,
        skip,
        take,
        include: { supplier: { select: { name: true } }, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplierReturn.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  // ── Supplier Invoices ─────────────────────────────────────────────

  async createSupplierInvoice(
    tenantId: string,
    userId: string,
    dto: {
      supplierId: string;
      invoiceNumber: string;
      invoiceDate?: string;
      dueDate?: string;
      purchaseId?: string;
      goodsReceiptId?: string;
      subtotal: number;
      taxAmount?: number;
      notes?: string;
      post?: boolean;
    },
  ) {
    const tax = dto.taxAmount ?? 0;
    const total = dto.subtotal + tax;
    if (dto.post) {
      try {
        await assertSupplierCreditLimit(this.prisma, tenantId, dto.supplierId, total);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }

    const inv = await this.prisma.supplierInvoice.create({
      data: {
        tenantId,
        supplierId: dto.supplierId,
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        purchaseId: dto.purchaseId,
        goodsReceiptId: dto.goodsReceiptId,
        subtotal: dto.subtotal,
        taxAmount: tax,
        total,
        status: dto.post ? SupplierInvoiceStatus.POSTED : SupplierInvoiceStatus.DRAFT,
        notes: dto.notes,
        createdBy: userId,
      },
      include: { supplier: true },
    });

    if (dto.post) {
      await syncSupplierBalanceWithLedger(this.prisma, tenantId, dto.supplierId, {
        entryType: SupplierLedgerEntryType.INVOICE,
        amount: total,
        referenceType: 'SupplierInvoice',
        referenceId: inv.id,
        notes: `Invoice ${inv.invoiceNumber}`,
        createdBy: userId,
      });
    }

    return inv;
  }

  async listSupplierInvoices(tenantId: string, query: PaginationDto & { supplierId?: string }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = { tenantId, ...(query.supplierId && { supplierId: query.supplierId }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplierInvoice.findMany({
        where,
        skip,
        take,
        include: { supplier: { select: { name: true } }, purchase: { select: { poNumber: true } } },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.supplierInvoice.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async paySupplierInvoice(
    invoiceId: string,
    tenantId: string,
    branchId: string,
    userId: string,
    dto: {
      amount: number;
      method: PaymentMethod;
      reference?: string;
      notes?: string;
      chequeNumber?: string;
      chequeDueDate?: string;
      chequeBankName?: string;
      chequeBankAccountId?: string;
    },
  ) {
    const inv = await this.prisma.supplierInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { supplier: true },
    });
    if (!inv) throw new NotFoundException('Supplier invoice not found');
    if (inv.status === SupplierInvoiceStatus.DRAFT || inv.status === SupplierInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Post the invoice before recording payment');
    }

    const next = applyInvoicePayment(inv.total, inv.paidAmount, dto.amount);
    if (dto.method === PaymentMethod.CHEQUE && !dto.chequeNumber?.trim()) {
      throw new BadRequestException('Cheque number is required for cheque payments');
    }

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId: inv.supplierId,
          purchaseId: inv.purchaseId ?? undefined,
          invoiceId: inv.id,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference,
          notes: dto.notes,
        },
      });

      await tx.supplierInvoice.update({
        where: { id: inv.id },
        data: { paidAmount: next.paidAmount, status: next.status },
      });

      if (inv.purchaseId) {
        await tx.purchaseOrder.update({
          where: { id: inv.purchaseId },
          data: { paidAmount: { increment: dto.amount } },
        });
      }

      await syncSupplierBalanceWithLedger(tx, tenantId, inv.supplierId, {
        entryType: SupplierLedgerEntryType.PAYMENT,
        amount: -dto.amount,
        referenceType: 'SupplierPayment',
        referenceId: payment.id,
        notes: `Payment against invoice ${inv.invoiceNumber}`,
        createdBy: userId,
      });

      if (dto.method === PaymentMethod.CHEQUE) {
        await tx.cheque.create({
          data: {
            tenantId,
            direction: ChequeDirection.ISSUED,
            status: ChequeStatus.ISSUED,
            chequeNumber: dto.chequeNumber!.trim(),
            amount: dto.amount,
            bankName: dto.chequeBankName?.trim() || undefined,
            dueDate: dto.chequeDueDate ? new Date(dto.chequeDueDate) : undefined,
            partyType: 'SUPPLIER',
            partyId: inv.supplierId,
            partyName: inv.supplier.name,
            bankAccountId: dto.chequeBankAccountId,
            notes: chequeSourceNotes(
              'SupplierInvoicePayment',
              payment.id,
              dto.notes ? `Supplier invoice payment: ${dto.notes}` : `Supplier invoice ${inv.invoiceNumber}`,
            ),
            createdBy: userId,
          },
        });
      }

      await createLinkedExpense(tx, {
        tenantId,
        branchId: branchId || undefined,
        userId,
        amount: dto.amount,
        description: `Supplier invoice ${inv.invoiceNumber} — ${inv.supplier.name}`,
        date: payment.paidAt,
        categoryId: 'Operations',
        paymentMethod: dto.method,
        reference: `supplier-invoice-payment:${payment.id}`,
      });

      return { payment, invoice: await tx.supplierInvoice.findUnique({ where: { id: inv.id } }) };
    });
  }
}
