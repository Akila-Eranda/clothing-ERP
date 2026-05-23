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

export function getPaginationArgs(page = 1, limit = 20): { skip: number; take: number } {
  const skip = (page - 1) * limit;
  return { skip, take: limit };
}

export function buildOrderBy(
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc',
): Record<string, 'asc' | 'desc'> {
  if (!sortBy) return { createdAt: 'desc' };
  return { [sortBy]: sortOrder };
}
