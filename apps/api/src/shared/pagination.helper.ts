import { IPaginatedResult } from '@/common/interfaces/paginated.interface';

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): IPaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export function getPaginationArgs(page: number | string = 1, limit: number | string = 20): { skip: number; take: number } {
  const p = Math.max(1, parseInt(String(page), 10) || 1);
  const l = Math.min(20000, Math.max(1, parseInt(String(limit), 10) || 20));
  return { skip: (p - 1) * l, take: l };
}

export function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Record<string, 'asc' | 'desc'> {
  if (!sortBy) return { createdAt: 'desc' };
  return { [sortBy]: sortOrder };
}
