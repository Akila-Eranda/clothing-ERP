import { AccountingPostingService } from './accounting-posting.service';

describe('AccountingPostingService linked supplier invoices', () => {
  function serviceWith(db: {
    supplierInvoice: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  }) {
    return new AccountingPostingService(db as never, undefined as never, undefined as never);
  }

  it('defers a linked invoice when the GRN journal has not posted yet', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      journalEntry: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const db = {
      supplierInvoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          tenantId: 'tenant-1',
          goodsReceiptId: 'grn-1',
          status: 'POSTED',
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await expect(serviceWith(db).postSupplierInvoice('invoice-1', 'tenant-1')).resolves.toEqual({
      skipped: true,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('reuses the GRN journal when the linked invoice retries after GRN posting', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      journalEntry: { findFirst: jest.fn().mockResolvedValue({ id: 'journal-1', entryNumber: 'JE-1' }) },
    };
    const db = {
      supplierInvoice: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'invoice-1',
          tenantId: 'tenant-1',
          goodsReceiptId: 'grn-1',
          status: 'POSTED',
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    await expect(serviceWith(db).postSupplierInvoice('invoice-1', 'tenant-1')).resolves.toEqual({
      skipped: true,
      journalId: 'journal-1',
      entryNumber: 'JE-1',
    });
  });
});
