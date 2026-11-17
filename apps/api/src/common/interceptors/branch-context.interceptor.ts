import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '@/prisma/prisma.service';
import { IAuthUser } from '@/common/decorators/current-user.decorator';
import { canSwitchBranches } from '@/shared/branch-scope.helper';

type BranchInput = { key: string; id: string };
type BranchQuery = {
  branch: {
    findMany(args: {
      where: { id: { in: string[] }; tenantId: string };
      select: { id: true; isActive: true };
    }): Promise<{ id: string; isActive: boolean }[]>;
  };
};

function isBranchIdKey(key: string): boolean {
  const normalized = normalizeBranchInputKey(key);
  return normalized.endsWith('branchid') || normalized.endsWith('branchids');
}

function normalizeBranchInputKey(key: string): string {
  return key.replace(/[_-]/g, '').toLowerCase();
}

function collectBranchInputs(value: unknown, key: string, inputs: BranchInput[]): void {
  if (isBranchIdKey(key)) {
    if (value === null || value === undefined || value === '') return;
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (typeof item !== 'string' || !item.trim()) {
        throw new BadRequestException('Branch IDs must be non-empty strings.');
      }
      inputs.push({ key, id: item });
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectBranchInputs(item, '', inputs);
  } else if (value && typeof value === 'object') {
    for (const [childKey, childValue] of Object.entries(value)) {
      collectBranchInputs(childValue, childKey, inputs);
    }
  }
}

@Injectable()
export class BranchContextInterceptor implements NestInterceptor {
  constructor(@Inject(PrismaService) private readonly prisma: BranchQuery) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{
      user?: IAuthUser;
      method?: string;
      originalUrl?: string;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: unknown;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const user = req.user;
    const headerBranch = req.headers['x-branch-id'];
    const headerBranches = Array.isArray(headerBranch) ? headerBranch : headerBranch ? [headerBranch] : [];

    if (new Set(headerBranches).size > 1) {
      throw new BadRequestException('Only one branch may be selected per request.');
    }

    if (user?.tenantId) {
      const inputs: BranchInput[] = [];
      for (const [key, value] of Object.entries(req.params ?? {})) {
        collectBranchInputs(value, key, inputs);
      }
      for (const [key, value] of Object.entries(req.query ?? {})) {
        collectBranchInputs(value, key, inputs);
      }
      collectBranchInputs(req.body, '', inputs);
      for (const branchId of headerBranches) {
        inputs.push({ key: 'branchId', id: branchId });
      }

      const branchIds = [...new Set(inputs.map((input) => input.id))];
      const branches = branchIds.length
        ? await this.prisma.branch.findMany({
            where: { id: { in: branchIds }, tenantId: user.tenantId },
            select: { id: true, isActive: true },
          })
        : [];
      const branchesById = new Map(branches.map((branch) => [branch.id, branch]));
      if (branchesById.size !== branchIds.length) {
        throw new ForbiddenException('Branch is not available in this tenant.');
      }

      const maySwitchBranches = canSwitchBranches(user.roles);
      const isTransferCreate =
        req.method?.toUpperCase() === 'POST' &&
        /\/inventory\/transfers\/?$/.test((req.originalUrl ?? '').split('?')[0]);
      const sourceBranchIds = inputs
        .filter((input) => normalizeBranchInputKey(input.key) === 'frombranchid')
        .map((input) => input.id);

      if (!maySwitchBranches) {
        for (const input of inputs) {
          if (!user.branchId) {
            throw new ForbiddenException('You can only access your assigned branch.');
          }
          const isTransferDestination =
            isTransferCreate &&
            normalizeBranchInputKey(input.key) === 'tobranchid' &&
            sourceBranchIds.length > 0 &&
            sourceBranchIds.every((sourceBranchId) => sourceBranchId === user.branchId);
          if (input.id !== user.branchId && !isTransferDestination) {
            throw new ForbiddenException('You can only access your assigned branch.');
          }
        }
      }

      const selectedBranchId = headerBranches[0];
      if (selectedBranchId && !branchesById.get(selectedBranchId)?.isActive) {
        throw new ForbiddenException('Selected branch is inactive.');
      }
      if (selectedBranchId && maySwitchBranches) {
        user.branchId = selectedBranchId;
      }
    }

    return next.handle();
  }
}
