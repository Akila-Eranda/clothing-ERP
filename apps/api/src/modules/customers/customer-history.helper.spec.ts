import { BadRequestException } from '@nestjs/common';
import { decodeCustomerHistoryCursor, encodeCustomerHistoryCursor } from './customer-history.helper';

describe('customer history cursor', () => {
  it('round-trips an entry timestamp and stable source id', () => {
    const cursor = { createdAt: new Date('2026-11-13T10:15:30.000Z'), id: 'SALE:sale-1' };

    expect(decodeCustomerHistoryCursor(encodeCustomerHistoryCursor(cursor))).toEqual(cursor);
  });

  it.each([
    'not-a-cursor',
    Buffer.from(JSON.stringify({ createdAt: '2026-11-13T10:00:00.000Z', id: 'OTHER:1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'SALE:1' })).toString('base64url'),
  ])('rejects malformed or unsupported cursor data', (value) => {
    expect(() => decodeCustomerHistoryCursor(value)).toThrow(BadRequestException);
  });
});
