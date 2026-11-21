import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { normalizeSearch, textSearch } from '@/shared/search.helper';

/**
 * Header global search (search audit, 6 Nov 2026).
 *
 * - Always scoped to the signed-in user's tenant (from the JWT; never from the query).
 * - Each group is returned only if the user holds the read permission for it, with the same rule
 *   as PermissionsGuard (only platform SUPER_ADMIN bypasses).
 * - At least 2 characters; a few results per group; same matching as the list endpoints
 *   (trimmed, case-insensitive, %/_ literal, every word must match).
 */
export const GLOBAL_SEARCH_MIN_LENGTH = 2;
export const GLOBAL_SEARCH_PER_GROUP = 5;

export class GlobalSearchQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) q?: string;
}

export type GlobalSearchItem = { id: string; title: string; subtitle?: string; href: string };
export type GlobalSearchGroup = { type: 'products' | 'customers' | 'suppliers' | 'sales'; label: string; items: GlobalSearchItem[] };

export function canRead(user: Pick<IAuthUser, 'roles' | 'permissions'>, resource: string): boolean {
  if (user.roles?.includes('SUPER_ADMIN')) return true;
  return (user.permissions ?? []).includes(`${resource}:read`);
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: IAuthUser, raw: unknown): Promise<{ query: string; groups: GlobalSearchGroup[] }> {
    const query = normalizeSearch(raw);
    if (query.length < GLOBAL_SEARCH_MIN_LENGTH) return { query, groups: [] };
    const tenantId = user.tenantId;
    const take = GLOBAL_SEARCH_PER_GROUP;
    const tasks: Promise<GlobalSearchGroup>[] = [];

    if (canRead(user, 'products')) {
      tasks.push(
        this.prisma.product
          .findMany({
            where: {
              tenantId,
              ...textSearch(query, ['name', 'sku', 'barcode', (f) => ({ variants: { some: { isActive: true, OR: [{ sku: f }, { barcode: f }, { name: f }] } } })]),
            },
            select: { id: true, name: true, sku: true, status: true },
            orderBy: { name: 'asc' },
            take,
          })
          .then((rows) => ({
            type: 'products' as const,
            label: 'Products',
            items: rows.map((p) => ({ id: p.id, title: p.name, subtitle: [p.sku, p.status === 'ACTIVE' ? '' : p.status.toLowerCase()].filter(Boolean).join(' · '), href: `/products/${p.id}` })),
          })),
      );
    }
    if (canRead(user, 'customers')) {
      tasks.push(
        this.prisma.customer
          .findMany({
            where: { tenantId, ...textSearch(query, ['firstName', 'lastName', 'phone', 'email', 'code']) },
            select: { id: true, firstName: true, lastName: true, phone: true },
            orderBy: { firstName: 'asc' },
            take,
          })
          .then((rows) => ({
            type: 'customers' as const,
            label: 'Customers',
            items: rows.map((c) => {
              const name = `${c.firstName} ${c.lastName ?? ''}`.trim();
              return { id: c.id, title: name, subtitle: c.phone, href: `/customers?search=${encodeURIComponent(c.phone || name)}` };
            }),
          })),
      );
    }
    if (canRead(user, 'suppliers')) {
      tasks.push(
        this.prisma.supplier
          .findMany({
            where: { tenantId, ...textSearch(query, ['name', 'phone', 'email', 'contactPerson', 'code']) },
            select: { id: true, name: true, phone: true },
            orderBy: { name: 'asc' },
            take,
          })
          .then((rows) => ({
            type: 'suppliers' as const,
            label: 'Suppliers',
            items: rows.map((s) => ({ id: s.id, title: s.name, subtitle: s.phone, href: `/suppliers/${s.id}` })),
          })),
      );
    }
    if (canRead(user, 'sales')) {
      tasks.push(
        this.prisma.sale
          .findMany({
            where: { tenantId, ...textSearch(query, ['invoiceNumber', 'customer.firstName', 'customer.lastName', 'customer.phone']) },
            select: { id: true, invoiceNumber: true, total: true, invoiceDate: true, customer: { select: { firstName: true, lastName: true } } },
            orderBy: { invoiceDate: 'desc' },
            take,
          })
          .then((rows) => ({
            type: 'sales' as const,
            label: 'Sales & invoices',
            items: rows.map((s) => ({
              id: s.id,
              title: s.invoiceNumber,
              subtitle: [s.customer ? `${s.customer.firstName} ${s.customer.lastName ?? ''}`.trim() : '', `LKR ${Number(s.total).toLocaleString('en-LK')}`].filter(Boolean).join(' · '),
              href: `/sales?search=${encodeURIComponent(s.invoiceNumber)}`,
            })),
          })),
      );
    }
    const groups = (await Promise.all(tasks)).filter((g) => g.items.length > 0);
    return { query, groups };
  }
}

@ApiTags('Search')
@ApiBearerAuth('access-token')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global search across products, customers, suppliers and sales (per permission)' })
  search(@CurrentUser() user: IAuthUser, @Query() query: GlobalSearchQueryDto) {
    return this.service.search(user, query.q);
  }
}

@Module({ controllers: [SearchController], providers: [SearchService] })
export class SearchModule {}
