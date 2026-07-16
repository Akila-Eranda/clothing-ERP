/** Pure procurement cycle helpers — unit-tested without DB. */

export type PoReceiveLine = {
  orderedQty: number;
  receivedQty: number;
  thisReceive: number;
};

export type PoReceiveResult = {
  nextReceived: number[];
  status: 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'UNCHANGED';
  fullyReceived: boolean;
};

export function applyPartialReceive(lines: PoReceiveLine[]): PoReceiveResult {
  const nextReceived = lines.map((l) => {
    if (l.thisReceive < 0) throw new Error('Receive qty cannot be negative');
    const next = l.receivedQty + l.thisReceive;
    if (next > l.orderedQty) {
      throw new Error(`Cannot receive beyond ordered qty (${l.orderedQty})`);
    }
    return next;
  });

  const fullyReceived = nextReceived.every((n, i) => n >= lines[i].orderedQty);
  const anyReceived = nextReceived.some((n, i) => n > lines[i].receivedQty || lines[i].receivedQty > 0);

  if (fullyReceived) {
    return { nextReceived, status: 'RECEIVED', fullyReceived: true };
  }
  if (anyReceived || nextReceived.some((n) => n > 0)) {
    return { nextReceived, status: 'PARTIALLY_RECEIVED', fullyReceived: false };
  }
  return { nextReceived, status: 'UNCHANGED', fullyReceived: false };
}

export type InvoicePayResult = {
  paidAmount: number;
  status: 'POSTED' | 'PARTIALLY_PAID' | 'PAID';
};

export function applyInvoicePayment(
  total: number,
  alreadyPaid: number,
  payment: number,
): InvoicePayResult {
  if (payment <= 0) throw new Error('Payment must be positive');
  const due = Math.max(0, total - alreadyPaid);
  if (payment > due + 0.01) throw new Error('Payment exceeds invoice balance');
  const paidAmount = alreadyPaid + payment;
  if (paidAmount >= total - 0.01) return { paidAmount: total, status: 'PAID' };
  if (paidAmount > 0) return { paidAmount, status: 'PARTIALLY_PAID' };
  return { paidAmount, status: 'POSTED' };
}

export function nextDocNumber(prefix: string, seq: number, year = new Date().getFullYear()) {
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

export function canConvertPurchaseRequest(status: string) {
  return status === 'APPROVED';
}

export function canReceiveAgainstPo(status: string) {
  return !['DRAFT', 'PENDING_APPROVAL', 'CANCELLED'].includes(status);
}

export type ProcurementCycleStep =
  | 'PR_CREATED'
  | 'PR_APPROVED'
  | 'PO_CREATED'
  | 'PO_APPROVED'
  | 'GRN_POSTED'
  | 'INVOICE_POSTED'
  | 'PAYMENT_RECORDED'
  | 'RETURN_POSTED';

export function procurementCycleProgress(done: ProcurementCycleStep[]) {
  const order: ProcurementCycleStep[] = [
    'PR_CREATED',
    'PR_APPROVED',
    'PO_CREATED',
    'PO_APPROVED',
    'GRN_POSTED',
    'INVOICE_POSTED',
    'PAYMENT_RECORDED',
  ];
  const set = new Set(done);
  const completed = order.filter((s) => set.has(s));
  const next = order.find((s) => !set.has(s)) ?? null;
  return {
    completed,
    next,
    percent: Math.round((completed.length / order.length) * 100),
    hasReturn: set.has('RETURN_POSTED'),
  };
}
