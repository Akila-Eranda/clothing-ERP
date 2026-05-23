import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { IJwtPayload } from '@/common/interfaces/jwt-payload.interface';

export interface IAuthUser extends IJwtPayload {
  id: string;
  tenantId: string;
  branchId?: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof IAuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user: IAuthUser }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
