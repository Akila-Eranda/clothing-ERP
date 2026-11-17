/**
 * Tenant ownership checks for ids that arrive from a request body (S-F8).
 *
 * ProductVariant has no tenantId column: a variant belongs to a tenant through product.tenantId.
 * `missingIds` is pure; the assert* helpers run one indexed read on the given Prisma client / tx.
 */
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

type VariantClient = Pick<Prisma.TransactionClient, 'productVariant'>;

/** Requested ids (deduplicated, in request order) that are not in `found`. Empty / non-string ids count as missing. */
export function missingIds(requested: readonly unknown[], found: Iterable<string>): string[] {
  const have = new Set(found);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of requested) {
    const id = String(raw ?? '');
    if (seen.has(id)) continue;
    seen.add(id);
    if (typeof raw !== 'string' || !raw || !have.has(raw)) out.push(id);
  }
  return out;
}

/**
 * Every variant id must belong to a product of `tenantId`; otherwise 400 and nothing is written.
 * The message has the same shape as the Quick GRN check ("Variant not found: <id>").
 */
export async function assertVariantsInTenant(
  db: VariantClient,
  tenantId: string,
  variantIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(variantIds)];
  if (!unique.length) return;
  if (unique.some((id) => typeof id !== 'string' || !id)) {
    throw new BadRequestException('Variant not found');
  }
  const rows = await db.productVariant.findMany({
    where: { id: { in: unique }, product: { tenantId } },
    select: { id: true },
  });
  const missing = missingIds(unique, rows.map((r) => r.id));
  if (missing.length) throw new BadRequestException(`Variant not found: ${missing[0]}`);
}
