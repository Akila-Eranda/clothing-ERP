import { Module } from '@nestjs/common';
import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import * as dayjs from 'dayjs';
import {
  summarizeChequeRows,
  summarizeCommissionRows,
  summarizeCustomerRows,
  summarizeInventoryRows,
  summarizePurchaseRows,
  sumField,
} from './reports.helper';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    return this.prisma.sale.findMany({
      where: { tenantId, status: { not: 'CANCELLED' }, ...(branchId && { branchId }), invoiceDate: dateRange },
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true } },
        cashier: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
        items: true,
        payments: true,
      },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async inventoryReport(tenantId: string, branchId?: string) {
    const rows = await this.prisma.inventory.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      include: {
        variant: {
          include: {
            product: { include: { category: true, brand: true } },
          },
        },
        branch: { select: { name: true } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { quantity: 'asc' },
    });
    return {
      summary: summarizeInventoryRows(rows),
      rows,
    };
  }

  async stockMovementReport(tenantId: string, startDate: string, endDate: string) {
    return this.prisma.inventoryLog.findMany({
      where: {
        tenantId,
        NOT: { notes: 'LOT_ALLOCATION' },
        createdAt: {
          gte: dayjs(startDate).startOf('day').toDate(),
          lte: dayjs(endDate).endOf('day').toDate(),
        },
      },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async expiryReport(tenantId: string, branchId?: string, withinDays = 90) {
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + withinDays);

    const lots = await this.prisma.inventoryLot.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
        isActive: true,
        quantity: { gt: 0 },
        expiryDate: { not: null, lte: until },
      },
      include: {
        variant: { include: { product: { include: { category: true } } } },
        branch: { select: { name: true, code: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const rows = lots.map((lot) => {
      const days = lot.expiryDate
        ? Math.floor(
          (new Date(lot.expiryDate.getFullYear(), lot.expiryDate.getMonth(), lot.expiryDate.getDate()).getTime()
            - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000,
        )
        : null;
      const status = days == null ? 'NO_EXPIRY' : days < 0 ? 'EXPIRED' : days <= 7 ? 'CRITICAL' : days <= 30 ? 'WARNING' : 'WATCH';
      return {
        lotId: lot.id,
        batchNumber: lot.batchNumber,
        expiryDate: lot.expiryDate,
        daysToExpiry: days,
        status,
        quantity: lot.quantity,
        reservedQty: lot.reservedQty,
        availableQty: Math.max(0, lot.quantity - lot.reservedQty),
        unitCost: lot.unitCost,
        value: lot.quantity * (lot.unitCost || 0),
        sku: lot.variant.sku,
        productName: lot.variant.product.name,
        variantName: lot.variant.name,
        category: lot.variant.product.category?.name ?? null,
        branch: lot.branch.name,
      };
    });

    const summary = {
      withinDays,
      expired: rows.filter((r) => r.status === 'EXPIRED').length,
      critical: rows.filter((r) => r.status === 'CRITICAL').length,
      warning: rows.filter((r) => r.status === 'WARNING').length,
      watch: rows.filter((r) => r.status === 'WATCH').length,
      totalLots: rows.length,
      totalQty: rows.reduce((s, r) => s + r.quantity, 0),
      totalValue: rows.reduce((s, r) => s + r.value, 0),
      expiredValue: rows.filter((r) => r.status === 'EXPIRED').reduce((s, r) => s + r.value, 0),
      nearExpiryValue: rows.filter((r) => r.status !== 'EXPIRED').reduce((s, r) => s + r.value, 0),
    };

    return { summary, rows };
  }

  async customerReport(tenantId: string) {
    const rows = await this.prisma.customer.findMany({
      where: { tenantId },
      select: {
        id: true, code: true, firstName: true, lastName: true,
        phone: true, email: true, tier: true,
        totalSpent: true, totalOrders: true, loyaltyPoints: true,
        walletBalance: true, creditBalance: true, creditLimit: true,
        createdAt: true, lastPurchaseAt: true,
      },
      orderBy: { totalSpent: 'desc' },
    });
    return {
      summary: summarizeCustomerRows(rows),
      rows,
    };
  }

  async supplierReport(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId },
      include: { _count: { select: { purchases: true } } },
      orderBy: { name: 'asc' },
    });
    const payments = await this.prisma.supplierPayment.groupBy({
      by: ['supplierId'],
      where: { tenantId },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const payMap = Object.fromEntries(
      payments.map((p) => [p.supplierId, { paid: p._sum.amount ?? 0, paymentCount: p._count._all }]),
    );
    const rows = suppliers.map((s) => ({
      ...s,
      totalPaid: payMap[s.id]?.paid ?? 0,
      paymentCount: payMap[s.id]?.paymentCount ?? 0,
    }));
    return {
      summary: {
        suppliers: rows.length,
        purchaseOrders: rows.reduce((n, r) => n + (r._count?.purchases ?? 0), 0),
        totalPaid: sumField(rows, (r) => r.totalPaid),
      },
      rows,
    };
  }

  async profitReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const items = await this.prisma.saleItem.findMany({
      where: { sale: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' }, ...(branchId && { branchId }) } },
      select: { productName: true, variantName: true, sku: true, quantity: true, unitPrice: true, costPrice: true, discount: true, total: true, taxAmount: true },
    });
    const map: Record<string, { productName: string; variantName: string; sku: string; qty: number; revenue: number; cost: number; profit: number }> = {};
    for (const i of items) {
      const key = i.sku;
      if (!map[key]) map[key] = { productName: i.productName, variantName: i.variantName, sku: i.sku, qty: 0, revenue: 0, cost: 0, profit: 0 };
      map[key].qty     += i.quantity;
      map[key].revenue += i.total;
      map[key].cost    += i.costPrice * i.quantity;
      map[key].profit  += i.total - (i.costPrice * i.quantity);
    }
    const rows = Object.values(map).sort((a, b) => b.profit - a.profit);
    const totals = rows.reduce((acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, profit: acc.profit + r.profit }), { revenue: 0, cost: 0, profit: 0 });
    return { rows, totals, margin: totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(2) : '0' };
  }

  async bestSellingItems(tenantId: string, startDate: string, endDate: string, limit = 20, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productName', 'sku'],
      where: { sale: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' }, ...(branchId && { branchId }) } },
      _sum: { quantity: true, total: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    return grouped.map(g => ({
      productName: g.productName,
      sku: g.sku,
      totalQty: g._sum.quantity ?? 0,
      totalRevenue: g._sum.total ?? 0,
      orderCount: g._count.id,
    }));
  }

  async cashierReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const grouped = await this.prisma.sale.groupBy({
      by: ['cashierId'],
      where: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' }, ...(branchId && { branchId }) },
      _sum: { total: true, discountAmount: true, taxAmount: true },
      _count: { id: true },
    });
    const cashierIds = grouped.map(g => g.cashierId).filter(Boolean) as string[];
    const users = cashierIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: cashierIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    const rows = grouped.map(g => ({
      cashierId: g.cashierId,
      cashierName: g.cashierId && userMap[g.cashierId] ? `${userMap[g.cashierId].firstName} ${userMap[g.cashierId].lastName}` : 'Unknown',
      salesCount: g._count.id,
      totalRevenue: g._sum.total ?? 0,
      totalDiscount: g._sum.discountAmount ?? 0,
      totalTax: g._sum.taxAmount ?? 0,
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      summary: {
        cashiers: rows.length,
        salesCount: rows.reduce((s, r) => s + r.salesCount, 0),
        totalRevenue: sumField(rows, (r) => r.totalRevenue),
        totalDiscount: sumField(rows, (r) => r.totalDiscount),
        totalTax: sumField(rows, (r) => r.totalTax),
      },
      rows,
    };
  }

  async branchReport(tenantId: string, startDate: string, endDate: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const grouped = await this.prisma.sale.groupBy({
      by: ['branchId'],
      where: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' } },
      _sum: { total: true, taxAmount: true, discountAmount: true },
      _count: { id: true },
    });
    const branchIds = grouped.map((g) => g.branchId).filter(Boolean) as string[];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true, code: true } })
      : [];
    const branchMap = Object.fromEntries(branches.map((b) => [b.id, b]));
    const rows = grouped
      .map((g) => ({
        branchId: g.branchId,
        branchName: g.branchId ? branchMap[g.branchId]?.name ?? 'Unknown' : 'No branch',
        branchCode: g.branchId ? branchMap[g.branchId]?.code ?? '' : '',
        salesCount: g._count.id,
        totalRevenue: g._sum.total ?? 0,
        totalTax: g._sum.taxAmount ?? 0,
        totalDiscount: g._sum.discountAmount ?? 0,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      summary: {
        branches: rows.length,
        salesCount: rows.reduce((s, r) => s + r.salesCount, 0),
        totalRevenue: sumField(rows, (r) => r.totalRevenue),
        totalTax: sumField(rows, (r) => r.totalTax),
        totalDiscount: sumField(rows, (r) => r.totalDiscount),
      },
      rows,
    };
  }

  async purchaseReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const orders = await this.prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        orderDate: dateRange,
        status: { not: 'CANCELLED' },
        ...(branchId ? { branchId } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        items: { select: { orderedQty: true, receivedQty: true, productName: true, sku: true } },
      },
      orderBy: { orderDate: 'desc' },
    });

    const payments = await this.prisma.supplierPayment.findMany({
      where: { tenantId, paidAt: dateRange },
      include: { supplier: { select: { name: true } } },
      orderBy: { paidAt: 'desc' },
    });

    const rows = orders.map((o) => ({
      id: o.id,
      poNumber: o.poNumber,
      status: o.status,
      orderDate: o.orderDate,
      expectedDate: o.expectedDate,
      receivedDate: o.receivedDate,
      supplierId: o.supplierId,
      supplierName: o.supplier.name,
      supplierCode: o.supplier.code,
      subtotal: o.subtotal,
      taxAmount: o.taxAmount,
      discountAmount: o.discountAmount,
      total: o.total,
      paidAmount: o.paidAmount,
      outstanding: Math.max(0, o.total - o.paidAmount),
      itemCount: o.items.length,
      orderedQty: o.items.reduce((s, i) => s + i.orderedQty, 0),
      receivedQty: o.items.reduce((s, i) => s + i.receivedQty, 0),
    }));

    const summary = summarizePurchaseRows(rows);
    return {
      summary: {
        ...summary,
        paymentsTotal: sumField(payments, (p) => p.amount),
        paymentCount: payments.length,
      },
      rows,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt,
        supplierName: p.supplier.name,
        reference: p.reference,
      })),
    };
  }

  async chequeReport(tenantId: string, startDate?: string, endDate?: string) {
    const where: {
      tenantId: string;
      createdAt?: { gte: Date; lte: Date };
    } = { tenantId };
    if (startDate && endDate) {
      where.createdAt = {
        gte: dayjs(startDate).startOf('day').toDate(),
        lte: dayjs(endDate).endOf('day').toDate(),
      };
    }

    const rows = await this.prisma.cheque.findMany({
      where,
      include: { bankAccount: { select: { name: true, code: true } } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    });

    const mapped = rows.map((c) => ({
      id: c.id,
      chequeNumber: c.chequeNumber,
      direction: c.direction,
      status: c.status,
      amount: c.amount,
      bankName: c.bankName,
      partyName: c.partyName,
      partyType: c.partyType,
      issueDate: c.issueDate,
      dueDate: c.dueDate,
      clearedAt: c.clearedAt,
      bankAccount: c.bankAccount,
    }));

    return {
      summary: summarizeChequeRows(mapped),
      rows: mapped,
    };
  }

  async commissionReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId,
        invoiceDate: dateRange,
        status: { not: 'CANCELLED' },
        helperCommission: { gt: 0 },
        ...(branchId ? { branchId } : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        total: true,
        helperEmployeeId: true,
        helperName: true,
        helperCommission: true,
        cashier: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
      orderBy: { invoiceDate: 'desc' },
    });

    const byHelper = new Map<string, {
      helperKey: string;
      helperEmployeeId: string | null;
      helperName: string;
      salesCount: number;
      salesTotal: number;
      commissionTotal: number;
    }>();

    for (const s of sales) {
      const key = s.helperEmployeeId || s.helperName || 'unknown';
      const cur = byHelper.get(key) ?? {
        helperKey: key,
        helperEmployeeId: s.helperEmployeeId,
        helperName: s.helperName || 'Unknown helper',
        salesCount: 0,
        salesTotal: 0,
        commissionTotal: 0,
      };
      cur.salesCount += 1;
      cur.salesTotal += s.total;
      cur.commissionTotal += s.helperCommission;
      byHelper.set(key, cur);
    }

    const rows = Array.from(byHelper.values()).sort((a, b) => b.commissionTotal - a.commissionTotal);
    return {
      summary: summarizeCommissionRows(rows),
      rows,
      sales: sales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        invoiceDate: s.invoiceDate,
        total: s.total,
        helperName: s.helperName,
        helperCommission: s.helperCommission,
        cashierName: s.cashier ? `${s.cashier.firstName} ${s.cashier.lastName ?? ''}`.trim() : null,
        branchName: s.branch?.name ?? null,
      })),
    };
  }

  async supplierPerformanceReport(tenantId: string) {
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { tenantId, status: { notIn: ['DRAFT', 'CANCELLED'] } },
      select: {
        id: true, supplierId: true, total: true, orderDate: true, expectedDate: true, receivedDate: true,
        supplier: { select: { name: true } },
      },
    });
    const map = new Map<string, {
      supplierId: string; supplierName: string; orderCount: number; totalSpend: number;
      onTimeDeliveries: number; lateDeliveries: number; leadDaysTotal: number; receivedCount: number;
    }>();
    for (const po of pos) {
      const key = po.supplierId;
      if (!map.has(key)) {
        map.set(key, {
          supplierId: po.supplierId,
          supplierName: po.supplier.name,
          orderCount: 0,
          totalSpend: 0,
          onTimeDeliveries: 0,
          lateDeliveries: 0,
          leadDaysTotal: 0,
          receivedCount: 0,
        });
      }
      const row = map.get(key)!;
      row.orderCount += 1;
      row.totalSpend += po.total;
      if (po.receivedDate) {
        row.receivedCount += 1;
        row.leadDaysTotal += Math.max(0, dayjs(po.receivedDate).diff(dayjs(po.orderDate), 'day'));
        if (po.expectedDate) {
          if (dayjs(po.receivedDate).isAfter(dayjs(po.expectedDate).endOf('day'))) row.lateDeliveries += 1;
          else row.onTimeDeliveries += 1;
        }
      }
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        avgLeadDays: r.receivedCount > 0 ? Math.round((r.leadDaysTotal / r.receivedCount) * 10) / 10 : null,
        onTimeRate: r.receivedCount > 0 ? Math.round((r.onTimeDeliveries / r.receivedCount) * 100) : null,
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend);
  }

  async supplierPriceHistory(tenantId: string, variantId?: string, supplierId?: string, limit = 50) {
    const items = await this.prisma.purchaseOrderItem.findMany({
      where: {
        purchase: {
          tenantId,
          status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED'] },
          ...(supplierId ? { supplierId } : {}),
        },
        ...(variantId ? { variantId } : {}),
      },
      include: {
        purchase: {
          select: {
            poNumber: true, orderDate: true, supplierId: true,
            supplier: { select: { name: true } },
          },
        },
      },
      orderBy: { purchase: { orderDate: 'desc' } },
      take: Math.min(100, limit),
    });
    return items.map((i) => ({
      variantId: i.variantId,
      sku: i.sku,
      productName: i.productName,
      variantName: i.variantName,
      unitCost: i.unitCost,
      orderedQty: i.orderedQty,
      poNumber: i.purchase.poNumber,
      orderDate: i.purchase.orderDate,
      supplierId: i.purchase.supplierId,
      supplierName: i.purchase.supplier.name,
    }));
  }

  async taxReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const saleWhere = {
      tenantId,
      status: { not: 'CANCELLED' as const },
      invoiceDate: dateRange,
      ...(branchId && { branchId }),
    };
    const aggregated = await this.prisma.sale.aggregate({
      where: saleWhere,
      _sum: { total: true, taxAmount: true, subtotal: true, discountAmount: true },
      _count: { id: true },
    });
    const byTaxRate = await this.prisma.saleItem.groupBy({
      by: ['taxRate'],
      where: { sale: saleWhere },
      _sum: { taxAmount: true, total: true, quantity: true },
      orderBy: { taxRate: 'asc' },
    });
    return { summary: aggregated._sum, count: aggregated._count.id, byTaxRate };
  }

  async tyreBrandSales(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const items = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          tenantId,
          status: { not: 'CANCELLED' },
          invoiceDate: dateRange,
          ...(branchId && { branchId }),
        },
      },
      include: { variant: { include: { product: { include: { brand: true } } } } },
    });
    const map: Record<string, { brand: string; qty: number; revenue: number }> = {};
    for (const i of items) {
      const brand = i.variant?.product?.brand?.name ?? 'Unknown';
      if (!map[brand]) map[brand] = { brand, qty: 0, revenue: 0 };
      map[brand].qty += i.quantity;
      map[brand].revenue += i.total;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }

  async serviceRevenueReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const cards = await this.prisma.jobCard.findMany({
      where: {
        tenantId,
        status: { in: ['COMPLETED', 'INVOICED'] },
        completedAt: dateRange,
        ...(branchId && { branchId }),
      },
      include: { lines: { include: { serviceCatalog: true } } },
    });
    const byService: Record<string, { name: string; count: number; revenue: number }> = {};
    let totalParts = 0;
    let totalLabor = 0;
    for (const card of cards) {
      for (const line of card.lines) {
        if (line.lineType === 'PART') totalParts += line.total;
        else {
          totalLabor += line.total;
          const key = line.serviceCatalog?.name ?? line.description ?? 'Other Service';
          if (!byService[key]) byService[key] = { name: key, count: 0, revenue: 0 };
          byService[key].count += line.quantity;
          byService[key].revenue += line.total;
        }
      }
    }
    return {
      jobCount: cards.length,
      totalParts,
      totalLabor,
      total: totalParts + totalLabor,
      byService: Object.values(byService).sort((a, b) => b.revenue - a.revenue),
    };
  }

  async technicianPerformanceReport(tenantId: string, startDate: string, endDate: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const cards = await this.prisma.jobCard.findMany({
      where: {
        tenantId,
        status: { in: ['COMPLETED', 'INVOICED'] },
        completedAt: dateRange,
        technicianId: { not: null },
      },
      select: { technicianId: true, total: true },
    });
    const map: Record<string, { technicianId: string; jobs: number; revenue: number }> = {};
    for (const c of cards) {
      const id = c.technicianId!;
      if (!map[id]) map[id] = { technicianId: id, jobs: 0, revenue: 0 };
      map[id].jobs += 1;
      map[id].revenue += c.total;
    }
    const techIds = Object.keys(map);
    const users = techIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: techIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameMap = Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName ?? ''}`.trim()]));
    return Object.values(map)
      .map((r) => ({ ...r, name: nameMap[r.technicianId] ?? r.technicianId }))
      .sort((a, b) => b.revenue - a.revenue);
  }
}

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Generate sales report' })
  salesReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.salesReport(user.tenantId, start, end, branchId);
  }

  @Get('inventory')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Generate inventory report' })
  inventoryReport(@CurrentUser() user: IAuthUser, @Query('branchId') branchId?: string) {
    return this.reportsService.inventoryReport(user.tenantId, branchId);
  }

  @Get('stock-movement')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Stock movement report' })
  stockMovementReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.reportsService.stockMovementReport(user.tenantId, start, end);
  }

  @Get('expiry')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Batch expiry report (near-expiry and expired lots)' })
  expiryReport(
    @CurrentUser() user: IAuthUser,
    @Query('branchId') branchId?: string,
    @Query('withinDays') withinDays?: string,
  ) {
    return this.reportsService.expiryReport(
      user.tenantId,
      branchId || user.branchId || undefined,
      withinDays ? parseInt(withinDays, 10) : 90,
    );
  }

  @Get('customers')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Customer report' })
  customerReport(@CurrentUser() user: IAuthUser) {
    return this.reportsService.customerReport(user.tenantId);
  }

  @Get('suppliers')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Supplier report' })
  supplierReport(@CurrentUser() user: IAuthUser) {
    return this.reportsService.supplierReport(user.tenantId);
  }

  @Get('tax')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Tax/GST report' })
  taxReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.taxReport(user.tenantId, start, end, branchId);
  }

  @Get('profit')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Profit report by product (revenue vs cost)' })
  profitReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.profitReport(user.tenantId, start, end, branchId);
  }

  @Get('best-selling')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Best selling products by quantity' })
  bestSellingItems(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('limit') limit?: string, @Query('branchId') branchId?: string) {
    return this.reportsService.bestSellingItems(user.tenantId, start, end, limit ? parseInt(limit) : 20, branchId);
  }

  @Get('cashier')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Sales performance by cashier' })
  cashierReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.cashierReport(user.tenantId, start, end, branchId);
  }

  @Get('branches')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Sales performance by branch' })
  branchReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.reportsService.branchReport(user.tenantId, start, end);
  }

  @Get('purchases')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Purchase order & supplier payment report' })
  purchaseReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start: string,
    @Query('endDate') end: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.reportsService.purchaseReport(user.tenantId, start, end, branchId || user.branchId || undefined);
  }

  @Get('cheques')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Cheque status and due-date report' })
  chequeReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start?: string,
    @Query('endDate') end?: string,
  ) {
    return this.reportsService.chequeReport(user.tenantId, start, end);
  }

  @Get('commission')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Helper commission report' })
  commissionReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start: string,
    @Query('endDate') end: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.reportsService.commissionReport(user.tenantId, start, end, branchId || user.branchId || undefined);
  }

  @Get('supplier-performance')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Supplier delivery and spend analytics' })
  supplierPerformance(@CurrentUser() user: IAuthUser) {
    return this.reportsService.supplierPerformanceReport(user.tenantId);
  }

  @Get('supplier-price-history')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Historical supplier unit costs from POs' })
  supplierPriceHistory(
    @CurrentUser() user: IAuthUser,
    @Query('variantId') variantId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.supplierPriceHistory(user.tenantId, variantId, supplierId, limit ? parseInt(limit, 10) : 50);
  }

  @Get('tyre-brands')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Best selling tyre brands by revenue' })
  tyreBrandSales(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.tyreBrandSales(user.tenantId, start, end, branchId);
  }

  @Get('service-revenue')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Workshop service revenue breakdown' })
  serviceRevenue(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.serviceRevenueReport(user.tenantId, start, end, branchId);
  }

  @Get('technician-performance')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Technician job count and revenue' })
  technicianPerformance(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.reportsService.technicianPerformanceReport(user.tenantId, start, end);
  }
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
