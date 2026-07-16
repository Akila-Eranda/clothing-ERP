import { BadRequestException } from '@nestjs/common';
import {
  allocateFromLots,
  classifyExpiry,
  daysUntilExpiry,
  expiryReportStatus,
  filterSellableLots,
  isLotExpired,
  normalizeBlockExpired,
  startOfLocalDay,
  type LotLike,
} from './inventory-lots.helper';

describe('Phase 9 Expiry Management — batch expiry validation', () => {
  const d = (iso: string) => new Date(iso);
  // Freeze "today" so day-boundary tests are stable
  const now = d('2026-07-16T10:00:00');

  const expiredLot: LotLike = {
    id: 'lot-expired',
    quantity: 10,
    reservedQty: 0,
    batchNumber: 'EXP-1',
    expiryDate: d('2026-07-10'),
    receivedAt: d('2026-01-01'),
  };

  const expiresToday: LotLike = {
    id: 'lot-today',
    quantity: 6,
    reservedQty: 0,
    batchNumber: 'TODAY-1',
    expiryDate: d('2026-07-16'),
    receivedAt: d('2026-02-01'),
  };

  const nearLot: LotLike = {
    id: 'lot-near',
    quantity: 8,
    reservedQty: 2,
    batchNumber: 'NEAR-1',
    expiryDate: d('2026-07-20'),
    receivedAt: d('2026-03-01'),
  };

  const laterLot: LotLike = {
    id: 'lot-later',
    quantity: 12,
    reservedQty: 0,
    batchNumber: 'LATER-1',
    expiryDate: d('2026-12-01'),
    receivedAt: d('2026-04-01'),
  };

  const noExpiryLot: LotLike = {
    id: 'lot-none',
    quantity: 5,
    reservedQty: 0,
    batchNumber: 'NONE-1',
    expiryDate: null,
    receivedAt: d('2026-05-01'),
  };

  describe('day-boundary expiry rules', () => {
    it('treats expiry date as sellable through that calendar day', () => {
      expect(isLotExpired(expiresToday.expiryDate, now)).toBe(false);
      expect(daysUntilExpiry(expiresToday.expiryDate!, now)).toBe(0);
      expect(classifyExpiry(expiresToday.expiryDate, now)).toBe('7d');
    });

    it('marks yesterday as expired', () => {
      expect(isLotExpired(d('2026-07-15'), now)).toBe(true);
      expect(daysUntilExpiry(d('2026-07-15'), now)).toBe(-1);
      expect(classifyExpiry(d('2026-07-15'), now)).toBe('expired');
    });

    it('null expiry is never expired', () => {
      expect(isLotExpired(null, now)).toBe(false);
      expect(classifyExpiry(null, now)).toBeNull();
      expect(expiryReportStatus(null, now)).toBe('NO_EXPIRY');
    });

    it('startOfLocalDay zeros clock fields', () => {
      const s = startOfLocalDay(now);
      expect(s.getHours()).toBe(0);
      expect(s.getMinutes()).toBe(0);
      expect(s.getDate()).toBe(16);
    });
  });

  describe('POS Block Expired filtering', () => {
    it('excludes expired lots when blockExpired is on', () => {
      const sellable = filterSellableLots(
        [expiredLot, expiresToday, nearLot, laterLot, noExpiryLot],
        true,
        now,
      );
      expect(sellable.map((l) => l.id)).toEqual([
        'lot-today',
        'lot-near',
        'lot-later',
        'lot-none',
      ]);
    });

    it('keeps expired lots when blockExpired is off', () => {
      const all = filterSellableLots([expiredLot, nearLot], false, now);
      expect(all).toHaveLength(2);
    });

    it('normalizeBlockExpired defaults to ON', () => {
      expect(normalizeBlockExpired(undefined)).toBe(true);
      expect(normalizeBlockExpired(null)).toBe(true);
      expect(normalizeBlockExpired(false)).toBe(false);
      expect(normalizeBlockExpired('false')).toBe(false);
    });
  });

  describe('FEFO sales with expiry block', () => {
    it('FEFO consumes earliest non-expired lot first', () => {
      const sellable = filterSellableLots(
        [expiredLot, laterLot, nearLot, expiresToday],
        true,
        now,
      );
      // Manual FEFO order: earliest expiry among sellable
      const ordered = [...sellable].sort((a, b) => {
        const ae = a.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
        const be = b.expiryDate?.getTime() ?? Number.POSITIVE_INFINITY;
        return ae - be;
      });
      const plan = allocateFromLots(ordered, 10);
      expect(plan[0].lotId).toBe('lot-today');
      expect(plan[0].quantity).toBe(6);
      expect(plan[1].lotId).toBe('lot-near');
      expect(plan[1].quantity).toBe(4); // 8 on hand, 2 reserved → 6 avail, take 4
      expect(plan.every((p) => !isLotExpired(p.expiryDate, now))).toBe(true);
    });

    it('does not allocate from expired lots when filtered', () => {
      const sellable = filterSellableLots([expiredLot], true, now);
      expect(allocateFromLots(sellable, 5)).toEqual([]);
    });

    it('still allocates expired when block is off (disposal path)', () => {
      const plan = allocateFromLots([expiredLot, nearLot], 5);
      expect(plan[0].lotId).toBe('lot-expired');
      expect(plan[0].quantity).toBe(5);
    });
  });

  describe('report status buckets', () => {
    it('classifies EXPIRED / CRITICAL / WARNING / WATCH', () => {
      expect(expiryReportStatus(d('2026-07-01'), now)).toBe('EXPIRED');
      expect(expiryReportStatus(d('2026-07-18'), now)).toBe('CRITICAL');
      expect(expiryReportStatus(d('2026-08-01'), now)).toBe('WARNING');
      expect(expiryReportStatus(d('2026-09-01'), now)).toBe('WATCH');
    });
  });

  describe('preferred expired lot rejection message shape', () => {
    it('builds a clear POS Block Expired error for expired preferred lot', () => {
      const lot = expiredLot;
      const label = lot.batchNumber || lot.id.slice(0, 8);
      const err = new BadRequestException(
        `Cannot sell expired lot ${label}: expiry ${lot.expiryDate?.toISOString().slice(0, 10) ?? 'unknown'}`,
      );
      expect(err.message).toContain('Cannot sell expired lot EXP-1');
      expect(err.message).toContain('2026-07-10');
    });
  });
});
