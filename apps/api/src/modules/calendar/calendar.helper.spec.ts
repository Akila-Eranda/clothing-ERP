import {
  bumpBadge,
  emptyBadges,
  monthRange,
  parseDateKey,
  round2,
  sumBadgeTotal,
  toDateKey,
} from './calendar.helper';

describe('Phase 8 Business Calendar — accuracy', () => {
  describe('Date keys', () => {
    it('formats and parses UTC day bounds', () => {
      expect(toDateKey(new Date('2026-07-16T12:00:00.000Z'))).toBe('2026-07-16');
      const { start, end } = parseDateKey('2026-07-16');
      expect(start.toISOString()).toBe('2026-07-16T00:00:00.000Z');
      expect(end.toISOString()).toBe('2026-07-16T23:59:59.999Z');
    });

    it('builds full month range', () => {
      const { start, end } = monthRange(2026, 7);
      expect(toDateKey(start)).toBe('2026-07-01');
      expect(toDateKey(end)).toBe('2026-07-31');
    });
  });

  describe('Badge aggregation', () => {
    it('bumps and sums category markers', () => {
      const map: Record<string, ReturnType<typeof emptyBadges>> = {};
      bumpBadge(map, '2026-07-16', 'chequesDue', 2);
      bumpBadge(map, '2026-07-16', 'meetings', 1);
      bumpBadge(map, '2026-07-16', 'sales', 5000);
      expect(map['2026-07-16'].chequesDue).toBe(2);
      expect(map['2026-07-16'].meetings).toBe(1);
      expect(sumBadgeTotal(map['2026-07-16'])).toBe(1 + 2 + 1); // sales flag + cheques + meetings
    });

    it('rounds money consistently', () => {
      expect(round2(10.005)).toBe(10.01);
      expect(round2(10.004)).toBe(10);
    });
  });
});
