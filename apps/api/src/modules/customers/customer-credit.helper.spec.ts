import {
  allocatePaymentFifo,
  buildCustomerLedger,
  chargeStatus,
  collectionRecoveryRate,
  computeChargeDueDate,
  creditAvailable,
  creditTxnSignedDelta,
  daysPastDue,
  generateInstallmentSchedule,
  round2,
  splitCreditPayment,
} from './customer-credit.helper';

describe('Phase 7 Customer Credit — workflows', () => {
  describe('Limit & availability', () => {
    it('computes available credit', () => {
      expect(creditAvailable(50000, 12000)).toBe(38000);
      expect(creditAvailable(0, 0)).toBe(0);
      expect(creditAvailable(1000, 1000)).toBe(0);
    });

    it('splits payment into AR + advance', () => {
      expect(splitCreditPayment(1500, 1000)).toEqual({ applied: 1000, advance: 500 });
      expect(splitCreditPayment(800, 1000)).toEqual({ applied: 800, advance: 0 });
      expect(splitCreditPayment(500, 0)).toEqual({ applied: 0, advance: 500 });
    });
  });

  describe('Due dates', () => {
    it('adds credit days to charge date', () => {
      const due = computeChargeDueDate(new Date('2026-07-01T00:00:00.000Z'), 30);
      expect(due.toISOString().slice(0, 10)).toBe('2026-07-31');
    });

    it('classifies overdue days', () => {
      expect(daysPastDue(new Date('2026-07-01'), new Date('2026-07-16'))).toBe(15);
      expect(daysPastDue(new Date('2026-07-20'), new Date('2026-07-16'))).toBe(-4);
    });
  });

  describe('Payment schedule', () => {
    it('splits into equal installments with remainder on last', () => {
      const lines = generateInstallmentSchedule(1000, 3, new Date('2026-07-01T00:00:00.000Z'), 30);
      expect(lines).toHaveLength(3);
      expect(round2(lines.reduce((s, l) => s + l.amount, 0))).toBe(1000);
      expect(lines[0].dueDate.toISOString().slice(0, 10)).toBe('2026-07-01');
      expect(lines[1].dueDate.toISOString().slice(0, 10)).toBe('2026-07-31');
      expect(lines[2].sequence).toBe(3);
    });
  });

  describe('Payment allocation FIFO', () => {
    it('pays oldest due charges first', () => {
      const alloc = allocatePaymentFifo(
        [
          { id: 'a', amount: 500, paidAmount: 0, dueDate: new Date('2026-06-01') },
          { id: 'b', amount: 800, paidAmount: 100, dueDate: new Date('2026-07-01') },
        ],
        600,
      );
      expect(alloc[0]).toEqual({ chargeId: 'a', applied: 500, remainingOnCharge: 0 });
      expect(alloc[1].chargeId).toBe('b');
      expect(alloc[1].applied).toBe(100);
      expect(alloc[1].remainingOnCharge).toBe(600);
    });

    it('updates charge status correctly', () => {
      expect(chargeStatus(500, 0)).toBe('OPEN');
      expect(chargeStatus(500, 200)).toBe('PARTIAL');
      expect(chargeStatus(500, 500)).toBe('PAID');
    });
  });

  describe('Collection metrics', () => {
    it('computes recovery rate', () => {
      expect(collectionRecoveryRate(100000, 25000)).toBe(25);
      expect(collectionRecoveryRate(0, 0)).toBe(0);
      expect(collectionRecoveryRate(0, 100)).toBe(100);
    });
  });

  describe('Customer ledger', () => {
    it('signs charge/payment/credit-note deltas', () => {
      expect(creditTxnSignedDelta('CHARGE', 1000)).toBe(1000);
      expect(creditTxnSignedDelta('PAYMENT', 400)).toBe(-400);
      expect(creditTxnSignedDelta('CREDIT_NOTE', 100)).toBe(-100);
    });

    it('builds running balance statement for a date range', () => {
      const txns = [
        { id: '1', type: 'CHARGE', amount: 1000, createdAt: new Date('2026-06-01') },
        { id: '2', type: 'PAYMENT', amount: 300, createdAt: new Date('2026-06-15') },
        { id: '3', type: 'CHARGE', amount: 500, createdAt: new Date('2026-07-05') },
        { id: '4', type: 'CREDIT_NOTE', amount: 100, createdAt: new Date('2026-07-10') },
      ];
      const led = buildCustomerLedger(txns, {
        from: new Date('2026-07-01'),
        to: new Date('2026-07-31T23:59:59'),
      });
      expect(led.opening).toBe(700); // 1000 - 300
      expect(led.entries).toHaveLength(2);
      expect(led.closing).toBe(1100); // 700 + 500 - 100
    });
  });
});
