import { BadRequestException } from '@nestjs/common';

export type CustomerHistoryCursor = {
  createdAt: Date;
  id: string;
};

const HISTORY_ID_PREFIXES = ['SALE:', 'WALLET:', 'CREDIT:', 'RETURN:'];

export function encodeCustomerHistoryCursor(cursor: CustomerHistoryCursor): string {
  return Buffer.from(JSON.stringify({
    createdAt: cursor.createdAt.toISOString(),
    id: cursor.id,
  })).toString('base64url');
}

export function decodeCustomerHistoryCursor(value?: string): CustomerHistoryCursor | null {
  if (!value) return null;

  try {
    const json = Buffer.from(value, 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid cursor');

    const cursor = parsed as { createdAt?: unknown; id?: unknown };
    const id = cursor.id;
    if (
      typeof cursor.createdAt !== 'string'
      || typeof id !== 'string'
      || !HISTORY_ID_PREFIXES.some((prefix) => id.startsWith(prefix))
    ) {
      throw new Error('Invalid cursor');
    }

    const createdAt = new Date(cursor.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('Invalid cursor');
    return { createdAt, id };
  } catch {
    throw new BadRequestException('Invalid customer history cursor');
  }
}
