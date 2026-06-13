import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '@/prisma/prisma.service';
import { IAuthUser } from '@/common/decorators/current-user.decorator';

@Injectable()
export class BranchContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{ user?: IAuthUser; headers: Record<string, string | string[] | undefined> }>();
    const user = req.user;
    const headerBranch = req.headers['x-branch-id'];
    const branchId = Array.isArray(headerBranch) ? headerBranch[0] : headerBranch;

    if (user?.tenantId && branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId: user.tenantId, isActive: true },
        select: { id: true },
      });
      if (branch) user.branchId = branch.id;
    }

    return next.handle();
  }
}
