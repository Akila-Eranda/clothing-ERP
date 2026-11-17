import { assertSupplierCashPayable } from '@/shared/cash-register.helper';
import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
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
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import {
  applyInvoicePayment,
  applyPartialReceive,
  canConvertPurchaseRequest,
  canReceiveAgainstPo,
  buildMrpWarnings,
  canEditGrnPricing,
  calculatePoReceiptPayable,
  effectivePoReceiptUnitCost,
  grnRequestMatches,
  isUniqueConflictOn,
  matchGrnItemsToLines,
} from './procurement.helper';
import { isClientRequestIdConflict, normalizeClientRequestId } from '@/modules/pos/pos-idempotency.helper';
import {
  assertSupplierCreditLimit,
  syncSupplierBalanceWithLedger,
} from './supplier-ap.helper';
import { SupplierApService , ApTxContext } from './supplier-ap.service';
import { assertVariantsInTenant } from '@/modules/inventory/tenant-ownership.helper';
import {
  assertGoodsReceiptInTenant,
  assertPurchaseItemsInTenant,
  assertPurchaseOrderInTenant,
  assertReturnLinesReturnable,
  assertReturnLotsInTenant,
  assertSupplierInTenant,
} from './procurement-ownership.helper';
import { chequeSourceNotes } from '@/modules/accounting/finance.helper';
import { DocumentNumberingService } from '@/modules/document-numbering/document-numbering.service';
import type { NumberSeriesKey } from '@/modules/document-numbering/document-numbering.helper';

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
  sellingPrice?: number | null;
  mrp?: number | null;
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
    private readonly apService: SupplierApService,
    private readonly numbering: DocumentNumberingService,
  ) {}

  private async nextNumber(tenantId: string, prefix: string, table: 'pr' | 'grn' | 'sret' | 'sinv') {
    if (this.numbering.isEngineEnabled()) {
      const keyMap: Record<typeof table, NumberSeriesKey> = {
        pr: 'PURCHASE_REQUEST',
        grn: 'GRN',
        sret: 'SUPPLIER_RETURN',
        sinv: 'SUPPLIER_INVOICE',
      };
      return this.numbering.allocateStandalone(tenantId, keyMap[table]);
    }
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

  private async nextPoNumber(tenantId: string): Promise<string> {
    if (this.numbering.isEngineEnabled()) {
      return this.numbering.allocateStandalone(tenantId, 'PURCHASE_ORDER');
    }
    return `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
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
    await assertVariantsInTenant(this.prisma, tenantId, items.map((i) => i.variantId));
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

    const poNumber = await this.nextPoNumber(tenantId);
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
    /** Optional payable amount for AP/ledger (excludes free qty). Defaults to sum(receivedQty * unitCost). */
    payableAmount?: number;
    /** Runs inside the same DB transaction after stock is posted (e.g. PO qty updates). */
    afterStock?: (tx: Prisma.TransactionClient, grn: { id: string; items: { id: string; variantId: string; lotId: string | null }[] }) => Promise<void>;
    /**
     * Runs LAST inside the same DB transaction (after the auto invoice and supplier ledger exist), e.g. the
     * supplier payment of a PO receive / Quick GRN: if it throws, the whole GRN — stock, lots, PO quantities,
     * invoice, ledger — rolls back. Nothing of a failed payment, nor of its goods receipt, remains.
     */
    beforeCommit?: (tx: Prisma.TransactionClient, grn: { id: string; grnNumber: string }) => Promise<void>;
    /**
     * Runs FIRST inside the transaction, before anything is written: lock the source document and re-check it
     * against fresh data (e.g. PO receive: row lock + over-receipt check). May return the payable amount and
     * final lines computed from that fresh data.
     */
    lockAndCheck?: (tx: Prisma.TransactionClient) => Promise<{ payableAmount?: number; lines?: GrnLineInput[] } | void>;
    /** Idempotency key: a second request with the same key returns the first GRN and posts nothing. */
    clientRequestId?: string | null;
    actorRoles?: string[];
  }) {
    const { tenantId, branchId, userId, supplierId, source, purchaseId, notes, supplierInvoiceRef, lines, afterStock, beforeCommit, payableAmount, lockAndCheck } = params;
    const clientRequestId = normalizeClientRequestId(params.clientRequestId);
    if (!lines?.length) throw new BadRequestException('At least one GRN line is required');
    if (!branchId) throw new BadRequestException('Branch is required to post GRN');

    const effectiveLines = lines.filter((l) => l.receivedQty > 0 || (l.rejectedQty ?? 0) > 0);
    if (!effectiveLines.length) throw new BadRequestException('Enter at least one received quantity');
    // Every id that reaches a write must be this tenant's: supplier and each variant (S-F8). PO receive passes
    // the PO's own supplier/variants, Direct and Quick GRN pass client ids; all are checked here, before anything.
    await assertSupplierInTenant(this.prisma, tenantId, supplierId);
    await assertVariantsInTenant(this.prisma, tenantId, effectiveLines.map((l) => l.variantId));
    if (
      // Quick GRN decides cost authority itself (createQuickGrn): existing cost is open to a Cashier, edits are not.
      source === GoodsReceiptSource.DIRECT
      && effectiveLines.some((line) => line.unitCost != null || line.sellingPrice != null || line.mrp != null)
      && !canEditGrnPricing(params.actorRoles ?? [])
    ) {
      throw new ForbiddenException('Changing GRN purchase cost, selling price or MRP requires an authorised inventory or finance role');
    }

    // Selling price above MRP is a WARNING only: stock receiving is never blocked by it.
    const warnings = buildMrpWarnings(effectiveLines);

    const replayOf = async () => {
      if (!clientRequestId) return null;
      const existing = await this.prisma.goodsReceipt.findFirst({
        where: { tenantId, clientRequestId },
        include: { items: true },
      });
      if (!existing) return null;
      if (existing.branchId !== branchId || existing.supplierId !== supplierId || (existing.purchaseId ?? null) !== (purchaseId ?? null)) {
        throw new ConflictException('clientRequestId was already used for a different goods receipt');
      }
      const full = await this.getGoodsReceipt(existing.id, tenantId);
      if (!grnRequestMatches(existing.items, effectiveLines)) {
        throw new ConflictException('clientRequestId was already used for a different goods receipt payload');
      }
      return { ...full, warnings, replayed: true as const };
    };
    const earlier = await replayOf();
    if (earlier) return earlier;

    // The legacy GRN number is count + 1, so two receipts at the same moment can draw the same number:
    // retry with a fresh number instead of failing (the unique index keeps numbers distinct).
    let grn: { id: string } | null = null;
    for (let attempt = 1; ; attempt++) {
      const grnNumber = await this.nextNumber(tenantId, 'GRN', 'grn');
      try {
        grn = await this.postGoodsReceiptTx({ ...params, clientRequestId, effectiveLines, grnNumber, lockAndCheck, payableAmount });
        break;
      } catch (e) {
        if (clientRequestId && isClientRequestIdConflict(e)) {
          const replay = await replayOf();
          if (replay) return replay;
        }
        if (attempt < 3 && isUniqueConflictOn(e, 'grnNumber')) continue;
        throw e;
      }
    }

    this.eventEmitter.emit('accounting.grn.posted', {
      grnId: grn!.id,
      tenantId,
      userId,
    });

    if (warnings.length) {
      // Best-effort audit trail (existing audit_logs table); never breaks the receipt.
      try {
        await this.prisma.auditLog.create({
          data: { tenantId, userId, action: 'GRN_PRICE_ABOVE_MRP', resource: 'GoodsReceipt', resourceId: grn!.id, newData: { warnings } as unknown as Prisma.InputJsonValue },
        });
      } catch { /* audit must never block receiving */ }
    }

    return { ...(await this.getGoodsReceipt(grn!.id, tenantId)), warnings };
  }

  private async postGoodsReceiptTx(p: {
    tenantId: string;
    branchId: string;
    userId: string;
    supplierId: string;
    source: GoodsReceiptSource;
    purchaseId?: string;
    notes?: string;
    supplierInvoiceRef?: string;
    effectiveLines: GrnLineInput[];
    grnNumber: string;
    clientRequestId: string | null;
    payableAmount?: number;
    afterStock?: (tx: Prisma.TransactionClient, grn: { id: string; items: { id: string; variantId: string; lotId: string | null }[] }) => Promise<void>;
    beforeCommit?: (tx: Prisma.TransactionClient, grn: { id: string; grnNumber: string }) => Promise<void>;
    lockAndCheck?: (tx: Prisma.TransactionClient) => Promise<{ payableAmount?: number; lines?: GrnLineInput[] } | void>;
  }) {
    const { tenantId, branchId, userId, supplierId, source, purchaseId, notes, supplierInvoiceRef, grnNumber, clientRequestId, afterStock, beforeCommit, lockAndCheck } = p;
    return this.prisma.$transaction(async (tx) => {
      const checked = lockAndCheck ? await lockAndCheck(tx) : undefined;
      const payableAmount = checked && checked.payableAmount != null ? checked.payableAmount : p.payableAmount;
      const effectiveLines = checked && checked.lines ? checked.lines : p.effectiveLines;
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
          clientRequestId,
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

      const itemIdxByLine = matchGrnItemsToLines(effectiveLines, created.items);
      for (let li = 0; li < effectiveLines.length; li++) {
        const line = effectiveLines[li];
        if (line.receivedQty <= 0) continue;
        const stock = await this.inventoryService.adjustStock(tenantId, branchId, userId, {
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

        const sell = line.sellingPrice != null && line.sellingPrice > 0 ? line.sellingPrice : null;
        const mrp = line.mrp != null && line.mrp > 0 ? line.mrp : null;
        if (sell != null || mrp != null) {
          await tx.productVariant.updateMany({
            where: { id: line.variantId, product: { tenantId } },
            data: {
              ...(sell != null ? { sellingPrice: sell } : {}),
              ...(mrp != null ? { mrp } : {}),
            },
          });
        }

        // Link the item to the exact lot this line created/topped up (returned by adjustStock), not "any lot of the variant".
        const lotId = (stock as { _lotId?: string | null })._lotId;
        const item = itemIdxByLine[li] >= 0 ? created.items[itemIdxByLine[li]] : undefined;
        if (lotId && item) {
          await tx.goodsReceiptItem.update({ where: { id: item.id }, data: { lotId } });
          item.lotId = lotId;
        }
      }

      if (afterStock) {
        await afterStock(tx, created);
      }

      // Link received variants to this supplier (supports multi-supplier products).
      const linkedVariantIds = new Set<string>();
      for (const line of effectiveLines) {
        if (line.receivedQty <= 0 || linkedVariantIds.has(line.variantId)) continue;
        linkedVariantIds.add(line.variantId);
        await tx.supplierProductAssignment.upsert({
          where: {
            supplierId_variantId: { supplierId, variantId: line.variantId },
          },
          create: {
            tenantId,
            supplierId,
            variantId: line.variantId,
            lastBuyingPrice: line.unitCost,
            isActive: true,
          },
          update: {
            lastBuyingPrice: line.unitCost,
            isActive: true,
          },
        });
      }

      // Direct/Quick GRN (no PO): auto-post supplier invoice so Outstanding includes it
      const stockValue = effectiveLines.reduce(
        (s, l) => s + Math.max(0, l.receivedQty) * l.unitCost,
        0,
      );
      const receivedValue =
        payableAmount != null && Number.isFinite(payableAmount)
          ? Math.max(0, payableAmount)
          : stockValue;
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

      if (beforeCommit) await beforeCommit(tx, { id: created.id, grnNumber });

      return created;
    }, { timeout: 30_000, maxWait: 10_000 });
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
    /** Supplier payment made with this receipt: runs inside the GRN transaction (all or nothing). */
    pay?: (tx: Prisma.TransactionClient, grn: { id: string; grnNumber: string }) => Promise<unknown>,
    opts: { clientRequestId?: string | null } = {},
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      include: { items: true, supplier: true },
    });
    let paymentResult: unknown = null;
    if (!po) throw new NotFoundException('Purchase order not found');

    // Retry of a receipt that already went through (lost response, double click): return it, post nothing.
    const clientRequestId = normalizeClientRequestId(opts.clientRequestId);
    if (clientRequestId) {
      const existing = await this.prisma.goodsReceipt.findFirst({
        where: { tenantId, clientRequestId },
        include: { items: true },
      });
      if (existing) {
        if (existing.purchaseId !== poId) {
          throw new ConflictException('clientRequestId was already used for a different goods receipt');
        }
        const replayLines = items.map((item) => {
          const poItem = po.items.find((candidate) => candidate.id === item.itemId);
          return {
            variantId: poItem?.variantId ?? '',
            purchaseItemId: item.itemId,
            receivedQty: item.receivedQty,
            rejectedQty: item.rejectedQty,
            unitCost: poItem?.unitCost ?? 0,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
          };
        });
        if (!grnRequestMatches(existing.items, replayLines)) {
          throw new ConflictException('clientRequestId was already used for a different goods receipt payload');
        }
        return {
          grn: await this.getGoodsReceipt(existing.id, tenantId),
          payment: null,
          replayed: true,
          purchaseOrder: await this.prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true, supplier: true } }),
        };
      }
    }

    if (!canReceiveAgainstPo(po.status)) {
      throw new BadRequestException('Purchase order must be approved before receiving items');
    }

    const receiveBranchId = po.branchId || branchId;
    if (po.branchId && branchId && po.branchId !== branchId) {
      throw new BadRequestException('Switch to the purchase order branch before receiving goods');
    }

    type PoLine = { id: string; orderedQty: number; receivedQty: number; unitCost: number; discount?: number | null; freeQty?: number | null };
    const planFor = (poItems: PoLine[]) => {
      try {
        return applyPartialReceive(poItems.map((pi) => {
          const incoming = items.find((i) => i.itemId === pi.id);
          return {
            orderedQty: pi.orderedQty + Math.max(0, pi.freeQty ?? 0),
            receivedQty: pi.receivedQty,
            thisReceive: incoming?.receivedQty ?? 0,
          };
        }));
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    };
    // Payable value: only ordered (paid) qty, not free bonus units
    const payableFor = (poItems: PoLine[]) => calculatePoReceiptPayable(poItems, items);
    // Early, friendly check on the data read above; the binding check runs again under the PO row lock.
    let plan = planFor(po.items);

    const buildGrnLines = (poItems: typeof po.items): GrnLineInput[] => {
      const lines: GrnLineInput[] = [];
      for (const item of items) {
        const poItem = poItems.find((i) => i.id === item.itemId);
        if (!poItem) throw new BadRequestException(`Invalid line item: ${item.itemId}`);
        if (item.receivedQty <= 0 && (item.rejectedQty ?? 0) <= 0) continue;
        const freeQty = (poItem as { freeQty?: number }).freeQty ?? 0;
        const expectedQty = poItem.orderedQty + Math.max(0, freeQty);
        const expiry =
          item.expiryDate
          || ((poItem as { expiryDate?: Date | null }).expiryDate
            ? new Date((poItem as { expiryDate: Date }).expiryDate).toISOString().slice(0, 10)
            : undefined);
        const poSell = (poItem as { sellingPrice?: number | null }).sellingPrice;
        const poMrp = (poItem as { mrp?: number | null }).mrp;
        lines.push({
          variantId: poItem.variantId,
          productName: poItem.productName,
          variantName: poItem.variantName,
          sku: poItem.sku,
          receivedQty: item.receivedQty,
          rejectedQty: item.rejectedQty,
          unitCost: effectivePoReceiptUnitCost(poItem, item.receivedQty),
          sellingPrice: poSell != null && poSell > 0 ? poSell : null,
          mrp: poMrp != null && poMrp > 0 ? poMrp : null,
          orderedQty: expectedQty,
          purchaseItemId: poItem.id,
          batchNumber: item.batchNumber,
          expiryDate: expiry,
          manufactureDate: item.manufactureDate,
        });
      }
      return lines;
    };
    const grnLines = buildGrnLines(po.items);

    const receiveValue = payableFor(po.items);
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
      payableAmount: receiveValue,
      clientRequestId,
      // Concurrent receipts of the same PO run one after the other: lock the PO row, then re-check the
      // over-receipt rule and the payable value against what is received NOW (not what was read before).
      lockAndCheck: async (tx) => {
        await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${poId} AND "tenantId" = ${tenantId} FOR UPDATE`;
        const fresh = await tx.purchaseOrder.findFirst({ where: { id: poId, tenantId }, include: { items: true } });
        if (!fresh || !canReceiveAgainstPo(fresh.status)) {
          throw new BadRequestException('Purchase order must be approved before receiving items');
        }
        plan = planFor(fresh.items);
        const freshPayable = payableFor(fresh.items);
        try {
          await assertSupplierCreditLimit(tx, tenantId, po.supplierId, freshPayable);
        } catch (e) {
          throw new BadRequestException((e as Error).message);
        }
        return { payableAmount: freshPayable, lines: buildGrnLines(fresh.items) };
      },
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
      beforeCommit: pay ? async (tx, g) => { paymentResult = await pay(tx, g); } : undefined,
    });

    return {
      grn,
      payment: paymentResult,
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
    dto: { supplierId: string; notes?: string; supplierInvoiceRef?: string; lines: GrnLineInput[]; clientRequestId?: string },
    actorRoles: string[] = [],
  ) {
    // Optional PO line links must be lines of this tenant's POs for the same variant (S-F8).
    await assertPurchaseItemsInTenant(this.prisma, tenantId, dto.lines ?? []);
    return this.postGoodsReceipt({
      tenantId,
      branchId,
      userId,
      supplierId: dto.supplierId,
      source: GoodsReceiptSource.DIRECT,
      notes: dto.notes,
      supplierInvoiceRef: dto.supplierInvoiceRef,
      lines: dto.lines,
      clientRequestId: dto.clientRequestId,
      actorRoles,
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
        /** Optional: omitted = the product's existing purchase cost. Any other value needs a pricing role. */
        unitCost?: number;
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
        clientRequestId?: string;
      };
      clientRequestId?: string;
    },
    cash: { authorizedById?: string | null } = {},
    actorRoles: string[] = [],
  ) {
    if (!dto.lines?.length) throw new BadRequestException('Add at least one product');
    // Ownership first: a foreign supplier is a 404 whatever else is wrong with the request (S-F8), before cost authority is judged.
    await assertSupplierInTenant(this.prisma, tenantId, dto.supplierId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: dto.lines.map((l) => l.variantId) }, product: { tenantId } },
      include: { product: true },
    });
    const map = new Map(variants.map((v) => [v.id, v]));

    const mayEditPricing = canEditGrnPricing(actorRoles);
    const lines: GrnLineInput[] = dto.lines.map((l) => {
      const v = map.get(l.variantId);
      if (!v) throw new BadRequestException(`Variant not found: ${l.variantId}`);
      if (l.quantity <= 0) throw new BadRequestException('Quantity must be positive');
      // A Cashier receives stock at the product's EXISTING cost; cost is never typed by them (and a manager's PIN
      // approval authorises cash, not pricing). Sending the unchanged cost is not an edit, anything else is.
      const catalogCost = v.costPrice > 0 ? v.costPrice : (v.product.costPrice ?? 0);
      const requested = l.unitCost;
      const isCostEdit = requested != null && Math.abs(requested - catalogCost) > 0.005;
      if (isCostEdit && !mayEditPricing) {
        throw new ForbiddenException('Changing GRN purchase cost, selling price or MRP requires an authorised inventory or finance role');
      }
      const unitCost = requested ?? catalogCost;
      if (!(unitCost > 0)) {
        throw new BadRequestException(
          mayEditPricing
            ? `Enter the unit cost for ${v.product.name}: it has no purchase cost yet`
            : `${v.product.name} has no purchase cost yet — ask a manager to receive it`,
        );
      }
      return {
        variantId: v.id,
        productName: v.product.name,
        variantName: v.name,
        sku: v.sku,
        receivedQty: l.quantity,
        unitCost,
        batchNumber: l.batchNumber,
        expiryDate: l.expiryDate,
        manufactureDate: l.manufactureDate,
      };
    });

    // Payment (if any) is part of the GRN transaction: approval, drawer cash (locked) or any other payment
    // error rolls back the stock receipt as well — no received-but-unpaid goods, no half-recorded payment.
    let payment: unknown = null;
    const after: (() => void)[] = [];
    const pay = dto.payment && dto.payment.amount > 0 ? dto.payment : null;
    const grn = await this.postGoodsReceipt({
      tenantId,
      branchId,
      userId,
      supplierId: dto.supplierId,
      source: GoodsReceiptSource.QUICK,
      notes: dto.notes ?? 'Quick GRN (cashier)',
      lines,
      clientRequestId: dto.clientRequestId,
      actorRoles,
      beforeCommit: pay
        ? async (tx, g) => {
            const inv = await tx.supplierInvoice.findFirst({
              where: { tenantId, goodsReceiptId: g.id, status: { not: SupplierInvoiceStatus.CANCELLED } },
              orderBy: { createdAt: 'desc' },
            });
            if (!inv) throw new BadRequestException('Auto invoice not found for GRN — cannot record payment');
            payment = await this.paySupplierInvoice(inv.id, tenantId, branchId, userId, {
              amount: pay.amount,
              method: pay.method,
              reference: pay.reference,
              notes: pay.notes ?? `Payment on GRN ${g.grnNumber}`,
              chequeNumber: pay.chequeNumber,
              chequeDueDate: pay.chequeDueDate,
              chequeBankName: pay.chequeBankName,
              chequeBankAccountId: pay.chequeBankAccountId,
              clientRequestId: pay.clientRequestId ?? dto.clientRequestId,
            }, cash, { tx, after });
          }
        : undefined,
    });
    for (const fire of after) fire(); // payment events only once the GRN + payment committed

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
    // Defence in depth behind the DTO (S-F7): the service may be called without the ValidationPipe.
    for (const i of dto.items) {
      if (!Number.isFinite(i.quantity) || i.quantity <= 0) throw new BadRequestException('Return quantity must be greater than zero');
      if (i.unitCost != null && (!Number.isFinite(i.unitCost) || i.unitCost < 0)) {
        throw new BadRequestException('Unit cost must be zero or more');
      }
    }
    // Every id must be this tenant's (S-F8), and quantities must fit what the GRN / PO received (S-F7).
    await assertSupplierInTenant(this.prisma, tenantId, dto.supplierId);
    await assertVariantsInTenant(this.prisma, tenantId, dto.items.map((i) => i.variantId));
    if (dto.purchaseId) await assertPurchaseOrderInTenant(this.prisma, tenantId, dto.purchaseId, dto.supplierId);
    await assertReturnLotsInTenant(this.prisma, tenantId, branchId, dto.items);
    await assertReturnLinesReturnable(this.prisma, tenantId, { ...dto, branchId });
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
      // Claim the return first: of two simultaneous posts only one moves DRAFT -> POSTED, so stock leaves once.
      const claimed = await tx.supplierReturn.updateMany({
        where: { id, tenantId, status: SupplierReturnStatus.DRAFT },
        data: { status: SupplierReturnStatus.POSTED, postedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException('Only draft returns can be posted');

      // Re-check against POSTED returns under a lock on the source GRN / PO, so two different drafts posted at
      // once cannot together return more than was received (S-F7); also refuses drafts that point at another
      // tenant's GRN / PO (S-F8). Validation only: the credit below is computed exactly as before.
      if (doc.goodsReceiptId) {
        await tx.$queryRaw`SELECT id FROM "goods_receipts" WHERE id = ${doc.goodsReceiptId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      } else if (doc.purchaseId) {
        await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${doc.purchaseId} AND "tenantId" = ${tenantId} FOR UPDATE`;
      }
      if (doc.purchaseId) await assertPurchaseOrderInTenant(tx, tenantId, doc.purchaseId, doc.supplierId);
      await assertReturnLinesReturnable(tx, tenantId, doc, doc.id);

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
        await tx.purchaseOrder.updateMany({
          where: { id: doc.purchaseId, tenantId },
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

      await syncSupplierBalanceWithLedger(tx, tenantId, doc.supplierId, {
        entryType: SupplierLedgerEntryType.RETURN,
        amount: -credit,
        referenceType: 'SupplierReturn',
        referenceId: doc.id,
        notes: `Return ${doc.returnNumber}`,
        createdBy: userId,
      });
    });

    const posted = await this.prisma.supplierReturn.findUnique({
      where: { id },
      include: { items: true, supplier: true },
    });
    this.eventEmitter.emit('accounting.supplier-return.posted', {
      returnId: id,
      tenantId,
      userId,
    });
    return posted;
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

  async getSupplierReturn(id: string, tenantId: string) {
    const doc = await this.prisma.supplierReturn.findFirst({
      where: { id, tenantId },
      include: {
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        purchase: { select: { id: true, poNumber: true } },
        goodsReceipt: { select: { id: true, grnNumber: true } },
        items: true,
      },
    });
    if (!doc) throw new NotFoundException('Supplier return not found');
    return doc;
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
    // Validation only (H4); the DTO enforces the same, this guards callers that bypass the ValidationPipe.
    if (!Number.isFinite(dto.subtotal) || dto.subtotal < 0 || !Number.isFinite(tax) || tax < 0) {
      throw new BadRequestException('Invoice amounts must be zero or more');
    }
    const total = dto.subtotal + tax;
    // supplier / PO / GRN must be this tenant's and belong together, before anything is written (S-F8).
    await assertSupplierInTenant(this.prisma, tenantId, dto.supplierId);
    if (dto.purchaseId) await assertPurchaseOrderInTenant(this.prisma, tenantId, dto.purchaseId, dto.supplierId);
    if (dto.goodsReceiptId) await assertGoodsReceiptInTenant(this.prisma, tenantId, dto.goodsReceiptId, dto.supplierId);
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
      this.eventEmitter.emit('accounting.supplier-invoice.posted', {
        invoiceId: inv.id,
        tenantId,
        userId,
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

  /** Approval + drawer cash for a payment made with a goods receipt, checked before anything is posted. */
  assertCashPayable(tenantId: string, branchId: string | null | undefined, actor: { actorId: string; authorizerId: string | null }, payment?: { method?: string | null; amount?: number | null } | null) {
    return assertSupplierCashPayable(this.prisma, payment, { tenantId, branchId, cashierId: actor.actorId, authorizerId: actor.authorizerId });
  }

  /** Acting PIN cashier + approving manager for drawer cash (see SupplierApService.resolveCash). */
  resolveCash(tenantId: string, user: { id: string; roles?: string[] }, unlockToken?: string, approvalToken?: string) {
    return this.apService.resolveCash(tenantId, user, unlockToken, approvalToken);
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
      paidAt?: string;
      clientRequestId?: string;
    },
    cash: { authorizedById?: string | null } = {},
    ctx?: ApTxContext,
  ) {
    const db = ctx?.tx ?? this.prisma;
    const inv = await db.supplierInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { supplier: true },
    });
    if (!inv) throw new NotFoundException('Supplier invoice not found');
    if (inv.status === SupplierInvoiceStatus.DRAFT || inv.status === SupplierInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Post the invoice before recording payment');
    }
    if (dto.method === PaymentMethod.CHEQUE && !dto.chequeNumber?.trim() && !dto.reference?.trim()) {
      throw new BadRequestException('Cheque number is required for cheque payments');
    }
    if (dto.method === PaymentMethod.CHEQUE && !dto.chequeDueDate?.trim()) {
      throw new BadRequestException('Cheque due date is required');
    }

    const result = await this.apService.receivePayment(
      inv.supplierId,
      tenantId,
      branchId,
      userId,
      {
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference ?? dto.chequeNumber,
        notes: dto.notes ?? `Payment against invoice ${inv.invoiceNumber}`,
        invoiceId: inv.id,
        paidAt: dto.paidAt,
        chequeNumber: dto.chequeNumber,
        chequeDueDate: dto.chequeDueDate,
        chequeBankName: dto.chequeBankName,
        chequeBankAccountId: dto.chequeBankAccountId,
        clientRequestId: dto.clientRequestId,
      },
      cash,
      ctx,
    );

    return {
      payment: result.payment,
      invoice: await db.supplierInvoice.findUnique({ where: { id: inv.id } }),
      supplierBalance: result.balanceAfter,
    };
  }
}
